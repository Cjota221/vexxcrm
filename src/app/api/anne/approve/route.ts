import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { AnneIntelligenceService } from '@/lib/services/anne-intelligence';

/**
 * POST /api/anne/approve
 * Aprova ou rejeita uma análise da Anne.
 *
 * Body: { analysis_id: string, action: 'approve' | 'reject', reason?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
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

    const { analysis_id, action, reason } = await request.json();

    if (!analysis_id || !action) {
      return NextResponse.json(
        { error: 'analysis_id e action são obrigatórios' },
        { status: 400 }
      );
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'action deve ser "approve" ou "reject"' },
        { status: 400 }
      );
    }

    const service = new AnneIntelligenceService(supabase, profile.tenant_id);

    if (action === 'approve') {
      const result = await service.approveAnalysis(analysis_id, user.id);
      if (!result) {
        return NextResponse.json({ error: 'Análise não encontrada' }, { status: 404 });
      }
      return NextResponse.json({
        data: result,
        message: 'Análise aprovada e ação executada',
      });
    } else {
      const success = await service.rejectAnalysis(analysis_id, user.id, reason);
      return NextResponse.json({
        data: { success },
        message: success ? 'Análise rejeitada' : 'Erro ao rejeitar',
      });
    }
  } catch (error) {
    console.error('❌ POST /api/anne/approve error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
