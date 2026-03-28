import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * POST /api/labels/remove
 * Remove uma etiqueta de uma conversa via Evolution API + remove local.
 * Body: { phone: string, labelId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { phone: string; labelId: string };

    if (!body.phone || !body.labelId) {
      return NextResponse.json({ error: 'phone e labelId obrigatórios' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, evolution_instance')
      .eq('id', profile.tenant_id)
      .single();

    if (!tenant?.evolution_instance) {
      return NextResponse.json({ error: 'Instância Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_GLOBAL_KEY;

    // Remover via Evolution API
    const res = await fetch(`${evolutionUrl}/label/handleLabel/${tenant.evolution_instance}`, {
      method: 'PUT',
      headers: { 'apikey': evolutionKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: body.phone,
        labelId: body.labelId,
        action: 'remove',
      }),
    });

    // Fallback
    if (!res.ok) {
      await fetch(`${evolutionUrl}/chat/updateLabel/${tenant.evolution_instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: body.phone,
          labelId: body.labelId,
          action: 'remove',
        }),
      });
    }

    // Remover localmente
    await supabase
      .from('conversation_labels')
      .delete()
      .eq('tenant_id', profile.tenant_id)
      .eq('phone', body.phone)
      .eq('label_id', body.labelId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
