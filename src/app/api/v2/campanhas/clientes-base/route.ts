import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

// ─── GET /api/v2/campanhas/clientes-base ─────────────────────────────────────
// Retorna TODOS os clientes da base (com ou sem pedidos) para uso em campanhas.
// Params:
//   search?      — filtro por nome / telefone (ILIKE)
//   status?      — novo | ativo | vip | risco | inativo
//   estado?      — sigla UF (ex: SP)
//   has_orders?  — "true" | "false" | omitido → todos
//   page?        — página (1-based, default 1)
//   limit?       — por página (default 200, máx 500)

export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const { searchParams } = new URL(request.url);
    const search     = searchParams.get('search')?.trim() ?? '';
    const status     = searchParams.get('status')?.trim() ?? '';
    const estado     = searchParams.get('estado')?.trim() ?? '';
    const hasOrders  = searchParams.get('has_orders');   // 'true' | 'false' | null
    const page       = Math.max(1, Number(searchParams.get('page') ?? '1'));
    const limit      = Math.min(500, Math.max(1, Number(searchParams.get('limit') ?? '200')));
    const offset     = (page - 1) * limit;

    // ── Query base ─────────────────────────────────────────────────────────────
    let query = supabase
      .from('clients')
      .select(
        'id, name, phone, phone_normalized, status, metadata, total_orders',
        { count: 'exact' }
      )
      .eq('tenant_id', profile.tenant_id)
      .not('phone', 'is', null);   // precisa de telefone para disparar

    // ── Filtros opcionais ──────────────────────────────────────────────────────
    if (search) {
      query = query.or(
        `name.ilike.%${search}%,phone.ilike.%${search}%,phone_normalized.ilike.%${search}%`
      );
    }

    if (status) {
      query = query.eq('status', status);
    }

    if (estado) {
      query = query.ilike('metadata->>estado', estado);
    }

    if (hasOrders === 'true') {
      query = query.gt('total_orders', 0);
    } else if (hasOrders === 'false') {
      query = query.eq('total_orders', 0);
    }

    // ── Paginação e ordem ──────────────────────────────────────────────────────
    query = query
      .order('name', { ascending: true })
      .range(offset, offset + limit - 1);

    const { data: rows, error, count } = await query;

    if (error) {
      console.error('[CLIENTES_BASE]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // ── Mapear para Contato (formato do wizard de campanhas) ───────────────────
    const clients = (rows ?? []).map(c => {
      const meta = (c.metadata ?? {}) as Record<string, unknown>;
      return {
        id:            c.id,
        telefone:      (c.phone_normalized ?? c.phone) as string,
        nome:          c.name as string | undefined,
        cidade:        meta.cidade as string | undefined,
        estado:        meta.estado as string | undefined,
        total_orders:  c.total_orders as number ?? 0,
        // campos opcionais de campanha (podem ser undefined p/ clientes sem pedidos)
        ultimo_pedido: undefined as string | undefined,
        valor_ltv:     undefined as number | undefined,
      };
    });

    return NextResponse.json({
      clients,
      total:    count ?? 0,
      page,
      limit,
      pages:    Math.ceil((count ?? 0) / limit),
    });
  } catch (err) {
    console.error('[CLIENTES_BASE]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
