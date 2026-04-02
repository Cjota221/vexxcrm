/**
 * POST /api/meta/transcricao/batch
 * Processa até 3 vídeos pendentes de transcrição para o tenant.
 * Chamado manualmente ou para processar vídeos já existentes na galeria.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { processarCriativo } from '@/lib/services/meta-transcricao.service';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  const { data: pendentes } = await supabase
    .from('ad_creatives')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tipo', 'video')
    .in('transcricao_status', ['pendente', 'erro'])
    .limit(5);

  if (!pendentes?.length) {
    return NextResponse.json({ ok: true, processados: 0 });
  }

  const resultados = await Promise.allSettled(
    pendentes.slice(0, 3).map(c => processarCriativo(c.id, tenantId))
  );

  const sucessos = resultados.filter(r => r.status === 'fulfilled' && r.value.ok).length;

  return NextResponse.json({
    ok: true,
    processados: sucessos,
    total: pendentes.length,
  });
}
