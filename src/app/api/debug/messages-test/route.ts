import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/debug/messages-test
 *
 * Diagnóstico: testa INSERT na tabela messages e verifica RLS, schema e constraints.
 * Remover após resolver o problema.
 */
export async function GET(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const results: Record<string, unknown> = { tenantId };

    // 1. Verificar se a tabela messages existe e quais colunas tem
    const { data: cols, error: colsErr } = await supabase
      .from('messages')
      .select('id, tenant_id, direction, external_id, status, created_at')
      .eq('tenant_id', tenantId)
      .limit(1);
    results.schema_check = colsErr ? { error: colsErr.message, code: colsErr.code } : { ok: true, sample: cols?.[0] ?? null };

    // 2. Verificar se existe conversa para este tenant
    const { data: convs, error: convErr } = await supabase
      .from('conversations')
      .select('id, client_id, last_message_at')
      .eq('tenant_id', tenantId)
      .limit(1);
    results.conversation_check = convErr ? { error: convErr.message } : { count: convs?.length, sample: convs?.[0] ?? null };

    const conversationId = convs?.[0]?.id;
    const clientId = convs?.[0]?.client_id;

    if (!conversationId || !clientId) {
      results.insert_test = { skipped: 'Nenhuma conversa encontrada para testar INSERT' };
      return NextResponse.json(results);
    }

    // 3. Tentar INSERT de mensagem de teste
    const testExternalId = `debug_${Date.now()}`;
    const { data: inserted, error: insErr } = await supabase
      .from('messages')
      .insert({
        tenant_id: tenantId,
        conversation_id: conversationId,
        client_id: clientId,
        external_id: testExternalId,
        direction: 'outbound',
        sender_name: 'DEBUG',
        sender_phone: null,
        content: '[TESTE DIAGNÓSTICO - pode apagar]',
        type: 'text',
        media_url: null,
        status: 'sent',
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insErr) {
      results.insert_test = {
        ok: false,
        code: insErr.code,
        message: insErr.message,
        details: insErr.details,
        hint: insErr.hint,
      };
    } else {
      results.insert_test = { ok: true, id: inserted?.id };

      // Limpar a mensagem de teste
      await supabase.from('messages').delete().eq('id', inserted.id).eq('tenant_id', tenantId);
      results.cleanup = 'mensagem de teste deletada';
    }

    // 4. Verificar RLS — tentar SELECT sem filtro de tenant (deve falhar ou retornar vazio)
    const { data: rlsCheck, error: rlsErr } = await supabase
      .from('messages')
      .select('id')
      .limit(5);
    results.rls_check = rlsErr
      ? { error: rlsErr.message }
      : { rows_visible: rlsCheck?.length, note: 'Se > 0, RLS está ativo e filtrando por tenant via auth' };

    return NextResponse.json(results, { status: 200 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
