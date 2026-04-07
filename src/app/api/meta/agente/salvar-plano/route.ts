/**
 * POST /api/meta/agente/salvar-plano
 * Salva o plano do Jarvis em jarvis_memoria e retorna o ID para uso no stream.
 * Body: { plano: PlanoCampanha }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const tenantId = profile.tenant_id;

    const body = await req.json() as { plano?: unknown };
    if (!body.plano) {
      return NextResponse.json({ error: 'plano é obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data, error } = await supabase
      .from('jarvis_memoria')
      .insert({
        tenant_id:  tenantId,
        tipo:       'plano_campanha',
        titulo:     (body.plano as { nome_sugerido?: string }).nome_sugerido ?? 'Plano Jarvis',
        contexto:   body.plano,
        resultado:  null,
        aprendizado: null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[salvar-plano] Erro ao salvar:', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ plano_id: data.id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[salvar-plano] Erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
