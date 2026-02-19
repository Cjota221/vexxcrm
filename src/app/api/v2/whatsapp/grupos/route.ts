import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { getTenantEvolutionConfig, fetchGroups } from '@/lib/services/evolution.service';

/**
 * GET /api/v2/whatsapp/grupos
 *
 * Lista todos os grupos do WhatsApp conectado ao tenant.
 * Usa /group/fetchAllGroups da Evolution API.
 *
 * Response: { grupos: WhatsAppGroup[] }
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const config = getTenantEvolutionConfig(tenantId);

    const grupos = await fetchGroups(config);

    // Ordenar por nome
    grupos.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

    return NextResponse.json({ grupos });
  } catch (error: any) {
    console.error('[GET /api/v2/whatsapp/grupos]', error);

    // Se Evolution API não estiver conectada, retornar lista vazia em vez de 500
    if (
      error.message?.includes('não configurada') ||
      error.message?.includes('HTTP 403') ||
      error.message?.includes('HTTP 401')
    ) {
      return NextResponse.json(
        { grupos: [], aviso: 'WhatsApp não conectado ou sem permissão.' },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Erro ao buscar grupos' },
      { status: 500 }
    );
  }
}
