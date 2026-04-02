-- ============================================================
-- Migration 056 — Função de agregação para o Dashboard
-- Substitui o loop JS que carregava todos os pedidos em memória
-- por uma única query SQL com SUM/COUNT no banco de dados.
-- ============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats(p_tenant_id uuid)
RETURNS TABLE(
  total_orders       bigint,
  total_revenue      numeric,
  paid_revenue       numeric,
  avg_ticket         numeric,
  total_paid         bigint,
  total_delivered    bigint,
  total_pieces_sold  numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH order_stats AS (
    SELECT
      COUNT(*)::bigint                                                        AS total_orders,
      COALESCE(SUM(total::numeric), 0)                                        AS total_revenue,
      COALESCE(SUM(total::numeric) FILTER (WHERE payment_status = 'paid'), 0) AS paid_revenue,
      CASE
        WHEN COUNT(*) > 0 THEN COALESCE(SUM(total::numeric), 0) / COUNT(*)
        ELSE 0
      END                                                                     AS avg_ticket,
      COUNT(*) FILTER (WHERE payment_status = 'paid')::bigint                 AS total_paid,
      COUNT(*) FILTER (WHERE status = 'delivered')::bigint                    AS total_delivered
    FROM orders
    WHERE tenant_id = p_tenant_id
  ),
  piece_stats AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN (item->>'quantidade') ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'quantidade')::numeric
        WHEN (item->>'quantity')   ~ '^[0-9]+(\.[0-9]+)?$' THEN (item->>'quantity')::numeric
        ELSE 1
      END
    ), 0) AS total_pieces_sold
    FROM orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(
        NULLIF(o.metadata->'itens', 'null'::jsonb),
        NULLIF(o.metadata->'items', 'null'::jsonb),
        '[]'::jsonb
      )
    ) AS item
    WHERE o.tenant_id = p_tenant_id
      AND o.metadata IS NOT NULL
      AND (o.metadata ? 'itens' OR o.metadata ? 'items')
  )
  SELECT
    os.total_orders,
    os.total_revenue,
    os.paid_revenue,
    os.avg_ticket,
    os.total_paid,
    os.total_delivered,
    ps.total_pieces_sold
  FROM order_stats os, piece_stats ps;
$$;

COMMENT ON FUNCTION get_dashboard_stats(uuid) IS
  'Agrega KPIs de pedidos em uma única query SQL, evitando carregar todos os registros na memória do Node.js.';
