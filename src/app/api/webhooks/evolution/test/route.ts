import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantEvolutionConfig } from '@/lib/services/evolution.service';

/**
 * GET /api/webhooks/evolution/test
 *
 * Diagnóstico: verifica se o webhook está configurado corretamente
 * na Evolution API e retorna o status da instância.
 *
 * Uso: abrir no browser para ver o diagnóstico completo.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();

    // Buscar o primeiro tenant com instância configurada
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, evolution_instance')
      .not('evolution_instance', 'is', null)
      .limit(5);

    if (!tenants || tenants.length === 0) {
      return NextResponse.json({ error: 'Nenhum tenant com evolution_instance configurado' }, { status: 404 });
    }

    const results = [];

    for (const tenant of tenants) {
      try {
        const config = getTenantEvolutionConfig(tenant.id);

        // 1. Checar status da instância
        const statusRes = await fetch(
          `${config.apiUrl}/instance/fetchInstances`,
          { headers: { apikey: config.apiKey }, signal: AbortSignal.timeout(5000) }
        );
        const statusData = statusRes.ok ? await statusRes.json() : null;
        const instance = Array.isArray(statusData)
          ? statusData.find((i: Record<string, unknown>) => i.name === config.instanceName || (i.instance as Record<string, unknown>)?.instanceName === config.instanceName)
          : null;

        const connectionState = (instance as Record<string, unknown>)?.connectionStatus
          || ((instance as Record<string, unknown>)?.instance as Record<string, unknown>)?.state
          || 'unknown';

        // 2. Checar webhook configurado na instância
        let webhookConfig = null;
        let webhookError = null;
        try {
          const whRes = await fetch(
            `${config.apiUrl}/webhook/find/${config.instanceName}`,
            { headers: { apikey: config.apiKey }, signal: AbortSignal.timeout(5000) }
          );
          if (whRes.ok) {
            webhookConfig = await whRes.json();
          } else {
            webhookError = `HTTP ${whRes.status}`;
          }
        } catch (e) {
          webhookError = String(e);
        }

        // Determinar URL do webhook esperada
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL || request.headers.get('host');
        const expectedWebhookUrl = appUrl
          ? `https://${appUrl.replace('https://', '')}/api/webhooks/evolution?tenant_id=${tenant.id}`
          : `[APP_URL não configurada]/api/webhooks/evolution?tenant_id=${tenant.id}`;

        const webhookUrl = (webhookConfig as Record<string, unknown>)?.url as string || '';
        const webhookUrlOk = webhookUrl.includes('/api/webhooks/evolution');
        const webhookEnabled = (webhookConfig as Record<string, unknown>)?.enabled !== false;
        const webhookEvents: string[] = ((webhookConfig as Record<string, unknown>)?.events as string[]) || [];
        const hasMessagesUpsert = webhookEvents.includes('MESSAGES_UPSERT') || webhookEvents.includes('messages.upsert');

        results.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          instance_name: config.instanceName,
          connection_state: connectionState,
          webhook: {
            url_configurada: webhookUrl || '(vazia)',
            url_esperada: expectedWebhookUrl,
            url_ok: webhookUrlOk,
            habilitado: webhookEnabled,
            eventos: webhookEvents,
            tem_messages_upsert: hasMessagesUpsert,
            erro: webhookError,
          },
          problemas: [
            !webhookUrlOk && '❌ URL do webhook incorreta ou vazia — Evolution API não sabe para onde enviar',
            !webhookEnabled && '❌ Webhook desabilitado na Evolution API',
            !hasMessagesUpsert && '❌ Evento MESSAGES_UPSERT não está na lista de eventos do webhook',
            connectionState !== 'open' && connectionState !== 'connected' && `⚠️ Instância não conectada: ${connectionState}`,
          ].filter(Boolean),
        });
      } catch (e) {
        results.push({
          tenant_id: tenant.id,
          tenant_name: tenant.name,
          erro: String(e),
        });
      }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      diagnostico: results,
      instrucoes: [
        'Se URL do webhook está vazia/errada: vá em Configurações → WhatsApp → Salvar para reconfigurar',
        'Se MESSAGES_UPSERT não está nos eventos: o webhook precisa ser reconfigurado',
        'Se instância não está open/connected: reconectar o WhatsApp no painel',
      ],
    }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/**
 * POST /api/webhooks/evolution/test
 *
 * Força reconfiguração do webhook na Evolution API para o tenant.
 * Útil quando o webhook está desconfigurado ou com URL errada.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServerSupabaseClient();
    const body = await request.json().catch(() => ({}));
    const tenantId = body.tenant_id as string;

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id obrigatório no body' }, { status: 400 });
    }

    const config = getTenantEvolutionConfig(tenantId);
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.URL;

    if (!appUrl) {
      return NextResponse.json({
        error: 'NEXT_PUBLIC_APP_URL ou URL não configurado nas variáveis de ambiente',
      }, { status: 500 });
    }

    const webhookUrl = `${appUrl.replace(/\/$/, '')}/api/webhooks/evolution?tenant_id=${tenantId}`;

    // Reconfigurar webhook
    const res = await fetch(`${config.apiUrl}/webhook/set/${config.instanceName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.apiKey },
      body: JSON.stringify({
        url: webhookUrl,
        webhook_by_events: false,
        webhook_base64: false,
        enabled: true,
        events: [
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'CONNECTION_UPDATE',
          'PRESENCE_UPDATE',
        ],
      }),
    });

    const data = res.ok ? await res.json() : await res.text();

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      webhook_url_configurada: webhookUrl,
      response: data,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
