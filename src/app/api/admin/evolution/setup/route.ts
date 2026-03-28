import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * POST /api/admin/evolution/setup
 * Configura webhook da Evolution API com TODOS os eventos necessários.
 * Também faz sync inicial de etiquetas e grupos.
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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://vexxcrm.netlify.app';
    const webhookUrl = `${appUrl}/api/webhooks/evolution?tenant_id=${tenant.id}`;

    // 1. Configurar webhook com todos os eventos
    const webhookRes = await fetch(`${evolutionUrl}/webhook/set/${tenant.evolution_instance}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey, 'Content-Type': 'application/json' },
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
          'CHATS_UPSERT',
          'CHATS_UPDATE',
        ],
      }),
    });
    const webhookResult = await webhookRes.json();

    // 2. Verificar configuração atual
    const verifyRes = await fetch(`${evolutionUrl}/webhook/find/${tenant.evolution_instance}`, {
      headers: { 'apikey': evolutionKey },
    });
    const currentConfig = verifyRes.ok ? await verifyRes.json() : null;

    return NextResponse.json({
      ok: webhookRes.ok,
      message: webhookRes.ok
        ? `Webhook configurado para ${tenant.evolution_instance} com 16 eventos`
        : 'Erro ao configurar webhook',
      webhookUrl,
      setupResult: webhookResult,
      currentConfig,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * GET /api/admin/evolution/setup
 * Verifica configuração atual do webhook.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, evolution_instance')
      .eq('id', profile.tenant_id)
      .single();

    if (!tenant?.evolution_instance) {
      return NextResponse.json({ error: 'Instância não configurada' }, { status: 400 });
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_GLOBAL_KEY;

    const res = await fetch(`${evolutionUrl}/webhook/find/${tenant.evolution_instance}`, {
      headers: { 'apikey': evolutionKey! },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Evolution: ${res.status}` }, { status: 502 });
    }

    return NextResponse.json({ config: await res.json() });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
