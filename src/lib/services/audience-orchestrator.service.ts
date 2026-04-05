// ORQUESTRADOR DE PÚBLICOS — Usa Jarvis para criar públicos Meta Ads.
// Fluxo: Jarvis analisa CRM + configura → Meta API cria → banco salva.
// REGRA: nunca executa ações sem salvar log completo em ai_analysis_runs.

import { createServerSupabaseClient } from '@/lib/supabase';
import { jarvisAnalisarParaPublicos } from './jarvis-trafego.service';
import { criarPublicoMeta, criarPublicoRemarketing } from './meta-audiences.service';
import type { PublicoCriado } from './meta-audiences.service';

/* ─── Tipos ──────────────────────────────────────────────────────────────────── */

export interface CriacaoPublicosResult {
  publicos: PublicoCriado[];
  criados: number;
  erros: number;
  analise_resumo: string;
  duracao_ms: number;
}

export type EtapaCallback = (etapa: string) => void;

/* ─── Carregar config Meta do tenant ─────────────────────────────────────────── */

async function loadMetaConfig(tenantId: string): Promise<{
  token: string;
  accountId: string;
  pageId: string | null;
  openaiKey: string | null;
} | null> {
  const supabase = createServerSupabaseClient();
  const { data } = await supabase
    .from('ai_provider_config')
    .select('meta_access_token, meta_ad_account_id, meta_page_id, analytics_api_key, strategy_api_key')
    .eq('tenant_id', tenantId)
    .single();

  if (!data?.meta_access_token) return null;

  const accountId = (data.meta_ad_account_id || '').replace('act_', '');
  if (!accountId) return null;

  return {
    token: data.meta_access_token,
    accountId,
    pageId: data.meta_page_id || process.env.META_PAGE_ID || null,
    openaiKey: data.analytics_api_key || data.strategy_api_key || null,
  };
}

/* ─── Função principal ───────────────────────────────────────────────────────── */

/**
 * Cria públicos segmentados automaticamente usando o Time de IAs.
 *
 * @param tenantId  - ID do tenant
 * @param onEtapa   - Callback de progresso (opcional)
 */
export async function criarPublicosComIA(
  tenantId: string,
  onEtapa?: EtapaCallback,
): Promise<CriacaoPublicosResult> {
  const inicio = Date.now();
  const supabase = createServerSupabaseClient();

  // 1. Carregar config
  const config = await loadMetaConfig(tenantId);
  if (!config) {
    throw new Error('Meta Ads não configurado. Configure o token em Time de IAs.');
  }

  const publicosCriados: PublicoCriado[] = [];

  // 2. Jarvis analisa CRM e gera configurações de públicos (1 passo)
  onEtapa?.('jose');
  console.log('[PÚBLICOS] Jarvis analisando dados do CRM e configurando públicos...');
  const jarvisConfig = await jarvisAnalisarParaPublicos(
    tenantId,
    {},  // dadosCRM — pode ser enriquecido futuramente
    config.openaiKey || undefined,
  );
  console.log(`[PÚBLICOS] Jarvis configurou ${jarvisConfig.publicos_configurados.length} públicos`);

  // 3. Criar cada público via Meta API em sequência
  onEtapa?.('meta');
  for (const publico of jarvisConfig.publicos_configurados) {
    console.log(`[PÚBLICOS] Criando: ${publico.nome_meta}...`);

    try {
      const criado = await criarPublicoMeta(
        config.accountId,
        config.token,
        tenantId,
        publico,
        publico.justificativa_jose,
      );
      publicosCriados.push(criado);
      console.log(`[PÚBLICOS] ✓ ${publico.nome_meta} — ${criado.tamanho_estimado}`);
    } catch (err) {
      console.error(`[PÚBLICOS] ✗ ${publico.nome_meta}:`, err);
      publicosCriados.push({
        id: crypto.randomUUID(),
        nome: publico.nome_meta,
        tipo: 'interesse',
        tamanho_estimado: '-',
        erro: String(err),
        status: 'falhou',
      });
    }
  }

  // 5. Criar público de remarketing (se pageId disponível)
  if (config.pageId) {
    onEtapa?.('remarketing');
    console.log('[PÚBLICOS] Criando público de remarketing...');
    try {
      const remarketing = await criarPublicoRemarketing(
        config.accountId,
        config.token,
        tenantId,
        config.pageId,
        30,
      );
      publicosCriados.push(remarketing);
    } catch (err) {
      console.error('[PÚBLICOS] Remarketing falhou:', err);
      publicosCriados.push({
        id: crypto.randomUUID(),
        nome: 'CJ — Remarketing Engajamento 30d',
        tipo: 'remarketing',
        tamanho_estimado: '-',
        erro: String(err),
        status: 'falhou',
      });
    }
  }

  const duracao = Date.now() - inicio;
  const criados = publicosCriados.filter(p => p.status === 'criado').length;
  const erros = publicosCriados.filter(p => p.status === 'falhou').length;

  // 6. Salvar log completo
  await supabase.from('ai_analysis_runs').insert({
    tenant_id: tenantId,
    status: erros === publicosCriados.length ? 'failed' : 'completed',
    analyst_output: jarvisConfig,
    strategist_output: null,
    actions_generated: criados,
    duration_ms: duracao,
    error_message: erros > 0 ? `${erros} público(s) falharam` : null,
  }).then(({ error: logErr }) => {
    if (logErr) console.warn('[PÚBLICOS] Erro ao salvar log:', logErr.message);
  });

  console.log(`[PÚBLICOS] Concluído: ${criados} criados, ${erros} erros em ${duracao}ms`);

  return {
    publicos: publicosCriados,
    criados,
    erros,
    analise_resumo: jarvisConfig.analise_resumo,
    duracao_ms: duracao,
  };
}
