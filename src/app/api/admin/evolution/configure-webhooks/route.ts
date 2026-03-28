import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * POST /api/admin/evolution/configure-webhooks
 * Configura quais eventos a Evolution API deve enviar ao webhook do VEXX.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
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

    if (!evolutionUrl || !evolutionKey) {
      return NextResponse.json({ error: 'EVOLUTION_API_URL ou EVOLUTION_GLOBAL_KEY não configurados' }, { status: 500 });
    }

    const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://vexxcrm.netlify.app'}/api/webhooks/evolution?tenant_id=${tenant.id}`;

    const res = await fetch(`${evolutionUrl}/webhook/set/${tenant.evolution_instance}`, {
      method: 'POST',
      headers: {
        'apikey': evolutionKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'MESSAGES_DELETE',
          'MESSAGES_REACTION',
          'CONNECTION_UPDATE',
          'SEND_MESSAGE',
          'PRESENCE_UPDATE',
          'CONTACTS_UPSERT',
          'CONTACTS_UPDATE',
          'LABELS_EDIT',
          'LABELS_ASSOCIATION',
          'CALL',
          'GROUPS_UPSERT',
          'GROUP_PARTICIPANTS_UPDATE',
        ],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      return NextResponse.json({ error: data?.message || 'Erro ao configurar webhook', details: data }, { status: 502 });
    }

    return NextResponse.json({
      ok: true,
      message: `Webhook configurado para ${tenant.evolution_instance} com 14 eventos`,
      webhookUrl,
      events: 14,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
