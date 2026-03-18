/**
 * GET /api/facilzap/sync-admin/orphan-debug
 *
 * Diagnóstico de pedidos órfãos: mostra quais campos estão populados
 * no metadata para entender por que o matching falha.
 */

import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;

    const { supabase, tenantId } = auth;

    // Contar órfãos
    const { count: totalOrphans } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .is('client_id', null);

    // Buscar amostra de 50 órfãos para analisar
    const { data: sample } = await supabase
      .from('orders')
      .select('id, external_id, metadata')
      .eq('tenant_id', tenantId)
      .is('client_id', null)
      .limit(50);

    if (!sample || sample.length === 0) {
      return NextResponse.json({ total_orphans: totalOrphans ?? 0, message: 'Nenhum órfão encontrado!', fields: {} });
    }

    // Agregar: quantos têm cada campo preenchido
    const fields = {
      cliente_telefone: 0,
      cliente_whatsapp: 0,
      cliente_whatsapp_e164: 0,
      cliente_id_facilzap: 0,
      cliente_cpf_cnpj: 0,
      cliente_email: 0,
      cliente_nome: 0,
    };

    for (const o of sample) {
      const meta = o.metadata as Record<string, unknown> | null;
      if (!meta) continue;
      if (meta.cliente_telefone) fields.cliente_telefone++;
      if (meta.cliente_whatsapp) fields.cliente_whatsapp++;
      if (meta.cliente_whatsapp_e164) fields.cliente_whatsapp_e164++;
      if (meta.cliente_id_facilzap) fields.cliente_id_facilzap++;
      if (meta.cliente_cpf_cnpj) fields.cliente_cpf_cnpj++;
      if (meta.cliente_email) fields.cliente_email++;
      if (meta.cliente_nome) fields.cliente_nome++;
    }

    // Exemplo dos primeiros 3 órfãos (dados anonimizados)
    const examples = sample.slice(0, 3).map((o) => {
      const meta = o.metadata as Record<string, unknown> | null;
      return {
        external_id: o.external_id,
        has_telefone: !!(meta?.cliente_telefone),
        has_whatsapp: !!(meta?.cliente_whatsapp),
        has_e164: !!(meta?.cliente_whatsapp_e164),
        has_facilzap_id: !!(meta?.cliente_id_facilzap),
        facilzap_id_value: meta?.cliente_id_facilzap ?? null,
        has_cpf: !!(meta?.cliente_cpf_cnpj),
        has_email: !!(meta?.cliente_email),
        has_nome: !!(meta?.cliente_nome),
        nome: meta?.cliente_nome ?? null,
      };
    });

    // Verificar se clientes têm facilzap_id em custom_fields
    const { data: clientSample } = await supabase
      .from('clients')
      .select('id, custom_fields, cpf')
      .eq('tenant_id', tenantId)
      .limit(5);

    const clientInfo = (clientSample || []).map((c) => ({
      has_facilzap_id: !!(c.custom_fields as Record<string, unknown>)?.facilzap_id,
      facilzap_id_value: (c.custom_fields as Record<string, unknown>)?.facilzap_id ?? null,
      has_cpf: !!(c.cpf),
    }));

    return NextResponse.json({
      total_orphans: totalOrphans ?? 0,
      sample_size: sample.length,
      fields_populated: fields,
      fields_percent: Object.fromEntries(
        Object.entries(fields).map(([k, v]) => [k, `${Math.round((v / sample.length) * 100)}%`])
      ),
      examples,
      client_sample: clientInfo,
      diagnosis: buildDiagnosis(fields, sample.length, clientInfo),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message ?? 'Erro interno' }, { status: 500 });
  }
}

function buildDiagnosis(
  fields: Record<string, number>,
  total: number,
  clients: Array<{ has_facilzap_id: boolean; facilzap_id_value: unknown; has_cpf: boolean }>
): string[] {
  const msgs: string[] = [];
  const pct = (n: number) => Math.round((n / total) * 100);

  if (pct(fields.cliente_whatsapp) < 5 && pct(fields.cliente_telefone) < 5) {
    msgs.push('⚠️ CRÍTICO: Menos de 5% dos pedidos órfãos têm telefone — matching por phone impossível para maioria.');
  }
  if (pct(fields.cliente_id_facilzap) > 80) {
    const clientsWithFzId = clients.filter(c => c.has_facilzap_id).length;
    if (clientsWithFzId === 0) {
      msgs.push('🔴 CRÍTICO: Pedidos têm cliente_id_facilzap mas NENHUM cliente tem facilzap_id em custom_fields — sync de clientes pode ter falhado ou sobrescrito custom_fields.');
    } else {
      msgs.push(`✅ ${pct(fields.cliente_id_facilzap)}% dos pedidos têm cliente_id_facilzap — matching por FacilZap ID deveria funcionar.`);
    }
  }
  if (pct(fields.cliente_cpf_cnpj) > 50) {
    msgs.push(`ℹ️ ${pct(fields.cliente_cpf_cnpj)}% dos pedidos têm CPF/CNPJ — matching por CPF pode resolver muitos órfãos.`);
  }
  if (pct(fields.cliente_email) > 50) {
    msgs.push(`ℹ️ ${pct(fields.cliente_email)}% dos pedidos têm email — matching por email pode ajudar.`);
  }
  if (msgs.length === 0) {
    msgs.push('Nenhum problema óbvio detectado na amostra. Verifique os logs do servidor para matchStrategy.');
  }
  return msgs;
}
