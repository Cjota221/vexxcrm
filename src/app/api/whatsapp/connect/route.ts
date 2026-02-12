import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { createInstance, getInstanceStatus } from '@/lib/services/evolution.service';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * POST /api/whatsapp/connect
 * 
 * Conecta WhatsApp do tenant via Evolution API.
 * Fluxo:
 * 1. Verifica se tenant já tem instância configurada
 * 2. Se não tem, cria nova instância na Evolution API
 * 3. Retorna QR Code em base64 para escaneamento
 * 4. Atualiza dados do tenant no Supabase
 */
export async function POST(request: NextRequest) {
  try {
    // 1. Autenticação
    const { tenantId } = await getTenantFromRequest(request);
    const tenant = await getTenantConfig(tenantId);

    if (!tenant.evolution_api_url || !tenant.evolution_api_key) {
      return NextResponse.json(
        { error: 'Evolution API não configurada' },
        { status: 400 }
      );
    }

    const supabase = createServerSupabaseClient();

    // 2. Verificar se já existe instância
    let instanceName = tenant.evolution_instance;

    if (!instanceName) {
      // Gerar nome único para a instância
      instanceName = `tenant-${tenantId.slice(0, 8)}-${Date.now()}`;
    }

    const config = {
      apiUrl: tenant.evolution_api_url,
      apiKey: tenant.evolution_api_key,
      instanceName,
    };

    // 3. Verificar status atual da instância
    let status = 'close';
    try {
      status = await getInstanceStatus(config);
    } catch (error) {
      // Instância não existe, será criada
      console.log(`[Connect] Instância não existe, criando: ${instanceName}`);
    }

    // 4. Se status já está 'open', retornar sucesso
    if (status === 'open') {
      return NextResponse.json({
        success: true,
        status: 'open',
        message: 'WhatsApp já conectado',
        instanceName,
      });
    }

    // 5. Criar ou reconectar instância
    const qrCodeBase64 = await createInstance(config);

    // 6. Salvar instanceName no tenant (se era novo)
    if (tenant.evolution_instance !== instanceName) {
      await supabase
        .from('tenants')
        .update({ 
          evolution_instance: instanceName,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);
    }

    // 7. Retornar QR Code
    return NextResponse.json({
      success: true,
      status: 'connecting',
      qrCode: qrCodeBase64, // QR Code em base64
      instanceName,
      message: 'Escaneie o QR Code no WhatsApp',
    });

  } catch (error: any) {
    console.error('[Connect] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao conectar WhatsApp' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/whatsapp/connect
 * 
 * Desconecta WhatsApp (logout da instância).
 */
export async function DELETE(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const tenant = await getTenantConfig(tenantId);

    if (!tenant.evolution_instance) {
      return NextResponse.json(
        { error: 'WhatsApp não conectado' },
        { status: 400 }
      );
    }

    const { logoutInstance } = await import('@/lib/services/evolution.service');
    
    const config = {
      apiUrl: tenant.evolution_api_url!,
      apiKey: tenant.evolution_api_key!,
      instanceName: tenant.evolution_instance,
    };

    await logoutInstance(config);

    return NextResponse.json({
      success: true,
      message: 'WhatsApp desconectado',
    });

  } catch (error: any) {
    console.error('[Disconnect] Erro:', error);
    return NextResponse.json(
      { error: error.message || 'Erro ao desconectar' },
      { status: 500 }
    );
  }
}

