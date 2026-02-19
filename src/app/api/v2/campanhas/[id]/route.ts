import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/**
 * GET /api/v2/campanhas/[id]
 * Retorna campanha + métricas de jobs
 */
export async function GET(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    const [{ data: campanha, error }, { data: metrics }] = await Promise.all([
      supabase
        .from('campaigns')
        .select('*')
        .eq('tenant_id', profile.tenant_id)
        .eq('id', id)
        .single(),
      supabase
        .from('campaign_jobs')
        .select('status')
        .eq('campanha_id', id),
    ]);

    if (error || !campanha) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    // Agrupa métricas por status
    const statusCounts = (metrics ?? []).reduce<Record<string, number>>((acc, j) => {
      acc[j.status] = (acc[j.status] ?? 0) + 1;
      return acc;
    }, {});

    return NextResponse.json({
      campanha,
      metricas: {
        total: (metrics ?? []).length,
        pendente: statusCounts.pendente ?? 0,
        enviado: statusCounts.enviado ?? 0,
        erro: statusCounts.erro ?? 0,
        cancelado: statusCounts.cancelado ?? 0,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
