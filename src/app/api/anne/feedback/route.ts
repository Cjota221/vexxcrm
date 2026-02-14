import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { AnneIntelligenceService } from '@/lib/services/anne-intelligence';

/**
 * POST /api/anne/feedback
 * Registra feedback pós-execução de uma análise.
 *
 * Body: { analysis_id: string, score: number (1-5), notes?: string }
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
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const { analysis_id, score, notes } = await request.json();

    if (!analysis_id || score === undefined) {
      return NextResponse.json(
        { error: 'analysis_id e score são obrigatórios' },
        { status: 400 }
      );
    }

    if (score < 1 || score > 5) {
      return NextResponse.json(
        { error: 'score deve ser entre 1 e 5' },
        { status: 400 }
      );
    }

    const service = new AnneIntelligenceService(supabase, profile.tenant_id);
    const success = await service.submitFeedback(analysis_id, score, notes);

    return NextResponse.json({
      data: { success },
      message: success ? 'Feedback registrado' : 'Erro ao registrar feedback',
    });
  } catch (error) {
    console.error('❌ POST /api/anne/feedback error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
