/**
 * GET  /api/meta/campanhas — lista rascunhos de campanhas
 * POST /api/meta/campanhas — cria um novo rascunho
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('meta_campaign_drafts')
    .select(`
      id, nome, objetivo, status,
      copy_headline, copy_texto, copy_cta, url_destino,
      paises, idade_min, idade_max, genero, interesses,
      orcamento_diario, data_inicio, data_fim,
      meta_campaign_id, meta_adset_id, meta_ad_id, erro,
      created_at,
      ad_creatives ( id, nome, tipo, url_preview )
    `)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json() as {
    nome: string;
    objetivo: string;
    criativo_id?: string;
    copy_headline?: string;
    copy_texto?: string;
    copy_cta?: string;
    url_destino?: string;
    paises?: string[];
    idade_min?: number;
    idade_max?: number;
    genero?: string;
    interesses?: Array<{ id: string; name: string }>;
    publico_id?: string;
    orcamento_diario?: number;
    data_inicio?: string;
    data_fim?: string;
  };

  if (!body.nome || !body.objetivo) {
    return NextResponse.json({ error: 'nome e objetivo são obrigatórios' }, { status: 400 });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from('meta_campaign_drafts')
    .insert({
      tenant_id:       tenantId,
      nome:            body.nome,
      objetivo:        body.objetivo,
      criativo_id:     body.criativo_id ?? null,
      copy_headline:   body.copy_headline ?? null,
      copy_texto:      body.copy_texto ?? null,
      copy_cta:        body.copy_cta ?? 'LEARN_MORE',
      url_destino:     body.url_destino ?? null,
      paises:          body.paises ?? ['BR'],
      idade_min:       body.idade_min ?? 18,
      idade_max:       body.idade_max ?? 65,
      genero:          body.genero ?? 'all',
      interesses:      body.interesses ?? [],
      publico_id:      body.publico_id ?? null,
      orcamento_diario: body.orcamento_diario ?? 3000,
      data_inicio:     body.data_inicio ?? null,
      data_fim:        body.data_fim ?? null,
    })
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}
