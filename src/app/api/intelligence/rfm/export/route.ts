/**
 * GET /api/intelligence/rfm/export?segment=At+Risk&format=csv
 *
 * Exporta TODOS os clientes de um segmento RFM em CSV (até 5.000 registros).
 * Formato compatível com importação de campanhas de disparo em massa.
 *
 * Colunas:
 *   nome, telefone, email, segmento_rfm, total_pedidos, total_gasto,
 *   ticket_medio, ultimo_pedido, probabilidade_churn, vip, em_risco
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

const MAX_ROWS = 5000;

/** Escapa uma célula CSV (adiciona aspas se necessário) */
function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  // Se contém vírgula, aspas ou quebra de linha → envolve em aspas e escapa aspas internas
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes(';')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function buildCsvRow(cols: Array<string | number | null | undefined>): string {
  return cols.map(csvCell).join(';') + '\r\n';
}

export async function GET(request: NextRequest) {
  try {
    // ── Auth ──────────────────────────────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Perfil não encontrado' }, { status: 404 });
    }

    const tenantId = profile.tenant_id;
    const { searchParams } = new URL(request.url);
    const segment = searchParams.get('segment') || '';
    const search = searchParams.get('search') || '';
    // Exportar apenas selecionados (IDs separados por vírgula)
    const selectedIds = searchParams.get('ids')?.split(',').filter(Boolean) || [];

    // ── Query ─────────────────────────────────────────────
    let query = supabase
      .from('clients')
      .select(`
        id, name, phone, email,
        rfm_segment,
        total_orders, avg_ticket, ltv, last_order_at,
        churn_probability, flag_auto_vip, flag_churn_risk
      `)
      .eq('tenant_id', tenantId)
      .limit(MAX_ROWS)
      .order('ltv', { ascending: false, nullsFirst: false });

    // Filtro por segmento (obrigatório se não filtrar por IDs)
    if (selectedIds.length > 0) {
      query = query.in('id', selectedIds);
    } else {
      if (!segment) {
        return NextResponse.json({ error: 'Parâmetro segment é obrigatório' }, { status: 400 });
      }
      query = query.eq('rfm_segment', segment);
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);
    }

    const { data: clients, error: queryError } = await query;

    if (queryError) {
      console.error('[Export RFM] Erro:', queryError);
      return NextResponse.json({ error: 'Erro ao exportar', details: queryError.message }, { status: 500 });
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({ error: 'Nenhum cliente encontrado' }, { status: 404 });
    }

    // ── Montar CSV ────────────────────────────────────────
    // BOM UTF-8 para abrir corretamente no Excel
    const BOM = '\uFEFF';

    const header = buildCsvRow([
      'nome',
      'telefone',
      'email',
      'segmento_rfm',
      'total_pedidos',
      'total_gasto',
      'ticket_medio',
      'ultimo_pedido',
      'probabilidade_churn',
      'vip',
      'em_risco',
    ]);

    const rows = clients.map(c => buildCsvRow([
      c.name || '',
      c.phone || '',
      c.email || '',
      c.rfm_segment || segment || '',
      c.total_orders ?? 0,
      c.ltv != null ? (c.ltv / 100).toFixed(2) : '0.00',
      c.avg_ticket != null ? (c.avg_ticket / 100).toFixed(2) : '0.00',
      c.last_order_at
        ? new Date(c.last_order_at).toLocaleDateString('pt-BR')
        : '',
      c.churn_probability != null ? `${c.churn_probability}%` : '',
      c.flag_auto_vip ? 'Sim' : 'Não',
      c.flag_churn_risk ? 'Sim' : 'Não',
    ]));

    const csv = BOM + header + rows.join('');

    // ── Nome do arquivo ───────────────────────────────────
    const safeName = (segment || 'clientes')
      .replace(/[^a-zA-Z0-9_\-\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .toLowerCase();
    const today = new Date().toISOString().slice(0, 10);
    const filename = `vexx_${safeName}_${today}.csv`;

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('[Export RFM] Erro fatal:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
