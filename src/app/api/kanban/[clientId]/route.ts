import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/kanban/[clientId]
 *
 * Retorna:
 *  - kanban_card atual do cliente (coluna, tags, score_anne, tentativas_reativacao)
 *  - kanban_transitions (histórico completo de movimentações)
 *
 * Requer: header Authorization com JWT do usuário autenticado
 * (ou service key em contexto server-to-server)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  if (!clientId) {
    return NextResponse.json({ error: 'clientId obrigatório' }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient();

    // Resolver tenant_id a partir do clientId
    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('id, tenant_id')
      .eq('id', clientId)
      .single();

    if (clientErr || !clientRow) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const tenantId = clientRow.tenant_id;

    // Buscar kanban_card atual
    const { data: card } = await supabase
      .from('kanban_cards')
      .select('id, coluna, tags, score_anne, tentativas_reativacao, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .single();

    // Buscar histórico de transições (máx 50)
    const { data: transitions } = await supabase
      .from('kanban_transitions')
      .select('id, de_coluna, para_coluna, autor, autor_id, motivo, created_at')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })
      .limit(50);

    return NextResponse.json({
      card: card ?? null,
      transitions: transitions ?? [],
    });
  } catch (err) {
    console.error('[API Kanban] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

/**
 * PATCH /api/kanban/[clientId]
 *
 * Move manualmente o kanban_card para uma nova coluna.
 * Body: { coluna: KanbanColumn, motivo?: string }
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;

  try {
    const body = await request.json();
    const { coluna, motivo } = body as { coluna: string; motivo?: string };

    if (!coluna) {
      return NextResponse.json({ error: 'coluna obrigatória' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: clientRow, error: clientErr } = await supabase
      .from('clients')
      .select('id, tenant_id')
      .eq('id', clientId)
      .single();

    if (clientErr || !clientRow) {
      return NextResponse.json({ error: 'Cliente não encontrado' }, { status: 404 });
    }

    const tenantId = clientRow.tenant_id;

    // Buscar chat_id (usar phone_normalized como chat_id fallback)
    const { data: cardExisting } = await supabase
      .from('kanban_cards')
      .select('chat_id, coluna')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .single();

    const { data: clientFull } = await supabase
      .from('clients')
      .select('phone_normalized')
      .eq('id', clientId)
      .single();

    const chatId = cardExisting?.chat_id ?? `${clientFull?.phone_normalized}@s.whatsapp.net`;
    const deColuna = cardExisting?.coluna ?? null;

    // Upsert kanban_card
    await supabase
      .from('kanban_cards')
      .upsert(
        {
          tenant_id: tenantId,
          chat_id: chatId,
          client_id: clientId,
          coluna,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,chat_id' }
      );

    // Registrar transição manual
    await supabase.from('kanban_transitions').insert({
      tenant_id: tenantId,
      chat_id: chatId,
      client_id: clientId,
      de_coluna: deColuna ?? null,
      para_coluna: coluna,
      autor: 'human',
      motivo: motivo ?? 'Movido manualmente',
    });

    return NextResponse.json({ success: true, coluna });
  } catch (err) {
    console.error('[API Kanban PATCH] Erro:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
