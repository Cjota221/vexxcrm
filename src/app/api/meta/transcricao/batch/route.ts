/**
 * POST /api/meta/transcricao/batch
 * Processa vídeos pendentes de transcrição sequencialmente (1 por vez).
 *
 * Dois casos tratados:
 * A) Status pendente/erro → download + transcrição + classificação completa
 * B) Status concluida mas classificacao IS NULL → só re-classifica (sem re-baixar o vídeo)
 *    Isso ocorre quando Groq funcionou mas a classificação com OpenAI falhou antes da migração.
 */
export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { processarCriativo, classificarCriativo } from '@/lib/services/meta-transcricao.service';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const body = await req.json().catch(() => ({})) as { limite?: number };
  const limite = Math.min(body.limite ?? 5, 10);

  // Desbloquear itens travados em "processando" há mais de 10 minutos
  const dezMinutosAtras = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  await supabase
    .from('ad_creatives')
    .update({ transcricao_status: 'pendente', transcricao_erro: 'Desbloqueado após travamento' })
    .eq('tenant_id', tenantId)
    .eq('transcricao_status', 'processando')
    .lt('updated_at', dezMinutosAtras);

  const resultados: Array<{ id: string; nome: string; ok: boolean; modo: string; erro?: string }> = [];

  // ── Caso A: pendentes/erros — pipeline completo (download + transcrição + classificação)
  const { data: pendentes } = await supabase
    .from('ad_creatives')
    .select('id, nome')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'video')
    .in('transcricao_status', ['pendente', 'erro'])
    .order('transcricao_status', { ascending: true })
    .limit(limite);

  for (const criativo of (pendentes ?? [])) {
    console.log(`[Batch A] Transcrição completa: ${criativo.nome}`);
    const r = await processarCriativo(criativo.id, tenantId);
    resultados.push({ id: criativo.id, nome: criativo.nome, ok: r.ok, modo: 'completo', erro: r.erro });
  }

  // ── Caso B: já transcritos mas sem classificação (OpenAI falhou antes)
  // Só busca se ainda temos slots disponíveis no limite
  const slotsRestantes = limite - (pendentes?.length ?? 0);
  if (slotsRestantes > 0) {
    const { data: semClassificacao } = await supabase
      .from('ad_creatives')
      .select('id, nome, transcricao')
      .eq('tenant_id', tenantId)
      .eq('tipo', 'video')
      .eq('transcricao_status', 'concluida')
      .is('classificacao', null)
      .not('transcricao', 'is', null)
      .order('created_at', { ascending: false })
      .limit(slotsRestantes);

    for (const criativo of (semClassificacao ?? [])) {
      console.log(`[Batch B] Só classificação: ${criativo.nome}`);
      const r = await classificarCriativo(criativo.transcricao!, criativo.nome);
      if (r.ok && r.classificacao) {
        await supabase
          .from('ad_creatives')
          .update({ classificacao: r.classificacao, classificacao_modelo: 'claude-haiku-4-5' })
          .eq('id', criativo.id)
          .eq('tenant_id', tenantId);
        resultados.push({ id: criativo.id, nome: criativo.nome, ok: true, modo: 'so_classificacao' });
      } else {
        resultados.push({ id: criativo.id, nome: criativo.nome, ok: false, modo: 'so_classificacao', erro: r.erro });
      }
    }
  }

  if (!resultados.length) {
    return NextResponse.json({ ok: true, processados: 0, mensagem: 'Nenhum vídeo pendente ou sem classificação' });
  }

  const sucessos = resultados.filter(r => r.ok).length;

  return NextResponse.json({
    ok: true,
    processados: sucessos,
    falhas: resultados.filter(r => !r.ok).length,
    total: resultados.length,
    detalhes: resultados,
  });
}
