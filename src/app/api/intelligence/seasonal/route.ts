/**
 * API Intelligence — Seasonal Analysis
 *
 * GET  /api/intelligence/seasonal — Insights sazonais calculados
 * POST /api/intelligence/seasonal — Recalcular análise sazonal
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { SeasonalAnalyzer } from '@/lib/services/seasonal-analyzer';

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
    const analyzer = new SeasonalAnalyzer(supabase, tenantId);

    const { searchParams } = new URL(request.url);
    const year = searchParams.get('year');
    const clientId = searchParams.get('client_id');

    // Se pediu perfil de um cliente específico
    if (clientId) {
      const profile = await analyzer.getClientProfile(clientId);
      return NextResponse.json({
        success: true,
        profile,
      });
    }

    // Insights sazonais do ano
    const targetYear = year ? parseInt(year) : new Date().getFullYear();
    const insights = await analyzer.getInsights(targetYear);

    // Stats básicos
    const { count: seasonalBuyers } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('seasonal_buyer', true);

    const { count: totalClients } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId);

    return NextResponse.json({
      success: true,
      insights,
      stats: {
        seasonal_buyers: seasonalBuyers || 0,
        total_clients: totalClients || 0,
        coverage_pct: totalClients ? parseFloat(((seasonalBuyers || 0) / totalClients * 100).toFixed(1)) : 0,
      },
      year: targetYear,
    });
  } catch (error) {
    console.error('Seasonal GET error:', error);
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
    const analyzer = new SeasonalAnalyzer(supabase, tenantId);

    const report = await analyzer.analyze();

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (error) {
    console.error('Seasonal POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
