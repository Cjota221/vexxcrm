/**
 * Agente Orquestrador de Tráfego
 *
 * Recebe uma instrução em linguagem natural (ex: "Temos R$50/dia. Sobe campanhas para frio e WhatsApp.")
 * e executa autonomamente: distribui orçamento, escolhe criativos e cria campanhas no Meta.
 */

import { createServerSupabaseClient } from '@/lib/supabase';
import { resolverTokenMeta } from './meta-token.service';
import {
  type TipoCampanha,
  type ConfiguracaoCriativo,
  distribuirOrcamento,
  criarCampanhaCompleta,
} from './meta-adset-creator.service';

/* ─── Tipos ──────────────────────────────────────────────────────────────────── */

export interface AgenteLog {
  passo: number;
  titulo: string;
  detalhe: string;
  status: 'ok' | 'erro' | 'info';
}

export interface CampanhaCriada {
  tipo: TipoCampanha;
  nome: string;
  campaignId: string;
  adsetId: string;
  adId: string;
  orcamentoReais: number;
}

export interface AgenteResultado {
  logs: AgenteLog[];
  campanhasCriadas: CampanhaCriada[];
  erros: string[];
  resumo: string;
}

/* ─── Parser de instrução ────────────────────────────────────────────────────── */

function parsearInstrucao(instrucao: string): { orcamento: number; tipos: TipoCampanha[] } {
  const texto = instrucao.toLowerCase();

  // Extrair orçamento: "R$50", "50 reais", "50/dia", "100,00"
  const matchOrcamento = texto.match(/r\$\s*([\d.,]+)|(\d+[.,]\d+|\d+)\s*(?:reais|\/dia)/);
  let orcamento = 50; // padrão
  if (matchOrcamento) {
    const raw = (matchOrcamento[1] ?? matchOrcamento[2]).replace(',', '.');
    const parsed = parseFloat(raw);
    if (!isNaN(parsed) && parsed > 0) orcamento = parsed;
  }

  // Extrair tipos
  const tipos: TipoCampanha[] = [];
  if (texto.includes('frio'))    tipos.push('frio');
  if (texto.includes('quente'))  tipos.push('quente');
  if (texto.includes('whatsapp') || texto.includes('wpp') || texto.includes('zap')) {
    tipos.push('whatsapp');
  }
  if (tipos.length === 0) tipos.push('quente'); // padrão

  return { orcamento, tipos };
}

/* ─── Buscar criativo aprovado ───────────────────────────────────────────────── */

interface CriativoDb {
  id: string;
  tipo: string;
  meta_video_id: string | null;
  meta_image_hash: string | null;
  url_preview: string | null;
}

