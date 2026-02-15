import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { getTenantEvolutionConfig, getInstanceStatus, getGlobalConfig } from '@/lib/services/evolution.service';

/**
 * GET /api/whatsapp/status
 * 
 * SaaS Status — Retorna status da conexão WhatsApp do tenant.
 * Usa credenciais globais do servidor, sem expor ao client.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);

    // Verificar se Evolution API está configurada no servidor
    try {
      getGlobalConfig();
    } catch {
      return NextResponse.json({
        success: true,
        status: 'close',
        message: 'WhatsApp não disponível',
      });
    }

    const config = getTenantEvolutionConfig(tenantId);

    // Consultar status real na Evolution API
    let status = 'close';
    try {
      status = await getInstanceStatus(config);
    } catch {
      // Instância não existe ainda
    }

    return NextResponse.json({
      success: true,
      status,
      instanceName: config.instanceName,
      message: status === 'open'
        ? 'WhatsApp conectado'
        : status === 'connecting'
          ? 'Aguardando conexão'
          : 'WhatsApp desconectado',
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Erro ao verificar status';
    console.error('[Status] Erro:', message);
    return NextResponse.json({
      success: true,
      status: 'close',
      message: 'Erro ao verificar status',
    });
  }
}

