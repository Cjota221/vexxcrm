import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { ContactCenterService } from '@/lib/services/contact-center.service';

/**
 * POST /api/contact-center/send-product
 * Gera mensagem formatada de produto para enviar no chat.
 *
 * Body: { conversation_id: string, product_id: string, include_price?: boolean, include_link?: boolean }
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

    const { conversation_id, product_id, include_price, include_link } = await request.json();

    if (!conversation_id || !product_id) {
      return NextResponse.json(
        { error: 'conversation_id e product_id são obrigatórios' },
        { status: 400 }
      );
    }

    const service = new ContactCenterService(supabase, profile.tenant_id);
    const message = await service.sendProductToChat(conversation_id, product_id, {
      includePrice: include_price,
      includeLink: include_link,
    });

    return NextResponse.json({ data: { message } });
  } catch (error) {
    console.error('❌ POST /api/contact-center/send-product error:', error);
    return NextResponse.json(
      { error: (error as Error).message || 'Erro interno' },
      { status: 500 }
    );
  }
}
