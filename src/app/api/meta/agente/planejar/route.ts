/**
 * POST /api/meta/agente/planejar
 * Jarvis analisa os criativos selecionados e retorna um plano de campanha.
 * Body: { criativo_ids: string[], objetivo: string, orcamento_total: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  jarvisPlanejarCampanha,
  type CriativoSelecionado,
} from '@/lib/services/jarvis-campanha-planner';

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const tenantId = profile.tenant_id;

    const body = await req.json() as {
      criativo_ids?: string[];
      objetivo?: string;
      orcamento_total?: number;
    };

    const { criativo_ids, objetivo, orcamento_total } = body;

    if (!criativo_ids?.length || !objetivo || !orcamento_total) {
      return NextResponse.json(
        { error: 'criativo_ids, objetivo e orcamento_total são obrigatórios' },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();

    // Buscar criativos selecionados com classificações
    const { data: criativos, error: criativosError } = await supabase
      .from('ad_creatives')
      .select('id, nome, tipo, meta_video_id, meta_image_hash, url_preview, classificacao')
      .eq('tenant_id', tenantId)
      .in('id', criativo_ids);

    if (criativosError) {
      return NextResponse.json({ error: criativosError.message }, { status: 500 });
    }

    if (!criativos || criativos.length === 0) {
      return NextResponse.json({ error: 'Nenhum criativo encontrado' }, { status: 404 });
    }

    const criativosMapped: CriativoSelecionado[] = criativos.map(c => ({
      id: c.id,
      nome: c.nome,
      tipo: (c.tipo ?? (c.meta_video_id ? 'video' : 'imagem')) as 'video' | 'imagem',
      meta_video_id: c.meta_video_id ?? undefined,
      meta_image_hash: c.meta_image_hash ?? undefined,
      url_preview: c.url_preview ?? undefined,
      classificacao: c.classificacao as CriativoSelecionado['classificacao'],
    }));

    const plano = await jarvisPlanejarCampanha(
      tenantId,
      criativosMapped,
      objetivo,
      orcamento_total,
    );

    return NextResponse.json(plano);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[/api/meta/agente/planejar]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
