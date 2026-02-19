import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/v2/campanhas/estimate
 *
 * Calcula a estimativa de alcance de uma campanha com base nos filtros
 * antes de criar a campanha. Usado pelo EmbeddedCampaignPanel no step 2.
 *
 * Body:
 *   - filtros.tags_kanban: string[]  — colunas do Kanban para filtrar
 *   - filtros.score_min?: number     — score mínimo da Anne (0-1)
 *   - filtros.tags?: string[]        — tags adicionais de cliente
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const body = await request.json();
    const filtros = body?.filtros ?? {};
    const { tags_kanban = [], score_min, tags = [] } = filtros as {
      tags_kanban?: string[];
      score_min?: number;
      tags?: string[];
    };

    // ── Construir query de contagens ─────────────────────────────
    let query = supabase
      .from('clients')
      .select('id, name, phone, kanban_stage, anne_score', { count: 'exact' })
      .eq('tenant_id', tenantId)
      .not('phone', 'is', null)
      .neq('phone', '');

    // Filtrar por estágios Kanban
    if (tags_kanban.length > 0) {
      query = query.in('kanban_stage', tags_kanban);
    }

    // Filtrar por score mínimo da Anne
    if (typeof score_min === 'number' && score_min > 0) {
      query = query.gte('anne_score', score_min);
    }

    // Filtrar por tags adicionais
    if (tags.length > 0) {
      query = query.overlaps('tags', tags);
    }

    const { data: contatos, count, error } = await query.limit(5);

    if (error) throw error;

    const total = count ?? 0;

    // ── Estimativa de tempo e custo ──────────────────────────────
    // Baseado nos defaults do motor anti-ban:
    // delay médio: (15000 + 45000) / 2 = 30s
    // cooloff a cada 20 msgs por 2min
    const DELAY_MEDIO_MS = 30_000;
    const COOLOFF_A_CADA = 20;
    const COOLOFF_DURACAO_MS = 120_000;

    const ciclos = total > 0 ? Math.floor(total / COOLOFF_A_CADA) : 0;
    const tempoTotalMs = total * DELAY_MEDIO_MS + ciclos * COOLOFF_DURACAO_MS;
    const tempoMinutos = Math.ceil(tempoTotalMs / 60_000);

    const formatTempo = (min: number) => {
      if (min < 60) return `~${min} min`;
      const h = Math.floor(min / 60);
      const m = min % 60;
      return m > 0 ? `~${h}h ${m}min` : `~${h}h`;
    };

    // Custo estimado (baseado em R$0,05 por mensagem — placeholder)
    const CUSTO_POR_MSG = 0.05;
    const custoTotal = total * CUSTO_POR_MSG;
    const estimativa_custo = total > 0
      ? `R$ ${custoTotal.toFixed(2).replace('.', ',')}`
      : 'R$ 0,00';

    // ── Warnings ─────────────────────────────────────────────────
    const warnings: string[] = [];

    if (total === 0) {
      warnings.push('Nenhum contato encontrado com esses filtros.');
    } else if (total > 1000) {
      warnings.push(`Campanha grande (${total.toLocaleString()} contatos). O disparo pode levar ${formatTempo(tempoMinutos)}.`);
    }

    if (tags_kanban.length === 0 && !score_min && tags.length === 0) {
      warnings.push('Nenhum filtro aplicado — será enviado para TODOS os contatos com telefone.');
    }

    // ── Preview de 5 contatos aleatórios ─────────────────────────
    const preview_contatos = (contatos ?? []).map(c => ({
      name: c.name || 'Sem nome',
      phone: c.phone,
    }));

    return NextResponse.json({
      total_destinatarios: total,
      estimativa_tempo: formatTempo(tempoMinutos),
      estimativa_custo,
      warnings,
      preview_contatos,
    });
  } catch (error: any) {
    console.error('[POST /api/v2/campanhas/estimate]', error);
    return NextResponse.json(
      { error: error.message || 'Erro interno' },
      { status: 500 }
    );
  }
}
