import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/debug/messages-test
 * SEM AUTH  diagnostico direto com service key.
 */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? '';

  const results: Record<string, unknown> = {
    url_set: !!url,
    service_key_prefix: serviceKey.substring(0, 25) || 'AUSENTE',
  };

  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Variaveis ausentes', ...results });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: tenants, error: tenantErr } = await supabase.from('tenants').select('id').limit(1);
  results.connection = tenantErr ? { error: tenantErr.message, code: tenantErr.code } : { ok: true, tenant_id: tenants?.[0]?.id };

  const tenantId = tenants?.[0]?.id;
  if (!tenantId) return NextResponse.json(results);

  const { data: convs, error: convErr } = await supabase
    .from('conversations').select('id, client_id')
    .eq('tenant_id', tenantId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);
  results.conversation = convErr ? { error: convErr.message } : { id: convs?.[0]?.id };

  const convId = convs?.[0]?.id;
  const clientId = convs?.[0]?.client_id;
  if (!convId || !clientId) return NextResponse.json(results);

  const testExtId = `debug_${Date.now()}`;
  const { data: inserted, error: insErr } = await supabase
    .from('messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: convId,
      client_id: clientId,
      external_id: testExtId,
      direction: 'outbound',
      sender_name: 'DEBUG',
      content: '[TESTE]',
      type: 'text',
      status: 'sent',
      created_at: new Date().toISOString(),
    })
    .select('id').single();

  if (insErr) {
    results.insert = { ok: false, code: insErr.code, message: insErr.message, details: insErr.details, hint: insErr.hint };
  } else {
    results.insert = { ok: true, id: inserted?.id };
    await supabase.from('messages').delete().eq('external_id', testExtId).eq('tenant_id', tenantId);
    results.cleanup = 'ok';
  }

  return NextResponse.json(results);
}
