import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * PATCH /api/orders/[id]/tracking
 * Atualiza o código de rastreio do pedido localmente e na API FacilZap.
 * 
 * Body: { tracking_code: string | null }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    const { id } = await params;

    // Validar body
    const body = await request.json();
    const trackingCode = body.tracking_code ?? null;

    if (trackingCode !== null && typeof trackingCode !== 'string') {
      return NextResponse.json({ error: 'tracking_code deve ser string ou null' }, { status: 400 });
    }

    // Buscar pedido
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, external_id, tracking_code, metadata, tenant_id')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'Pedido não encontrado' }, { status: 404 });
    }

    // Buscar token FacilZap do tenant
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('facilzap_token')
      .eq('id', profile.tenant_id)
      .single();

    // Tentar atualizar na API FacilZap (se tem token e external_id)
    let facilzapUpdated = false;
    let facilzapError: string | null = null;

    if (tenantData?.facilzap_token && order.external_id) {
      try {
        const fzResponse = await fetch(
          `https://api.facilzap.app.br/pedidos/${order.external_id}/codigo_rastreio`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
              'Authorization': `Bearer ${tenantData.facilzap_token}`,
            },
            body: JSON.stringify({ codigo_rastreio: trackingCode }),
          }
        );

        if (fzResponse.ok) {
          facilzapUpdated = true;
          console.log(`[TRACKING] FacilZap atualizado: pedido ${order.external_id} -> "${trackingCode}"`);
        } else {
          const errBody = await fzResponse.json().catch(() => ({}));
          facilzapError = errBody.message || `HTTP ${fzResponse.status}`;
          console.error(`[TRACKING] Erro FacilZap: ${facilzapError}`);
        }
      } catch (e: any) {
        facilzapError = e.message;
        console.error(`[TRACKING] Falha ao chamar FacilZap:`, e.message);
      }
    }

    // Atualizar no banco local (sempre, mesmo se FacilZap falhar)
    const currentMeta = typeof order.metadata === 'string'
      ? (() => { try { return JSON.parse(order.metadata); } catch { return {}; } })()
      : (order.metadata || {});

    const updatedMetadata = {
      ...currentMeta,
      codigo_rastreio: trackingCode,
      rastreio_atualizado_em: new Date().toISOString(),
      rastreio_sincronizado_facilzap: facilzapUpdated,
    };

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        tracking_code: trackingCode,
        metadata: updatedMetadata,
      })
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Erro ao atualizar pedido', details: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      tracking_code: trackingCode,
      facilzap_synced: facilzapUpdated,
      facilzap_error: facilzapError,
      message: facilzapUpdated
        ? 'Código de rastreio atualizado no CRM e na FacilZap'
        : trackingCode
          ? 'Código de rastreio salvo no CRM' + (facilzapError ? ` (FacilZap: ${facilzapError})` : '')
          : 'Código de rastreio removido',
    });
  } catch (error: any) {
    console.error('[TRACKING] Erro interno:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: error.message },
      { status: 500 }
    );
  }
}
