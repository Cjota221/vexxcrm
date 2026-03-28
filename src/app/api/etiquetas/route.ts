import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/etiquetas
 * Returns WhatsApp labels + conversation counts from whatsapp_labels + conversation_labels.
 */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    // Fetch labels
    const { data: labels } = await supabase
      .from('whatsapp_labels')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .eq('ativo', true)
      .order('nome');

    // Fetch conversation counts per label
    const { data: counts } = await supabase
      .from('conversation_labels')
      .select('label_id')
      .eq('tenant_id', profile.tenant_id);

    // Count per label_id
    const countMap: Record<string, number> = {};
    for (const c of counts || []) {
      countMap[c.label_id] = (countMap[c.label_id] || 0) + 1;
    }

    // Merge
    const result = (labels || []).map(l => ({
      ...l,
      conversation_count: countMap[l.whatsapp_label_id] || 0,
    }));

    return NextResponse.json({ labels: result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
