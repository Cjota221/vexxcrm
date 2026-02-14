import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { ContactCenterService } from '@/lib/services/contact-center.service';

/**
 * POST /api/contact-center/transfer
 * Transfere conversa para outro agente ou fila.
 *
 * Body: { conversation_id: string, to_profile_id?: string, to_queue_id?: string, reason?: string }
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

    const { conversation_id, to_profile_id, to_queue_id, reason } = await request.json();

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id é obrigatório' }, { status: 400 });
    }

    if (!to_profile_id && !to_queue_id) {
      return NextResponse.json(
        { error: 'Informe to_profile_id ou to_queue_id' },
        { status: 400 }
      );
    }

    const service = new ContactCenterService(supabase, profile.tenant_id);
    const success = await service.transferConversation(conversation_id, {
      to_profile_id,
      to_queue_id,
      reason,
    });

    return NextResponse.json({ data: { success } });
  } catch (error) {
    console.error('❌ POST /api/contact-center/transfer error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Erro interno' },
      { status: 500 }
    );
  }
}
