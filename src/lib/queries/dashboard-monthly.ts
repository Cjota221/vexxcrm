import { api } from '@/lib/api';

export interface MonthlyStatRow {
  mes_key: string;
  pedidos_total: number;
  pedidos_pagos: number;
  faturamento_bruto: number;
  faturamento_pago: number;
  ticket_medio: number;
  pecas_vendidas: number;
  novos_clientes: number;
}

export interface MonthlyStat extends MonthlyStatRow {
  mes: string;
}

const PT_MONTHS: Record<string, string> = {
  '01': 'Jan', '02': 'Fev', '03': 'Mar', '04': 'Abr',
  '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Set', '10': 'Out', '11': 'Nov', '12': 'Dez',
};

function formatMonthLabel(mesKey: string): string {
  const [year, month] = mesKey.split('-');
  return `${PT_MONTHS[month] ?? month} ${year}`;
}

export async function getMonthlyStats(months = 4): Promise<MonthlyStat[]> {
  const response = await api.get<MonthlyStatRow[]>('/api/dashboard/monthly', {
    months: String(months),
  });
  if (response.error) throw new Error(response.error);
  const rows = response.data ?? [];
  return rows.map((row) => ({
    ...row,
    mes: formatMonthLabel(row.mes_key),
    pedidos_total:     Number(row.pedidos_total),
    pedidos_pagos:     Number(row.pedidos_pagos),
    faturamento_bruto: Number(row.faturamento_bruto),
    faturamento_pago:  Number(row.faturamento_pago),
    ticket_medio:      Number(row.ticket_medio),
    pecas_vendidas:    Number(row.pecas_vendidas),
    novos_clientes:    Number(row.novos_clientes),
  }));
}
