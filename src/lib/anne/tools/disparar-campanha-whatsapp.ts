/**
 * Tool: disparar_campanha_whatsapp
 *
 * Envia mensagem WhatsApp individual para uma lista de clientes via Evolution API.
 * Registra cada envio na tabela campanha_disparos.
 *
 * Delay obrigatório de 1,5s entre envios para evitar bloqueio no WhatsApp.
 * Usar SOMENTE após confirmação explícita da operadora.
 *
 * Limites de segurança:
 *  - MAX_CLIENTES_POR_DISPARO = 200 (evita timeout serverless)
 *  - Telefone obrigatoriamente ≥ 10 dígitos (evita envio para número inválido)
 *  - dry_run = true simula o disparo sem enviar nada
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import {
  getTenantEvolutionConfig,
  sendTextMessage,
} from '@/lib/services/evolution.service';

/** Limite máximo de clientes por disparo. Acima disso lance erro claro. */
const MAX_CLIENTES_POR_DISPARO = 200;

export interface ClienteDisparo {
  id: string;
  nome: string;
  telefone: string;
}

export interface DispararCampanhaParams {
  clientes: ClienteDisparo[];
  mensagem_template: string;
  codigo_cupom: string;
  /** Se true, simula o disparo sem enviar nenhuma mensagem. Útil para testes. */
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
  /** Presente quando dry_run = true */
  simulated?: boolean;
}

const DELAY_ENTRE_ENVIOS_MS = 1_500;

/** Template padrão de frete grátis. Aceita {nome} e {codigo_cupom}. */
export const TEMPLATE_FRETE_GRATIS = `Oi, {nome}! 🎉

A C4 tem um presente especial pra você: *FRETE GRÁTIS* no seu próximo pedido!

Use o cupom: *{codigo_cupom}*

Aproveite enquanto é válido! 🛍️
Qualquer dúvida é só chamar. 😊`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function aplicarTemplate(template: string, nome: string, codigoCupom: string): string {
  return template
    .replace(/\{nome\}/g, nome)
    .replace(/\{codigo_cupom\}/g, codigoCupom);
}

function isTelefoneValido(telefone: string): boolean {
  const digits = telefone.replace(/\D/g, '');
  return digits.length >= 10;
}

export async function dispararCampanhaWhatsApp(
  params: DispararCampanhaParams,
  tenantId: string,
  campanhaNome = 'frete-gratis'
): Promise<DispararCampanhaResult> {
  const { clientes, mensagem_template, codigo_cupom, dry_run = false } = params;

  // ── Hard cap: evita timeout serverless em listas muito grandes ──────────
  if (clientes.length > MAX_CLIENTES_POR_DISPARO) {
    throw new Error(
      `Limite de ${MAX_CLIENTES_POR_DISPARO} clientes por disparo. ` +
      `Lista recebida: ${clientes.length} clientes. ` +
      `Divida em lotes menores e dispare em etapas.`
    );
  }

  // ── Modo simulação (dry run) ─────────────────────────────────────────────
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

  const detalhes: DetalheEnvio[] = [];
  let enviados = 0;
  let erros = 0;

  for (let i = 0; i < clientes.length; i++) {
    const cliente = clientes[i];
    const telefone = cliente.telefone.replace(/\D/g, '');

    // ── Validação de telefone ─────────────────────────────────────────────
    if (!isTelefoneValido(telefone)) {
      erros++;
      const motivo = `Telefone inválido: "${cliente.telefone}" (mínimo 10 dígitos)`;
      console.warn(`[Campanha] ${motivo} — cliente: ${cliente.nome}`);

      supabase.from('campanha_disparos').insert({
        tenant_id: tenantId,
        cliente_id: cliente.id,
        telefone: cliente.telefone,
        mensagem: null,
        status: 'erro',
        motivo,
        campanha_nome: campanhaNome,
      }).then(({ error }) => {
        if (error) console.error('[Campanha] Erro ao salvar log:', error.message);
      });

      detalhes.push({ nome: cliente.nome, telefone: cliente.telefone, status: 'erro', motivo });
      continue;
    }

    const mensagem = aplicarTemplate(mensagem_template, cliente.nome, codigo_cupom);
    let status: 'enviado' | 'erro' = 'enviado';
    let motivo: string | undefined;

    try {
      await sendTextMessage(evolutionConfig, telefone, mensagem);
      enviados++;
    } catch (err) {
      erros++;
      status = 'erro';
      motivo = err instanceof Error ? err.message : 'Erro desconhecido na Evolution API';
      console.error(`[Campanha] Falha ao enviar para ${cliente.nome} (${telefone}):`, motivo);
    }

    // Registrar no banco (fire-and-forget, não bloqueia o loop)
    supabase
      .from('campanha_disparos')
      .insert({
        tenant_id: tenantId,
        cliente_id: cliente.id,
        telefone,
        mensagem,
        status,
        motivo: motivo ?? null,
        campanha_nome: campanhaNome,
      })
      .then(({ error }) => {
        if (error) console.error('[Campanha] Erro ao salvar log:', error.message);
      });

    detalhes.push({ nome: cliente.nome, telefone, status, ...(motivo ? { motivo } : {}) });

    // Log de progresso a cada 10 envios
    if ((i + 1) % 10 === 0 || i === clientes.length - 1) {
      console.log(JSON.stringify({
        event: 'campanha_progress',
        campanha_nome: campanhaNome,
        enviados: i + 1,
        total: clientes.length,
        percentual: Math.round(((i + 1) / clientes.length) * 100),
      }));
    }

    // Delay obrigatório entre envios (exceto no último)
    if (i < clientes.length - 1) {
      await sleep(DELAY_ENTRE_ENVIOS_MS);
    }
  }

  return { enviados, erros, detalhes };
}
