/**
 * API Intelligence — Product Intelligence
 *
 * GET  /api/intelligence/products — Tendências e afinidade de produtos
 * POST /api/intelligence/products — Recalcular análise de produtos
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { ProductIntelligence } from '@/lib/services/product-intelligence';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabaseAuth = createAuthenticatedClient(token);
  const supabase = createServerSupabaseClient();

  const { data: { user }, error } = await supabaseAuth.auth.getUser();
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return { supabase, tenantId: profile.tenant_id };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { supabase, tenantId } = auth;
    const engine = new ProductIntelligence(supabase, tenantId);

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'trends'; // trends | affinity | client
    const clientId = searchParams.get('client_id');
    const limit = parseInt(searchParams.get('limit') || '20');

    if (type === 'client' && clientId) {
      const profile = await engine.getClientProfile(clientId);
      return NextResponse.json({ success: true, profile });
    }

    if (type === 'affinity') {
      const pairs = await engine.getAffinityPairs(limit);
      return NextResponse.json({
        success: true,
        affinity: pairs,
        total: pairs.length,
      });
    }

    // Default: trends
    const trends = await engine.getTrends(limit);

    // Separar por direção
    const growing = trends.filter(t => t.trend_direction === 'growing');
    const declining = trends.filter(t => t.trend_direction === 'declining');
    const topSellers = [...trends].sort((a, b) => b.total_revenue - a.total_revenue).slice(0, 10);

    return NextResponse.json({
      success: true,
      trends: {
        growing,
        declining,
        top_sellers: topSellers,
        total: trends.length,
      },
    });
  } catch (error) {
    console.error('Products GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { supabase, tenantId } = auth;
    const engine = new ProductIntelligence(supabase, tenantId);

    const report = await engine.analyze();

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Products POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
