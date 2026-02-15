import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  provisionInstance,
  getTenantEvolutionConfig,
  getInstanceStatus,
  logoutInstance,
  getInstanceName,
} from '@/lib/services/evolution.service';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/whatsapp/connect
 * 
 * SaaS Connect — Proxy seguro de QR Code.
 * 
 * Fluxo:
 * 1. Autentica o lojista (tenant_id via JWT)
 * 2. Provisiona instância automaticamente (vexx-{tenantId})
 * 3. Configura webhook apontando para nosso backend
 * 4. Retorna APENAS o QR Code base64 (sem expor credenciais)
 * 5. Salva instanceName no tenant
 * 
 * O lojista NUNCA vê a GLOBAL_API_KEY ou a URL da Evolution API.
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const instanceName = getInstanceName(tenantId);

    // Detectar URL base para webhook
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;

    // Provisionar instância (cria se não existe, retorna QR se desconectada)
    const result = await provisionInstance(tenantId, appUrl);

    // Salvar instanceName no tenant (idempotente)
    await supabase
      .from('tenants')
      .update({
        evolution_instance: instanceName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    // Se já estava conectada
    if (result.status === 'exists') {
      return NextResponse.json({
        success: true,
        status: 'open',
        message: 'WhatsApp já conectado',
        instanceName,
      });
    }

    // Retornar QR Code para escaneamento
    return NextResponse.json({
      success: true,
      status: 'connecting',
      qrCode: result.qrCode,
      instanceName,
      message: 'Escaneie o QR Code no WhatsApp',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao conectar WhatsApp';
    console.error('[Connect] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/whatsapp/connect
 * 
 * Desconecta WhatsApp (logout da instância).
 * Usa credenciais globais — lojista não precisa saber nada.
 */
export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const config = getTenantEvolutionConfig(tenantId);

    // Verificar se está conectada antes de desconectar
    let status = 'close';
    try {
      status = await getInstanceStatus(config);
    } catch {
      // Instância não existe
    }

    if (status === 'close') {
      return NextResponse.json({
        success: true,
        message: 'WhatsApp já estava desconectado',
      });
    }

    await logoutInstance(config);

    return NextResponse.json({
      success: true,
      message: 'WhatsApp desconectado',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao desconectar';
    console.error('[Disconnect] Erro:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

