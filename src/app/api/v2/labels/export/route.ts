import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * GET /api/v2/labels/export?label=Pago&format=csv|json
 *
 * Lista ou exporta clientes com uma determinada etiqueta WhatsApp.
 * Sem ?label retorna todas as etiquetas com contagem de contatos.
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const tenantId = profile.tenant_id;

    const { searchParams } = new URL(request.url);
    const label = searchParams.get('label');
    const format = searchParams.get('format') ?? 'json';

    // Sem label → retorna sumário de todas as etiquetas
    if (!label) {
      const { data } = await supabase
        .from('client_labels')
        .select('label_name')
        .eq('tenant_id', tenantId);

      const counts: Record<string, number> = {};
      for (const row of data ?? []) {
        counts[row.label_name] = (counts[row.label_name] ?? 0) + 1;
      }

      const summary = Object.entries(counts).map(([label_name, total]) => ({
        label_name,
        total,
      }));

      return NextResponse.json({ data: summary, total: summary.length });
    }

    // Com label → buscar clientes
    const { data: labeledClients } = await supabase
      .from('client_labels')
      .select(`
        label_name,
        applied_by,
        applied_at,
        clients (
          id, name, phone, email,
          ltv, total_orders, last_order_at
        )
      `)
      .eq('tenant_id', tenantId)
      .eq('label_name', label);

    const rows = (labeledClients ?? []).map((row: any) => ({
      nome: row.clients?.name ?? '',
      telefone: row.clients?.phone ?? '',
      email: row.clients?.email ?? '',
      ultima_compra: row.clients?.last_order_at
        ? new Date(row.clients.last_order_at).toLocaleDateString('pt-BR')
        : '',
      total_gasto: row.clients?.ltv ?? 0,
      total_pedidos: row.clients?.total_orders ?? 0,
      etiqueta: row.label_name,
      aplicado_por: row.applied_by ?? 'anne',
      aplicado_em: row.applied_at
        ? new Date(row.applied_at).toLocaleDateString('pt-BR')
        : '',
    }));

    if (format === 'csv') {
      const BOM = '\uFEFF';
      const header = 'nome;telefone;email;ultima_compra;total_gasto;total_pedidos;etiqueta\r\n';
      const body = rows
        .map(r =>
          [r.nome, r.telefone, r.email, r.ultima_compra, r.total_gasto, r.total_pedidos, r.etiqueta]
            .map(v => (String(v).includes(';') ? `"${v}"` : v))
            .join(';')
        )
        .join('\r\n');

      const safeName = label.replace(/[^a-z0-9_-]/gi, '_');
      return new NextResponse(BOM + header + body, {
        headers: {
          'Content-Type': 'text/csv;charset=utf-8',
          'Content-Disposition': `attachment; filename="etiqueta_${safeName}_${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({ data: rows, total: rows.length });
  } catch (error: any) {
    console.error('[Labels] Export error:', error.message);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
