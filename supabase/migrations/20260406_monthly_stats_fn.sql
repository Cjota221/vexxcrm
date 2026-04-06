-- Função: get_monthly_stats
-- Retorna agregações por mês para os últimos N meses de um tenant.
-- Usada pelo bloco "Faturamento Mensal" no dashboard.

CREATE OR REPLACE FUNCTION get_monthly_stats(
  p_tenant_id UUID,
  p_months    INT DEFAULT 4
)
RETURNS TABLE (
  mes_key          TEXT,
  pedidos_total    BIGINT,
  pedidos_pagos    BIGINT,
  faturamento_bruto NUMERIC,
  faturamento_pago  NUMERIC,
  ticket_medio      NUMERIC,
  pecas_vendidas    NUMERIC,
  novos_clientes    BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  WITH months_series AS (
    SELECT
      date_trunc('month', now() AT TIME ZONE 'America/Sao_Paulo')
        - (n || ' months')::interval AS month_start
    FROM generate_series(0, p_months - 1) n
  ),
  order_agg AS (
    SELECT
      date_trunc('month', o.created_at AT TIME ZONE 'America/Sao_Paulo') AS month_start,
      COUNT(*)::BIGINT                                                      AS pedidos_total,
      COUNT(*) FILTER (WHERE o.payment_status = 'paid')::BIGINT             AS pedidos_pagos,
      COALESCE(SUM(o.total), 0)                                             AS faturamento_bruto,
      COALESCE(SUM(o.total) FILTER (WHERE o.payment_status = 'paid'), 0)    AS faturamento_pago,
      COALESCE(SUM(oi_totals.total_qty), 0)                                 AS pecas_vendidas
    FROM orders o
    LEFT JOIN (
      SELECT order_id, SUM(quantity) AS total_qty
      FROM order_items
      WHERE tenant_id = p_tenant_id
      GROUP BY order_id
    ) oi_totals ON oi_totals.order_id = o.id
    WHERE o.tenant_id = p_tenant_id
      AND o.created_at >= date_trunc(
            'month', now() AT TIME ZONE 'America/Sao_Paulo'
          ) - ((p_months - 1) || ' months')::interval
    GROUP BY date_trunc('month', o.created_at AT TIME ZONE 'America/Sao_Paulo')
  ),
  client_agg AS (
    SELECT
      date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo') AS month_start,
      COUNT(*)::BIGINT AS novos_clientes
    FROM clients
    WHERE tenant_id = p_tenant_id
      AND created_at >= date_trunc(
            'month', now() AT TIME ZONE 'America/Sao_Paulo'
          ) - ((p_months - 1) || ' months')::interval
    GROUP BY date_trunc('month', created_at AT TIME ZONE 'America/Sao_Paulo')
  )
  SELECT
    to_char(ms.month_start, 'YYYY-MM')                          AS mes_key,
    COALESCE(oa.pedidos_total, 0)                               AS pedidos_total,
    COALESCE(oa.pedidos_pagos, 0)                               AS pedidos_pagos,
    COALESCE(oa.faturamento_bruto, 0)                           AS faturamento_bruto,
    COALESCE(oa.faturamento_pago, 0)                            AS faturamento_pago,
    CASE
      WHEN COALESCE(oa.pedidos_pagos, 0) > 0
        THEN COALESCE(oa.faturamento_pago, 0) / oa.pedidos_pagos
      ELSE 0
    END                                                          AS ticket_medio,
    COALESCE(oa.pecas_vendidas, 0)                              AS pecas_vendidas,
    COALESCE(ca.novos_clientes, 0)                              AS novos_clientes
  FROM months_series ms
  LEFT JOIN order_agg  oa ON oa.month_start = ms.month_start
  LEFT JOIN client_agg ca ON ca.month_start = ms.month_start
  ORDER BY ms.month_start DESC;
$$;

-- Permitir que usuários autenticados chamem a função
GRANT EXECUTE ON FUNCTION get_monthly_stats(UUID, INT) TO authenticated;