async function buscarCriativo(tenantId: string): Promise<CriativoDb | null> {
  const supabase = createServerSupabaseClient();
  const CAMPOS = 'id, tipo, meta_video_id, meta_image_hash, url_preview';

  // Preferir imagem (mais rápida de criar no Meta)
  const { data: imagem } = await supabase
    .from('ad_creatives')
    .select(CAMPOS)
    .eq('tenant_id', tenantId)
    .not('meta_image_hash', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (imagem) return imagem as CriativoDb;

  // Fallback: vídeo
  const { data: video } = await supabase
    .from('ad_creatives')
    .select(CAMPOS)
    .eq('tenant_id', tenantId)
    .not('meta_video_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return video as CriativoDb | null;
}

/* ─── Executar agente ────────────────────────────────────────────────────────── */

export async function executarAgente(
  tenantId: string,
  instrucao: string,
  pageId: string,
  whatsappNumber?: string,
): Promise<AgenteResultado> {
  const logs: AgenteLog[] = [];
  const campanhasCriadas: CampanhaCriada[] = [];
  const erros: string[] = [];
  let passo = 0;

  function log(titulo: string, detalhe: string, status: AgenteLog['status'] = 'info') {
    logs.push({ passo: ++passo, titulo, detalhe, status });
  }

  // 1. Analisar instrução
  const { orcamento, tipos } = parsearInstrucao(instrucao);
  log(
    'Instrução interpretada',
    `Orçamento total: R$${orcamento.toFixed(2)}/dia | Tipos: ${tipos.join(', ')}`,
    'info',
  );

  // 2. Verificar credenciais Meta
  let config: Awaited<ReturnType<typeof resolverTokenMeta>>;
  try {
    config = await resolverTokenMeta(tenantId);
    log('Credenciais Meta', `Conta: ${config.account_id ?? 'configurada'}`, 'ok');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('Credenciais Meta', `Erro: ${msg}`, 'erro');
    return { logs, campanhasCriadas, erros: [msg], resumo: 'Falha ao obter token Meta.' };
  }

  // 3. Buscar criativo
  const criativoDb = await buscarCriativo(tenantId);
  if (!criativoDb) {
    log('Criativo', 'Nenhum criativo com imagem ou vídeo aprovado encontrado.', 'erro');
    return {
      logs,
      campanhasCriadas,
      erros: ['Nenhum criativo disponível. Faça upload de um criativo antes de usar o agente.'],
      resumo: 'Sem criativo disponível.',
    };
  }
  log(
    'Criativo selecionado',
    `ID: ${criativoDb.id} | Tipo: ${criativoDb.tipo} | Hash/VideoId: ${criativoDb.meta_image_hash ?? criativoDb.meta_video_id ?? '—'}`,
    'ok',
  );

  // 4. Distribuir orçamento
  const distribuicao = distribuirOrcamento(orcamento, tipos);
  log(
    'Distribuição de orçamento',
    distribuicao.map(d => `${d.label}: R$${(d.orcamentoCentavos / 100).toFixed(2)}/dia`).join(' | '),
    'info',
  );

  // 5. Criar campanhas
  const data = new Date().toISOString().slice(0, 10);

  for (const { tipo, label, orcamentoCentavos } of distribuicao) {
    const nomeCampanha = `[AGENTE] ${label} — ${data}`;
    log(`Criando campanha ${label}`, `Nome: "${nomeCampanha}" | Orçamento: R$${(orcamentoCentavos / 100).toFixed(2)}/dia`, 'info');

    const cfgCriativo: ConfiguracaoCriativo = {
      tipo:           criativoDb.tipo as 'video' | 'imagem',
      metaVideoId:    criativoDb.meta_video_id ?? undefined,
      metaImageHash:  criativoDb.meta_image_hash ?? undefined,
      imageUrl:       criativoDb.url_preview ?? undefined,
      headline:       nomeCampanha,
      texto:          '',
      cta:            tipo === 'whatsapp' ? 'WHATSAPP_MESSAGE' : 'LEARN_MORE',
      pageId,
      whatsappNumber: tipo === 'whatsapp' ? whatsappNumber : undefined,
    };

    try {
      const resultado = await criarCampanhaCompleta(tenantId, {
        nome:            nomeCampanha,
        tipo,
        orcamentoDiario: orcamentoCentavos,
        paises:          ['BR'],
        idadeMin:        18,
        idadeMax:        65,
        criativo:        cfgCriativo,
      });

      campanhasCriadas.push({
        tipo,
        nome: nomeCampanha,
        campaignId: resultado.campaignId,
        adsetId:    resultado.adsetId,
        adId:       resultado.adId,
        orcamentoReais: orcamentoCentavos / 100,
      });

      log(
        `Campanha ${label} criada`,
        `Campaign: ${resultado.campaignId} | Adset: ${resultado.adsetId} | Ad: ${resultado.adId}`,
        'ok',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      erros.push(`${label}: ${msg}`);
      log(`Erro ao criar ${label}`, msg, 'erro');
    }
  }

  // 6. Resumo
  const totalCriadas = campanhasCriadas.length;
  const totalErros = erros.length;
  const resumo = totalCriadas > 0
    ? `${totalCriadas} campanha(s) criada(s) no Meta como PAUSADA(S) para revisão. ${totalErros > 0 ? `${totalErros} erro(s).` : 'Sem erros.'}`
    : `Nenhuma campanha criada. ${totalErros} erro(s) encontrados.`;

  log('Concluído', resumo, totalCriadas > 0 ? 'ok' : 'erro');

  return { logs, campanhasCriadas, erros, resumo };
}
