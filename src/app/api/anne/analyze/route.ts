import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { AnneIntelligenceService } from '@/lib/services/anne-intelligence';

/**
 * POST /api/anne/analyze
 * Executa análise inteligente.
 *
 * Body: { client_id?: string }  
 * - Se client_id: analisa um cliente específico
 * - Se omitido: executa batch em clientes relevantes
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, role')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const { client_id } = await request.json().catch(() => ({}));

    const service = new AnneIntelligenceService(supabase, profile.tenant_id);

    if (client_id) {
      // Análise individual
      const analyses = await service.analyzeClient(client_id);
      return NextResponse.json({
        data: analyses,
        message: `${analyses.length} análise(s) criada(s)`,
      });
    } else {
      // Batch (admin/owner only)
      if (profile.role !== 'owner' && profile.role !== 'admin') {
        return NextResponse.json(
          { error: 'Apenas admins podem rodar análise em batch' },
          { status: 403 }
        );
      }

      const result = await service.analyzeBatch();
      return NextResponse.json({ data: result });
    }
  } catch (error) {
    console.error('❌ POST /api/anne/analyze error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * GET /api/anne/analyze
 * Lista análises pendentes com filtros opcionais.
 *
 * Query: ?type=churn_risk&urgency=critical&limit=20
 */
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as string | undefined;
    const urgency = searchParams.get('urgency') as string | undefined;
    const limit = parseInt(searchParams.get('limit') || '50');

    const service = new AnneIntelligenceService(supabase, profile.tenant_id);
    const analyses = await service.getPendingAnalyses({
      type: type as 'churn_risk' | undefined,
      urgency: urgency as 'critical' | undefined,
      limit,
    });

    // Também retornar stats
    const stats = await service.getStats();

    return NextResponse.json({ data: { analyses, stats } });
  } catch (error) {
    console.error('❌ GET /api/anne/analyze error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
