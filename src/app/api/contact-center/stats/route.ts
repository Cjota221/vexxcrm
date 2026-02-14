import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { ContactCenterService } from '@/lib/services/contact-center.service';

/**
 * GET /api/contact-center/stats
 * Estatísticas do agente + visão geral das filas.
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
      .select('tenant_id, is_online, accepting_chats, active_chats_count, max_concurrent_chats')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const service = new ContactCenterService(supabase, profile.tenant_id);
    const agentStats = await service.getAgentStats(user.id);

    return NextResponse.json({
      data: {
        agent: {
          is_online: profile.is_online,
          accepting_chats: profile.accepting_chats,
          active_chats: profile.active_chats_count || 0,
          max_chats: profile.max_concurrent_chats || 5,
          ...agentStats,
        },
      },
    });
  } catch (error) {
    console.error('❌ GET /api/contact-center/stats error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
