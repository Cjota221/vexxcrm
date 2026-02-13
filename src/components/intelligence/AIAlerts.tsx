'use client';

import {
  AlertTriangle,
  AlertOctagon,
  Crown,
  TrendingUp,
  ShieldAlert,
  Bell,
  UserX,
  PhoneCall,
  Mail,
  Zap,
  ArrowRight,
} from 'lucide-react';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface Alert {
  type: 'critical' | 'warning' | 'info';
  message: string;
  action: string;
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
  // Gerar alertas automáticos baseados nos KPIs se não houver
  const generatedAlerts: Alert[] = alerts.length > 0 ? alerts : [];

  if (kpis.risk_count > 0 && !generatedAlerts.some(a => a.type === 'critical')) {
    generatedAlerts.push({
      type: 'critical',
      message: `${kpis.risk_count} cliente${kpis.risk_count > 1 ? 's' : ''} em risco de churn — eram frequentes mas pararam de comprar`,
      action: 'Criar campanha de reativação urgente',
    });
  }

  if (kpis.attention_count > 0) {
    generatedAlerts.push({
      type: 'warning',
      message: `${kpis.attention_count} cliente${kpis.attention_count > 1 ? 's' : ''} precisam de atenção — esfriando`,
      action: 'Enviar oferta personalizada',
    });
  }

  if (kpis.upsell_count > 0) {
    generatedAlerts.push({
      type: 'info',
      message: `${kpis.upsell_count} cliente${kpis.upsell_count > 1 ? 's' : ''} prontos para upsell — ticket crescente`,
      action: 'Sugerir produtos premium',
    });
  }

  if (kpis.vip_count > 0) {
    generatedAlerts.push({
      type: 'info',
      message: `${kpis.vip_count} cliente${kpis.vip_count > 1 ? 's' : ''} VIP identificados — manter relacionamento`,
      action: 'Programa de fidelidade exclusivo',
    });
  }

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
                rounded-xl p-4 border flex items-start gap-3 transition-all hover:shadow-sm
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
                w-8 h-8 rounded-lg flex items-center justify-center shrink-0
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
                <div className={`mt-2 flex items-center gap-1.5 text-xs font-medium ${
                  alert.type === 'critical' ? 'text-red-600' :
                  alert.type === 'warning' ? 'text-orange-600' :
                  'text-blue-600'
                }`}>
                  <ArrowRight size={12} />
                  {alert.action}
                </div>
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
  );
}
