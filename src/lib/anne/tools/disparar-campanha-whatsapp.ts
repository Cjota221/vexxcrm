/**
 * Tool: disparar_campanha_whatsapp
 *
 * Envia mensagem WhatsApp para uma lista de clientes via Evolution API.
 * Antes de disparar, cria um registro na tabela campaigns para acompanhamento.
 *
 * Regras anti-ban:
 *  - 15s de delay entre cada envio
 *  - 60s de pausa a cada 10 contatos enviados
 *
 * Usar SOMENTE após confirmação explícita da operadora E após ela aprovar
 * o texto final da mensagem.
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  getTenantEvolutionConfig,
  sendTextMessage,
} from '@/lib/services/evolution.service';

const MAX_CLIENTES_POR_DISPARO = 200;

/** 15 segundos entre cada envio (anti-ban) */
const DELAY_ENTRE_ENVIOS_MS = 15_000;
/** Pausa de 60 segundos a cada N contatos enviados */
const PAUSA_A_CADA_N = 10;
const PAUSA_LONGA_MS = 60_000;

export interface ClienteDisparo {
  id: string;
  nome: string;
  telefone: string;
}

export interface DispararCampanhaParams {
  clientes: ClienteDisparo[];
  mensagem_template: string;
  codigo_cupom: string;
  /** Link do site a ser incluído na mensagem via {link} */
  link?: string;
  /** Se true, simula o disparo sem enviar nada */
  dry_run?: boolean;
}

export interface DetalheEnvio {
  nome: string;
  telefone: string;
  status: 'enviado' | 'erro' | 'simulado';
  motivo?: string;
}

export interface DispararCampanhaResult {
  enviados: number;
  erros: number;
  detalhes: DetalheEnvio[];
  campanha_id?: string;
  simulated?: boolean;
}

/** Template padrão de frete grátis. Variáveis: {nome}, {codigo_cupom}, {link} */
export const TEMPLATE_FRETE_GRATIS = `Oi, {nome}! 🎉

A C4 tem um presente especial pra você: *FRETE GRÁTIS* no seu próximo pedido!

Use o cupom: *{codigo_cupom}*

{link}

Aproveite enquanto é válido! 🛍️
Qualquer dúvida é só chamar. 😊`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function aplicarTemplate(
  template: string,
  nome: string,
  codigoCupom: string,
  link?: string,
): string {
  return template
    .replace(/\{nome\}/g, nome)
    .replace(/\{codigo_cupom\}/g, codigoCupom)
    .replace(/\{link\}/g, link ?? '')
    .trim();
}

function isTelefoneValido(telefone: string): boolean {
  return telefone.replace(/\D/g, '').length >= 10;
}

export async function dispararCampanhaWhatsApp(
  params: DispararCampanhaParams,
  tenantId: string,
  campanhaNome = 'campanha-anne',
): Promise<DispararCampanhaResult> {
  const { clientes, mensagem_template, codigo_cupom, link, dry_run = false } = params;

  if (clientes.length > MAX_CLIENTES_POR_DISPARO) {
    throw new Error(
      `Limite de ${MAX_CLIENTES_POR_DISPARO} clientes por disparo. ` +
      `Lista: ${clientes.length}. Divida em lotes menores.`,
    );
  }

  // ── Modo simulação ───────────────────────────────────────────────────────
  if (dry_run) {
    return {
      enviados: 0,
      erros: 0,
      simulated: true,
      detalhes: clientes.map((c) => ({
        nome: c.nome,
        telefone: c.telefone.replace(/\D/g, ''),
        status: 'simulado' as const,
        motivo: 'dry_run ativo — nenhuma mensagem enviada',
      })),
    };
  }

  const supabase = createServerSupabaseClient();
  const evolutionConfig = getTenantEvolutionConfig(tenantId);

  // ── Criar campanha para acompanhamento ───────────────────────────────────
  let campanha_id: string | undefined;
  const mensagemExemplo = aplicarTemplate(
    mensagem_template,
    clientes[0]?.nome ?? 'Cliente',
    codigo_cupom,
    link,
  );

  const { data: campanha } = await supabase
    .from('campaigns')
    .insert({
      tenant_id:    tenantId,
      name:         campanhaNome,
      description:  `Disparado pela Anne — ${clientes.length} contatos`,
      type:         'broadcast',
      status:       'running',
      target_count: clientes.length,
      sent_count:   0,
      failed_count: 0,
      started_at:   new Date().toISOString(),
      messages:     [{ type: 'text', content: mensagemExemplo }],
    })
    .select('id')
    .single();

  campanha_id = campanha?.id;

  const detalhes: DetalheEnvio[] = [];
  let enviados = 0;
  let erros = 0;

  for (let i = 0; i < clientes.length; i++) {
    const cliente = clientes[i];
    const telefone = cliente.telefone.replace(/\D/g, '');

    if (!isTelefoneValido(telefone)) {
      erros++;
      const motivo = `Telefone inválido: "${cliente.telefone}"`;
      detalhes.push({ nome: cliente.nome, telefone: cliente.telefone, status: 'erro', motivo });

      supabase.from('campanha_disparos').insert({
        tenant_id: tenantId, cliente_id: cliente.id, telefone: cliente.telefone,
        mensagem: null, status: 'erro', motivo, campanha_nome: campanhaNome,
      }).then(({ error }) => { if (error) console.error('[Campanha] log erro:', error.message); });
      continue;
    }

    const mensagem = aplicarTemplate(mensagem_template, cliente.nome, codigo_cupom, link);
    let status: 'enviado' | 'erro' = 'enviado';
    let motivo: string | undefined;

    try {
      await sendTextMessage(evolutionConfig, telefone, mensagem);
      enviados++;
    } catch (err) {
      erros++;
      status = 'erro';
      motivo = err instanceof Error ? err.message : 'Erro Evolution API';
    }

    supabase.from('campanha_disparos').insert({
      tenant_id: tenantId, cliente_id: cliente.id, telefone, mensagem,
      status, motivo: motivo ?? null, campanha_nome: campanhaNome,
    }).then(({ error }) => { if (error) console.error('[Campanha] log disparo:', error.message); });

    detalhes.push({ nome: cliente.nome, telefone, status, ...(motivo ? { motivo } : {}) });

    // Progresso a cada 10
    if ((i + 1) % PAUSA_A_CADA_N === 0) {
      console.log(JSON.stringify({
        event: 'campanha_progress', campanha_nome: campanhaNome,
        enviados: i + 1, total: clientes.length,
      }));
    }

    if (i < clientes.length - 1) {
      // Pausa longa a cada PAUSA_A_CADA_N envios
      if ((i + 1) % PAUSA_A_CADA_N === 0) {
        await sleep(PAUSA_LONGA_MS);
      } else {
        await sleep(DELAY_ENTRE_ENVIOS_MS);
      }
    }
  }

  // Atualizar campanha com totais finais
  if (campanha_id) {
    supabase.from('campaigns').update({
      status:       erros === clientes.length ? 'cancelled' : 'completed',
      sent_count:   enviados,
      failed_count: erros,
      completed_at: new Date().toISOString(),
    }).eq('id', campanha_id).then(({ error }) => {
      if (error) console.error('[Campanha] update status:', error.message);
    });
  }

  return { enviados, erros, detalhes, campanha_id };
}
