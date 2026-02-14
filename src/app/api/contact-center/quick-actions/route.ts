import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { ContactCenterService } from '@/lib/services/contact-center.service';

/**
 * GET /api/contact-center/quick-actions
 * Lista quick actions disponíveis.
 *
 * POST /api/contact-center/quick-actions
 * Executa uma quick action.
 * Body: { conversation_id: string, action_slug: string }
 */
export async function GET(request: NextRequest) {
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
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const service = new ContactCenterService(supabase, profile.tenant_id);
    const actions = await service.getQuickActions();

    return NextResponse.json({ data: actions });
  } catch (error) {
    console.error('❌ GET /api/contact-center/quick-actions error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

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
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const { conversation_id, action_slug } = await request.json();

    if (!conversation_id || !action_slug) {
      return NextResponse.json(
        { error: 'conversation_id e action_slug são obrigatórios' },
        { status: 400 }
      );
    }

    const service = new ContactCenterService(supabase, profile.tenant_id);
    const result = await service.executeQuickAction(conversation_id, action_slug);

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('❌ POST /api/contact-center/quick-actions error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
