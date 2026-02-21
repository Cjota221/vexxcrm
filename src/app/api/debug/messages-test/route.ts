import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/**
 * GET /api/debug/messages-test?clientId=UUID
 * SEM AUTH — replica exatamente o fluxo do send/route.ts para um clientId específico.
 * Mostra cada passo: busca do cliente, conversa, INSERT da mensagem.
 */
export async function GET(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_KEY ?? '';
  const { searchParams } = new URL(request.url);
  const clientIdParam = searchParams.get('clientId');

  const results: Record<string, unknown> = {
    url_set: !!url,
    service_key_prefix: serviceKey.substring(0, 25) || 'AUSENTE',
    clientId_param: clientIdParam || 'não fornecido (usando primeiro tenant)',
  };

  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Variaveis ausentes', ...results });
  }

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // 1. Tenant
  const { data: tenants, error: tenantErr } = await supabase.from('tenants').select('id').limit(1);
  results.step1_tenant = tenantErr
    ? { error: tenantErr.message, code: tenantErr.code }
    : { ok: true, tenant_id: tenants?.[0]?.id };

  const tenantId = tenants?.[0]?.id;
  if (!tenantId) return NextResponse.json(results);

  // 2. Cliente — igual ao send/route.ts
  let clientId: string | null = null;
  if (clientIdParam) {
    const { data: c, error: cErr } = await supabase
      .from('clients').select('id, name, phone')
      .eq('tenant_id', tenantId).eq('id', clientIdParam).single();
    results.step2_client = cErr
      ? { error: cErr.message, code: cErr.code, hint: 'clientId não encontrado neste tenant' }
      : { ok: true, id: c?.id, name: c?.name, phone: c?.phone };
    clientId = c?.id ?? null;
  } else {
    // sem clientId: pegar o primeiro
    const { data: c } = await supabase
      .from('clients').select('id, name').eq('tenant_id', tenantId).limit(1).single();
    clientId = c?.id ?? null;
    results.step2_client = { ok: !!clientId, id: clientId };
  }

  if (!clientId) return NextResponse.json(results);

  // 3. Conversa — IDÊNTICO ao send/route.ts (order + limit 1)
  const { data: convs, error: convErr } = await supabase
    .from('conversations').select('id, last_message_at')
    .eq('tenant_id', tenantId).eq('client_id', clientId).eq('channel', 'whatsapp')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(1);
  results.step3_conversation = convErr
    ? { error: convErr.message, code: convErr.code }
    : { ok: true, id: convs?.[0]?.id, last_message_at: convs?.[0]?.last_message_at };

  const convId = convs?.[0]?.id ?? null;

  // 4. Contar conversas totais (detectar múltiplas)
  const { count: convCount } = await supabase
    .from('conversations').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId).eq('client_id', clientId);
  results.step3_total_conversations = convCount;
  if ((convCount ?? 0) > 1) {
    results.step3_warning = `⚠️ ${convCount} conversas para este cliente — send usa a mais recente`;
  }

  if (!convId) return NextResponse.json(results);

  // 5. INSERT de teste — IDÊNTICO ao send/route.ts
  const testExtId = `debug_${Date.now()}`;
  const { data: inserted, error: insErr } = await supabase
    .from('messages')
    .insert({
      tenant_id: tenantId,
      conversation_id: convId,
      client_id: clientId,
      external_id: testExtId,
      direction: 'outbound',
      sender_name: 'Atendente',
      sender_phone: null,
      content: '[TESTE DEBUG]',
      type: 'text',
      status: 'sent',
      created_at: new Date().toISOString(),
    })
    .select('id').single();

  if (insErr) {
    results.step4_insert = { ok: false, code: insErr.code, message: insErr.message, details: insErr.details, hint: insErr.hint };
  } else {
    results.step4_insert = { ok: true, id: inserted?.id };
    await supabase.from('messages').delete().eq('external_id', testExtId).eq('tenant_id', tenantId);
    results.step4_cleanup = 'ok';
  }

  // 6. Buscar últimas 5 mensagens desta conversa (verificar se chegam do banco)
  const { data: recent, error: recentErr } = await supabase
    .from('messages').select('id, direction, content, status, external_id, created_at')
    .eq('tenant_id', tenantId).eq('conversation_id', convId)
    .order('created_at', { ascending: false }).limit(5);
  results.step5_recent_messages = recentErr
    ? { error: recentErr.message }
    : (recent ?? []).map(m => ({
        id: m.id,
        direction: m.direction,
        content: m.content?.substring(0, 40),
        status: m.status,
        has_external_id: !!m.external_id,
        created_at: m.created_at,
      }));

  return NextResponse.json(results);
}

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
