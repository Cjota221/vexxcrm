import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

// ─── GET /api/v2/campanhas/clientes-base ─────────────────────────────────────
// Retorna TODOS os clientes da base (com ou sem pedidos) para uso em campanhas.
// Params:
//   search?           — filtro por nome / telefone (ILIKE)
//   status?           — novo | ativo | vip | risco | inativo  (filtra rfm_segment)
//   estado?           — sigla UF (ex: SP)                     (filtra address_state)
//   has_orders?       — "true" | "false" | omitido → todos
//   last_order_from?  — data ISO 8601 (ex: 2026-01-27) — last_order_at >= este valor
//   last_order_to?    — data ISO 8601 (ex: 2026-02-26) — last_order_at <= este valor
//   page?             — página (1-based, default 1)
//   limit?            — por página (default 50, máx 500)

export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const search          = searchParams.get('search')?.trim() ?? '';
    const status          = searchParams.get('status')?.trim() ?? '';
    const estado          = searchParams.get('estado')?.trim() ?? '';
    const hasOrders       = searchParams.get('has_orders');   // 'true' | 'false' | null
    const lastOrderFrom   = searchParams.get('last_order_from')?.trim() ?? '';  // ISO date
    const lastOrderTo     = searchParams.get('last_order_to')?.trim() ?? '';    // ISO date
    const page            = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit           = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? '50')));
    const offset          = (page - 1) * limit;

    // Mapeamento de status UI → rfm_segment do banco
    const RFM_MAP: Record<string, string> = {
      novo:    'Novo',
      ativo:   'Ativo',
      vip:     'VIP',
      risco:   'Em Risco',
      inativo: 'Inativo',
    };

    // Quando filtrar por período de última compra, precisamos de last_order_at na query

    // ── Query base ─────────────────────────────────────────────────────────────
    let query = supabase
      .from('clients')
      .select(
        'id, name, phone, phone_normalized, rfm_segment, address_city, address_state, total_orders, last_order_at',
        { count: 'exact' }
      )
      .eq('tenant_id', profile.tenant_id)
      .not('phone_normalized', 'is', null);   // precisa de telefone para disparar

    // ── Filtros opcionais ──────────────────────────────────────────────────────
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,phone_normalized.ilike.%${search}%`
      );
    }

    if (status) {
      // Mapeia 'ativo' → 'Ativo' etc; se não mapeado, usa o valor bruto
      const rfmVal = RFM_MAP[status.toLowerCase()] ?? status;
      query = query.ilike('rfm_segment', rfmVal);
    }

    if (estado) {
      query = query.ilike('address_state', estado);
    }

    if (hasOrders === 'true') {
      query = query.gt('total_orders', 0);
    } else if (hasOrders === 'false') {
      query = query.or('total_orders.is.null,total_orders.eq.0');
    }

    // ── Filtro por período da última compra ────────────────────────────────────
    // Quando um desses filtros é usado, exige que o cliente tenha ao menos 1 pedido
    if (lastOrderFrom) {
      query = query.gte('last_order_at', lastOrderFrom);
    }
    if (lastOrderTo) {
      // Inclui o dia inteiro do lastOrderTo (até 23:59:59)
      const toEndOfDay = lastOrderTo.length === 10
        ? `${lastOrderTo}T23:59:59.999Z`
        : lastOrderTo;
      query = query.lte('last_order_at', toEndOfDay);
    }

    // ── Paginação e ordem ──────────────────────────────────────────────────────
    query = query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data: rows, error, count } = await query;

    if (error) {
      console.error('[CLIENTES_BASE] Supabase error:', JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Mapear para Contato (formato do wizard de campanhas) ───────────────────
    const clients = (rows ?? []).map(c => ({
      id:            c.id,
      telefone:      (c.phone_normalized ?? c.phone) as string,
      nome:          c.name as string | undefined,
      cidade:        c.address_city as string | undefined,
      estado:        c.address_state as string | undefined,
      total_orders:  (c.total_orders as number) ?? 0,
      ultimo_pedido: (c.last_order_at as string | undefined) ?? undefined,
      valor_ltv:     undefined as number | undefined,
    }));

    return NextResponse.json({
      clients,
      total:  count ?? 0,
      page,
      limit,
      pages:  Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[CLIENTES_BASE] Unexpected error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
