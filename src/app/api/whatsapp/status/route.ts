import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest, getTenantConfig } from '@/lib/auth-helpers';
import { getInstanceStatus } from '@/lib/services/evolution.service';

/**
 * GET /api/whatsapp/status
 * 
 * Retorna status da conexão WhatsApp do tenant.
 * Status possíveis: 'open' (conectado), 'close' (desconectado), 'connecting' (conectando)
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const tenant = await getTenantConfig(tenantId);

    // Se não tem instância configurada
    if (!tenant.evolution_instance) {
      return NextResponse.json({
        success: true,
        status: 'close',
        message: 'WhatsApp não configurado',
      });
    }

    // Se não tem credenciais da Evolution API
    if (!tenant.evolution_api_url || !tenant.evolution_api_key) {
      return NextResponse.json({
        success: true,
        status: 'close',
        message: 'Evolution API não configurada',
      });
    }

    const config = {
      apiUrl: tenant.evolution_api_url,
      apiKey: tenant.evolution_api_key,
      instanceName: tenant.evolution_instance,
    };

    // Consultar status real na Evolution API
    const status = await getInstanceStatus(config);

    return NextResponse.json({
      success: true,
      status,
      instanceName: tenant.evolution_instance,
      message: status === 'open' 
        ? 'WhatsApp conectado' 
        : status === 'connecting' 
        ? 'Aguardando conexão' 
        : 'WhatsApp desconectado',
    });

  } catch (error: any) {
    console.error('[Status] Erro:', error);
    
    // Se deu erro, provavelmente está desconectado
    return NextResponse.json({
      success: true,
      status: 'close',
      message: 'Erro ao verificar status',
      error: error.message,
    });
  }
}

