import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { ContactCenterService } from '@/lib/services/contact-center.service';

/**
 * POST /api/contact-center/pull
 * Puxa a próxima conversa da fila para o agente autenticado.
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
      .select('tenant_id, role, accepting_chats, max_concurrent_chats, active_chats_count')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    // Verificar se agente pode receber mais chats
    if (!profile.accepting_chats) {
      return NextResponse.json(
        { error: 'Você não está aceitando novos chats' },
        { status: 400 }
      );
    }

    if ((profile.active_chats_count || 0) >= (profile.max_concurrent_chats || 5)) {
      return NextResponse.json(
        { error: 'Limite de chats simultâneos atingido' },
        { status: 400 }
      );
    }

    const service = new ContactCenterService(supabase, profile.tenant_id);
    const conversation = await service.pullNextConversation(user.id);

    if (!conversation) {
      return NextResponse.json({
        data: null,
        message: 'Nenhuma conversa na fila',
      });
    }

    return NextResponse.json({ data: conversation });
  } catch (error) {
    console.error('❌ POST /api/contact-center/pull error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
