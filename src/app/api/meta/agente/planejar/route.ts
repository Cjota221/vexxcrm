/**
 * POST /api/meta/agente/planejar
 * Jarvis analisa os criativos selecionados e retorna um plano de campanha.
 * Body: { criativo_ids: string[], objetivo: string, orcamento_total: number }
 */

import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import {
  jarvisPlanejarCampanha,
  type CriativoSelecionado,
} from '@/lib/services/jarvis-campanha-planner';

export async function POST(req: NextRequest) {
  console.log('[Planejar Route] INICIO');
  try {
    const { profile } = await getTenantFromRequest(req);
    const tenantId = profile.tenant_id;

    const body = await req.json() as {
      criativo_ids?: string[];
      objetivo?: string;
      orcamento_total?: number;
      tipos?: string[];
    };

    console.log('[Planejar Route] body recebido:', JSON.stringify(body));

    const { criativo_ids, objetivo, orcamento_total, tipos } = body;

    if (!criativo_ids?.length || !objetivo || !orcamento_total) {
      return NextResponse.json(
        { error: 'criativo_ids, objetivo e orcamento_total são obrigatórios' },
        { status: 400 },
      );
    }

    const supabase = createServerSupabaseClient();

    // Buscar criativos selecionados com classificações e transcrição
    const { data: criativos, error: criativosError } = await supabase
      .from('ad_creatives')
      .select('id, nome, tipo, meta_video_id, meta_image_hash, url_preview, classificacao, transcricao')
      .eq('tenant_id', tenantId)
      .in('id', criativo_ids);

    console.log('[Planejar Route] criativos encontrados no banco:', criativos?.length ?? 0);

    if (criativosError) {
      console.error('[Planejar Route] Erro ao buscar criativos:', criativosError.message);
      return NextResponse.json({ error: criativosError.message }, { status: 500 });
    }

    if (!criativos || criativos.length === 0) {
      return NextResponse.json({ error: 'Nenhum criativo encontrado' }, { status: 404 });
    }

    const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
    console.log('[Planejar Route] anthropicApiKey existe:', !!anthropicApiKey);

    const criativosMapped: CriativoSelecionado[] = criativos.map(c => ({
      id: c.id,
      nome: c.nome,
      tipo: (c.tipo ?? (c.meta_video_id ? 'video' : 'imagem')) as 'video' | 'imagem',
      meta_video_id: c.meta_video_id ?? undefined,
      meta_image_hash: c.meta_image_hash ?? undefined,
      url_preview: c.url_preview ?? undefined,
      classificacao: c.classificacao as CriativoSelecionado['classificacao'],
      transcricao: (c.transcricao as string | null | undefined) ?? undefined,
    }));

    console.log('[Planejar Route] Chamando jarvisPlanejarCampanha...');
    const plano = await jarvisPlanejarCampanha(
      tenantId,
      criativosMapped,
      objetivo,
      orcamento_total,
      tipos,
    );

    console.log('[Planejar Route] Plano gerado OK — conjuntos:', plano.conjuntos?.length);
    return NextResponse.json(plano);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[Planejar Route] ERRO:', msg);
    if (stack) console.error('[Planejar Route] Stack:', stack);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
