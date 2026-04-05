import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

/**
 * GET /api/meta/leads/sync?form_id=XXX&limit=50
 * Faz pull manual de leads de um Instant Form específico via Graph API.
 * Salva os leads no Supabase (clients + kanban_cards) e retorna a lista.
 *
 * POST /api/meta/leads/sync
 * Body: { form_ids: string[] }
 * Faz pull de múltiplos formulários de uma vez.
 */

function normalizarTelefone(tel: string): string {
  if (!tel) return '';
  const digits = tel.replace(/\D/g, '');
  if (digits.startsWith('55')) {
    if (digits.length >= 12) return digits;
  }
  if (digits.length === 11 || digits.length === 10) return `55${digits}`;
  return digits;
}

async function fetchAndSaveLeads(
  formId: string,
  token: string,
  tenantId: string,
  limit = 50,
): Promise<{ salvos: number; leads: unknown[] }> {
  const supabase = createServerSupabaseClient();

  const url = new URL(`${META_BASE}/${formId}/leads`);
  url.searchParams.set('fields', 'field_data,created_time,ad_id,campaign_id,adset_id');
  url.searchParams.set('limit', String(Math.min(limit, 100)));
  url.searchParams.set('access_token', token);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(err.error?.message || `Meta API ${res.status}`);
  }

  const data = await res.json() as {
    data: Array<{
      id: string;
      created_time: string;
      ad_id?: string;
      campaign_id?: string;
      adset_id?: string;
      field_data: Array<{ name: string; values: string[] }>;
    }>;
  };

  const leads = data.data || [];
  let salvos = 0;

  for (const lead of leads) {
    const campos: Record<string, string> = {};
    for (const campo of lead.field_data || []) {
      campos[campo.name] = campo.values?.[0] || '';
    }

    const phone = normalizarTelefone(
      campos['phone_number'] || campos['telefone'] || campos['phone'] || ''
    );
    const nome  = campos['full_name'] || campos['nome'] || campos['first_name'] || 'Lead formulário';
    const email = campos['email'] || null;

    if (phone) {
      await supabase.from('clients').upsert(
        {
          tenant_id:        tenantId,
          phone,
          phone_normalized: phone,
          name:             nome,
          email,
          tags:             ['meta-ads', 'formulario'],
          source:           'meta_leads',
        },
        { onConflict: 'tenant_id,phone_normalized' }
      );
    }

    // Criar card no kanban apenas se não existir um para este lead_id
    const { data: existing } = await supabase
      .from('kanban_cards')
      .select('id')
      .eq('tenant_id', tenantId)
      .contains('metadata', { lead_id: lead.id })
      .maybeSingle();

    if (!existing) {
      await supabase.from('kanban_cards').insert({
        tenant_id:     tenantId,
        contact_phone: phone,
        contact_name:  nome,
        contact_email: email || '',
        column_id:     'novo_lead_meta',
        labels:        ['meta-ads'],
        metadata: {
          origem:      'meta_ads',
          lead_id:     lead.id,
          form_id:     formId,
          campaign_id: lead.campaign_id,
          ad_id:       lead.ad_id,
          adset_id:    lead.adset_id,
          campos_raw:  campos,
          created_time: lead.created_time,
        },
      });
      salvos++;
    }
  }

  return {
    salvos,
    leads: leads.map(l => {
      const campos: Record<string, string> = {};
      for (const c of l.field_data || []) campos[c.name] = c.values?.[0] || '';
      return {
        id:           l.id,
        created_time: l.created_time,
        nome:  campos['full_name'] || campos['nome'] || campos['first_name'] || '—',
        email: campos['email'] || null,
        phone: normalizarTelefone(campos['phone_number'] || campos['telefone'] || campos['phone'] || ''),
        campaign_id: l.campaign_id,
        campos,
      };
    }),
  };
}

export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const formId = req.nextUrl.searchParams.get('form_id');
    const limit  = parseInt(req.nextUrl.searchParams.get('limit') || '50');

    if (!formId) return NextResponse.json({ error: 'form_id obrigatório' }, { status: 400 });

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    const result = await fetchAndSaveLeads(formId, config.meta_access_token, profile.tenant_id, limit);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { form_ids: string[] };

    if (!body.form_ids?.length) {
      return NextResponse.json({ error: 'form_ids obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) {
      return NextResponse.json({ error: 'Token Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    let totalSalvos = 0;
    const resultados: Record<string, { salvos: number; total: number }> = {};

    for (const formId of body.form_ids) {
      try {
        const r = await fetchAndSaveLeads(formId, token, profile.tenant_id, 100);
        totalSalvos += r.salvos;
        resultados[formId] = { salvos: r.salvos, total: r.leads.length };
      } catch (err) {
        resultados[formId] = { salvos: 0, total: 0 };
        console.error(`[Leads Sync] Erro no form ${formId}:`, err);
      }
    }

    return NextResponse.json({ ok: true, total_salvos: totalSalvos, resultados });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
