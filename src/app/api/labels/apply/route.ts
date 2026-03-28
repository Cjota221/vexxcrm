import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * POST /api/labels/apply
 * Aplica uma etiqueta a uma conversa via Evolution API + salva local.
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

    // Aplicar via Evolution API
    const res = await fetch(`${evolutionUrl}/label/handleLabel/${tenant.evolution_instance}`, {
      method: 'PUT',
      headers: { 'apikey': evolutionKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        number: body.phone,
        labelId: body.labelId,
        action: 'add',
      }),
    });

    // Fallback: endpoint alternativo
    if (!res.ok) {
      await fetch(`${evolutionUrl}/chat/updateLabel/${tenant.evolution_instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: body.phone,
          labelId: body.labelId,
          action: 'add',
        }),
      });
    }

    // Buscar nome da etiqueta
    const { data: label } = await supabase
      .from('whatsapp_labels')
      .select('nome')
      .eq('tenant_id', profile.tenant_id)
      .eq('whatsapp_label_id', body.labelId)
      .single();

    // Salvar localmente
    await supabase.from('conversation_labels').upsert({
      tenant_id: profile.tenant_id,
      phone: body.phone,
      label_id: body.labelId,
      label_name: label?.nome || null,
    }, { onConflict: 'tenant_id,phone,label_id' });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
