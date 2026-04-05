/**
 * POST /api/meta/transcricao/batch
 * Processa vídeos pendentes de transcrição sequencialmente (1 por vez).
 *
 * Fixes aplicados:
 * - Sequencial em vez de Promise.allSettled paralelo (evita rate limits e OOM)
 * - Inclui itens travados em "processando" há mais de 10 minutos (crash recovery)
 * - Limite de 5 itens por chamada (evitar timeout da função serverless)
 * - maxDuration = 300s para suportar múltiplos vídeos
 */
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { processarCriativo } from '@/lib/services/meta-transcricao.service';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  // Limite por chamada — 5 itens para não estourar os 300s
  const body = await req.json().catch(() => ({})) as { limite?: number };
  const limite = Math.min(body.limite ?? 5, 10);

  // Desbloquear itens travados em "processando" há mais de 10 minutos
  // (causados por crashes de função serverless anterior)
  const dezMinutosAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase
    .from('ad_creatives')
    .update({ transcricao_status: 'pendente', transcricao_erro: 'Desbloqueado após travamento' })
    .eq('tenant_id', tenantId)
    .eq('transcricao_status', 'processando')
    .lt('updated_at', dezMinutosAtras);

  // Buscar pendentes + erros para retry (ordem: pendentes primeiro, erros depois)
  const { data: pendentes } = await supabase
    .from('ad_creatives')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'video')
    .in('transcricao_status', ['pendente', 'erro'])
    .order('transcricao_status', { ascending: true }) // 'erro' < 'pendente' alfabeticamente → pendentes primeiro
    .limit(limite);

  if (!pendentes?.length) {
    return NextResponse.json({ ok: true, processados: 0, mensagem: 'Nenhum vídeo pendente' });
  }

  // Processar sequencialmente — 1 por vez para evitar rate limits e timeout
  const resultados: Array<{ id: string; nome: string; ok: boolean; erro?: string }> = [];

  for (const criativo of pendentes) {
    console.log(`[Batch Transcrição] Processando: ${criativo.nome} (${criativo.id})`);
    const resultado = await processarCriativo(criativo.id, tenantId);
    resultados.push({ id: criativo.id, nome: criativo.nome, ok: resultado.ok, erro: resultado.erro });

    if (!resultado.ok) {
      console.warn(`[Batch Transcrição] Falhou: ${criativo.nome} — ${resultado.erro}`);
    }
  }

  const sucessos = resultados.filter(r => r.ok).length;
  const falhas = resultados.filter(r => !r.ok);

  return NextResponse.json({
    ok: true,
    processados: sucessos,
    falhas: falhas.length,
    total: pendentes.length,
    detalhes: resultados,
  });
}
