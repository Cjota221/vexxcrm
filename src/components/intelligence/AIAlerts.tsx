'use client';

import { useState, useCallback } from 'react';
import {
  AlertTriangle,
  AlertOctagon,
  ShieldAlert,
  Bell,
  Zap,
  ArrowRight,
  Users,
} from 'lucide-react';
import { useSegmentClients } from '@/hooks/useIntelligence';
import { ClientListDrawer, type ClientListItem } from './ClientListDrawer';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface Alert {
  type: 'critical' | 'warning' | 'info';
  message: string;
  action: string;
  /** Segmento RFM para abrir no drawer */
  segment?: string;
}

interface AIAlertsProps {
  alerts: Alert[];
  kpis: {
    vip_count: number;
    risk_count: number;
    attention_count: number;
    upsell_count: number;
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function AIAlerts({ alerts, kpis }: AIAlertsProps) {
  const [drawerSegment, setDrawerSegment] = useState<string | null>(null);
  const [drawerTitle, setDrawerTitle] = useState('');
  const [drawerSubtitle, setDrawerSubtitle] = useState('');
  const [drawerHeaderColor, setDrawerHeaderColor] = useState('from-crm-primary to-crm-secondary');
  const [drawerPage, setDrawerPage] = useState(1);
  const [drawerSearch, setDrawerSearch] = useState('');

  const { data: segmentClientsData, isLoading: isLoadingClients } = useSegmentClients(
    drawerSegment, drawerPage, drawerSearch
  );

  const openDrawer = useCallback((segment: string, title: string, subtitle: string, headerColor: string) => {
    setDrawerSegment(segment);
    setDrawerTitle(title);
    setDrawerSubtitle(subtitle);
    setDrawerHeaderColor(headerColor);
    setDrawerPage(1);
    setDrawerSearch('');
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerSegment(null);
    setDrawerPage(1);
    setDrawerSearch('');
  }, []);

  // Gerar alertas automáticos baseados nos KPIs se não houver
  const generatedAlerts: Alert[] = alerts.length > 0 ? alerts : [];

  if (kpis.risk_count > 0 && !generatedAlerts.some(a => a.type === 'critical')) {
    generatedAlerts.push({
      type: 'critical',
      message: `${kpis.risk_count} cliente${kpis.risk_count > 1 ? 's' : ''} em risco de churn — eram frequentes mas pararam de comprar`,
      action: 'Ver clientes e criar campanha de reativação',
      segment: 'At Risk',
    });
  }

  if (kpis.attention_count > 0) {
    generatedAlerts.push({
      type: 'warning',
      message: `${kpis.attention_count} cliente${kpis.attention_count > 1 ? 's' : ''} precisam de atenção — esfriando`,
      action: 'Ver clientes e enviar oferta personalizada',
      segment: 'Need Attention',
    });
  }

  if (kpis.upsell_count > 0) {
    generatedAlerts.push({
      type: 'info',
      message: `${kpis.upsell_count} cliente${kpis.upsell_count > 1 ? 's' : ''} prontos para upsell — ticket crescente`,
      action: 'Ver clientes e sugerir produtos premium',
      segment: 'Potential Loyalist',
    });
  }

  if (kpis.vip_count > 0) {
    generatedAlerts.push({
      type: 'info',
      message: `${kpis.vip_count} cliente${kpis.vip_count > 1 ? 's' : ''} VIP identificados — manter relacionamento`,
      action: 'Ver clientes VIP',
      segment: 'Champions',
    });
  }

  const drawerClients: ClientListItem[] = (segmentClientsData?.clients || []).map(c => ({
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    rfm_segment: c.rfm_segment, total_orders: c.total_orders,
    total_spent: c.total_spent, avg_ticket: c.avg_ticket,
    last_order_at: c.last_order_at, is_vip: c.flag_auto_vip,
    is_at_risk: c.flag_churn_risk, churn_probability: c.churn_probability,
  }));

  if (generatedAlerts.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
          <Zap size={28} className="text-green-500" />
        </div>
        <h3 className="text-base font-semibold text-txt-primary mb-1">Nenhum alerta pendente</h3>
        <p className="text-sm text-txt-muted">
          Execute o cálculo RFM para gerar insights e alertas automáticos.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm">
        {/* Header */}
        <div className="px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <ShieldAlert size={20} className="text-red-600" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-txt-primary">Alertas da IA</h3>
              <p className="text-xs text-txt-muted">
                {generatedAlerts.filter(a => a.type === 'critical').length} críticos,{' '}
                {generatedAlerts.filter(a => a.type === 'warning').length} avisos,{' '}
                {generatedAlerts.filter(a => a.type === 'info').length} informações
              </p>
            </div>
          </div>
        </div>

        {/* Lista de alertas */}
        <div className="p-4 space-y-3">
          {generatedAlerts
            .sort((a, b) => {
              const order = { critical: 0, warning: 1, info: 2 };
              return order[a.type] - order[b.type];
            })
            .map((alert, i) => (
              <div
                key={i}
                className={`
                  rounded-xl p-4 border flex items-start gap-3
                  ${alert.type === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : alert.type === 'warning'
                    ? 'bg-orange-50 border-orange-200'
                    : 'bg-blue-50 border-blue-200'
                  }
                `}
              >
                {/* Ícone */}
                <div className={`
                  w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5
                  ${alert.type === 'critical'
                    ? 'bg-red-100'
                    : alert.type === 'warning'
                    ? 'bg-orange-100'
                    : 'bg-blue-100'
                  }
                `}>
                  {alert.type === 'critical' ? (
                    <AlertOctagon size={16} className="text-red-600" />
                  ) : alert.type === 'warning' ? (
                    <AlertTriangle size={16} className="text-orange-600" />
                  ) : (
                    <Bell size={16} className="text-blue-600" />
                  )}
                </div>

                {/* Conteúdo */}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${
                    alert.type === 'critical' ? 'text-red-800' :
                    alert.type === 'warning' ? 'text-orange-800' :
                    'text-blue-800'
                  }`}>
                    {alert.message}
                  </p>

                  {alert.segment ? (
                    <button
                      onClick={() => openDrawer(
                        alert.segment!,
                        alert.message,
                        alert.action,
                        alert.type === 'critical'
                          ? 'from-red-500 to-rose-700'
                          : alert.type === 'warning'
                          ? 'from-orange-500 to-amber-600'
                          : 'from-blue-500 to-indigo-600'
                      )}
                      className={`mt-2 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-all active:scale-95 ${
                        alert.type === 'critical'
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : alert.type === 'warning'
                          ? 'bg-orange-100 text-orange-700 hover:bg-orange-200'
                          : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                      }`}
                    >
                      <Users size={12} />
                      Ver clientes
                      <ArrowRight size={12} />
                    </button>
                  ) : (
                    <div className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
                      alert.type === 'critical' ? 'text-red-600' :
                      alert.type === 'warning' ? 'text-orange-600' :
                      'text-blue-600'
                    }`}>
                      <ArrowRight size={12} />
                      {alert.action}
                    </div>
                  )}
                </div>

                {/* Badge de tipo */}
                <span className={`
                  px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide shrink-0
                  ${alert.type === 'critical'
                    ? 'bg-red-200 text-red-800'
                    : alert.type === 'warning'
                    ? 'bg-orange-200 text-orange-800'
                    : 'bg-blue-200 text-blue-800'
                  }
                `}>
                  {alert.type === 'critical' ? 'CRÍTICO' : alert.type === 'warning' ? 'AVISO' : 'INFO'}
                </span>
              </div>
            ))}
        </div>
      </div>

      {/* Drawer de clientes do alerta */}
      <ClientListDrawer
        isOpen={!!drawerSegment}
        onClose={closeDrawer}
        title={drawerTitle}
        subtitle={`Segmento: ${drawerSegment || ''}`}
        headerColor={drawerHeaderColor}
        clients={drawerClients}
        isLoading={isLoadingClients}
        page={drawerPage}
        totalPages={segmentClientsData?.pagination?.total_pages ?? 1}
        totalClients={segmentClientsData?.pagination?.total ?? 0}
        onPageChange={setDrawerPage}
        search={drawerSearch}
        onSearchChange={(s) => { setDrawerSearch(s); setDrawerPage(1); }}
        segmentName={drawerSegment || undefined}
      />
    </>
  );
}
