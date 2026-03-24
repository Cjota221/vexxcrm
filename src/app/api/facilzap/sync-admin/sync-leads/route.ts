/**
 * POST /api/facilzap/sync-admin/sync-leads
 *
 * Sincroniza leads da FacilZap como clientes (source = 'lead').
 * Upsert seguro por phone_normalized — não duplica clientes existentes,
 * apenas complementa com dados do funil/canal se o cliente já existe.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';
import { fetchAllLeads } from '@/lib/services/facilzap.service';
import { mapLeads, upsertClients } from '@/lib/facilzap/mapper';

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { supabase, tenantId, facilzapToken } = auth;

    if (!facilzapToken) {
      return NextResponse.json({ error: 'Token FacilZap não configurado' }, { status: 400 });
    }

    const startTime = Date.now();

    console.log(`[SyncLeads] Iniciando para tenant ${tenantId}`);
    const rawLeads = await fetchAllLeads({ token: facilzapToken });
    console.log(`[SyncLeads] ${rawLeads.length} leads obtidos da API`);

    const { valid, rejected } = mapLeads(rawLeads, tenantId);
    console.log(`[SyncLeads] Mapeados: ${valid.length} válidos, ${rejected.length} rejeitados`);

    let upserted = 0;
    if (valid.length > 0) {
      const result = await upsertClients(supabase, valid);
      upserted = result.created;
      if (result.errors.length > 0) {
        console.warn('[SyncLeads] Erros de upsert:', result.errors);
      }
    }

    const duration_ms = Date.now() - startTime;
    console.log(`[SyncLeads] Concluído em ${duration_ms}ms — ${upserted} leads sincronizados`);

    return NextResponse.json({
      success: true,
      total_leads: rawLeads.length,
      synced: upserted,
      rejected: rejected.length,
      rejected_reasons: rejected.slice(0, 5).map(r => r.reason),
      duration_ms,
    });
  } catch (error: any) {
    console.error('[SyncLeads] Erro:', error?.message);
    return NextResponse.json({ error: error?.message ?? 'Erro interno' }, { status: 500 });
  }
}
