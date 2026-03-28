import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { criarPublicosComIA } from '@/lib/services/audience-orchestrator.service';
import { listarPublicosIA } from '@/lib/services/meta-audiences.service';

/**
 * GET /api/ai-team/create-audiences
 * Lista públicos criados pela IA para o tenant.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const publicos = await listarPublicosIA(profile.tenant_id);
    return NextResponse.json({ ok: true, publicos });
  } catch (err) {
    console.error('[create-audiences GET]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/ai-team/create-audiences
 * Dispara criação de públicos com IA (José + Cláudio + Meta API).
 * Retorna os públicos criados com estimativa de alcance.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);

    console.log(`[create-audiences] Iniciando para tenant ${profile.tenant_id}`);
    const resultado = await criarPublicosComIA(profile.tenant_id);

    return NextResponse.json({
      ok: true,
      criados: resultado.criados,
      erros: resultado.erros,
      analise_resumo: resultado.analise_resumo,
      publicos: resultado.publicos,
      duracao_ms: resultado.duracao_ms,
    });
  } catch (err) {
    console.error('[create-audiences POST]', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
