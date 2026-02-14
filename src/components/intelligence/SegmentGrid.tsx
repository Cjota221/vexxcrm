'use client';

import { useState, useCallback } from 'react';
import {
  Crown,
  Heart,
  TrendingUp,
  UserPlus,
  Star,
  Bell,
  Moon,
  AlertTriangle,
  AlertOctagon,
  PauseCircle,
  UserX,
  Users,
  Zap,
  Target,
  ShieldAlert,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Eye,
} from 'lucide-react';
import type { RFMSegmentName } from '@/lib/rfm-segments';
import { RFM_ACTIONS } from '@/lib/rfm-segments';
import { useSegmentClients } from '@/hooks/useIntelligence';
import { ClientListDrawer, type ClientListItem } from './ClientListDrawer';

interface SegmentData {
  count: number;
  avg_churn: number;
  vip_count: number;
  risk_count: number;
}

interface SegmentGridProps {
  distribution: Record<string, SegmentData>;
  totalClients: number;
  onAskAnne?: (clients: ClientListItem[], segmentName: string) => void;
}

const SEGMENT_CONFIG: Record<string, {
  label: string;
  labelPt: string;
  icon: React.ReactNode;
  color: string;
  bgColor: string;
  borderColor: string;
  headerGradient: string;
  priority: number;
}> = {
  'Champions': {
    label: 'Champions', labelPt: 'Campeões', icon: <Crown size={20} />,
    color: 'text-yellow-700', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200',
    headerGradient: 'from-yellow-500 to-amber-600', priority: 1,
  },
  'Loyal Customers': {
    label: 'Loyal Customers', labelPt: 'Clientes Fiéis', icon: <Heart size={20} />,
    color: 'text-green-700', bgColor: 'bg-green-50', borderColor: 'border-green-200',
    headerGradient: 'from-green-500 to-emerald-600', priority: 2,
  },
  'Potential Loyalist': {
    label: 'Potential Loyalist', labelPt: 'Potencial Fiel', icon: <TrendingUp size={20} />,
    color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200',
    headerGradient: 'from-blue-500 to-indigo-600', priority: 3,
  },
  'New Customers': {
    label: 'New Customers', labelPt: 'Novos Clientes', icon: <UserPlus size={20} />,
    color: 'text-cyan-700', bgColor: 'bg-cyan-50', borderColor: 'border-cyan-200',
    headerGradient: 'from-cyan-500 to-blue-600', priority: 4,
  },
  'Promising': {
    label: 'Promising', labelPt: 'Promissores', icon: <Star size={20} />,
    color: 'text-purple-700', bgColor: 'bg-purple-50', borderColor: 'border-purple-200',
    headerGradient: 'from-purple-500 to-violet-600', priority: 5,
  },
  'Need Attention': {
    label: 'Need Attention', labelPt: 'Precisa Atenção', icon: <Bell size={20} />,
    color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200',
    headerGradient: 'from-orange-500 to-amber-600', priority: 6,
  },
  'About To Sleep': {
    label: 'About To Sleep', labelPt: 'Quase Dormindo', icon: <Moon size={20} />,
    color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-100',
    headerGradient: 'from-red-400 to-rose-600', priority: 7,
  },
  'At Risk': {
    label: 'At Risk', labelPt: 'Em Risco', icon: <AlertTriangle size={20} />,
    color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200',
    headerGradient: 'from-red-500 to-rose-700', priority: 8,
  },
  'Cant Lose Them': {
    label: 'Cant Lose Them', labelPt: 'Não Posso Perder', icon: <AlertOctagon size={20} />,
    color: 'text-red-800', bgColor: 'bg-red-100', borderColor: 'border-red-300',
    headerGradient: 'from-red-600 to-rose-800', priority: 9,
  },
  'Hibernating': {
    label: 'Hibernating', labelPt: 'Hibernando', icon: <PauseCircle size={20} />,
    color: 'text-gray-600', bgColor: 'bg-gray-50', borderColor: 'border-gray-200',
    headerGradient: 'from-gray-500 to-gray-700', priority: 10,
  },
  'Lost': {
    label: 'Lost', labelPt: 'Perdidos', icon: <UserX size={20} />,
    color: 'text-gray-500', bgColor: 'bg-gray-100', borderColor: 'border-gray-200',
    headerGradient: 'from-gray-400 to-gray-600', priority: 11,
  },
};

export function SegmentGrid({ distribution, totalClients, onAskAnne }: SegmentGridProps) {
  const [expandedSegment, setExpandedSegment] = useState<string | null>(null);
  const [drawerSegment, setDrawerSegment] = useState<string | null>(null);
  const [drawerPage, setDrawerPage] = useState(1);
  const [drawerSearch, setDrawerSearch] = useState('');

  const { data: segmentClientsData, isLoading: isLoadingClients } = useSegmentClients(
    drawerSegment, drawerPage, drawerSearch
  );

  const allSegments = Object.keys(SEGMENT_CONFIG).map(name => {
    const data = distribution[name] || { count: 0, avg_churn: 0, vip_count: 0, risk_count: 0 };
    return { name, data };
  });

  const openDrawer = useCallback((segmentName: string) => {
    setDrawerSegment(segmentName);
    setDrawerPage(1);
    setDrawerSearch('');
  }, []);

  const closeDrawer = useCallback(() => {
    setDrawerSegment(null);
    setDrawerPage(1);
    setDrawerSearch('');
  }, []);

  const handleSearchChange = useCallback((s: string) => {
    setDrawerSearch(s);
    setDrawerPage(1);
  }, []);

  const handleAskAnne = useCallback((clients: ClientListItem[]) => {
    if (onAskAnne && drawerSegment) {
      const config = SEGMENT_CONFIG[drawerSegment];
      onAskAnne(clients, config?.labelPt || drawerSegment);
    }
  }, [onAskAnne, drawerSegment]);

  const drawerClients: ClientListItem[] = (segmentClientsData?.clients || []).map(c => ({
    id: c.id, name: c.name, phone: c.phone, email: c.email,
    rfm_segment: c.rfm_segment, total_orders: c.total_orders,
    total_spent: c.total_spent, avg_ticket: c.avg_ticket,
    last_order_at: c.last_order_at, is_vip: c.flag_auto_vip,
    is_at_risk: c.flag_churn_risk, churn_probability: c.churn_probability,
  }));

  const drawerConfig = drawerSegment ? SEGMENT_CONFIG[drawerSegment] : null;

  return (
    <>
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm">
        <div className="px-6 py-4 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Users size={20} className="text-crm-primary" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-txt-primary">Segmentos RFM</h3>
              <p className="text-xs text-txt-muted">Clique em um segmento para ver os clientes &bull; {totalClients} clientes</p>
            </div>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {allSegments.map(({ name, data }) => {
            const config = SEGMENT_CONFIG[name];
            if (!config) return null;
            const pct = totalClients > 0 ? ((data.count / totalClients) * 100).toFixed(1) : '0';
            const isExpanded = expandedSegment === name;
            const actions = RFM_ACTIONS[name as RFMSegmentName] || [];

            return (
              <div
                key={name}
                className={`rounded-xl border ${config.borderColor} ${config.bgColor} transition-all duration-200 cursor-pointer ${isExpanded ? 'ring-2 ring-crm-primary/30 col-span-1 sm:col-span-2' : 'hover:shadow-md'}`}
                onClick={() => setExpandedSegment(isExpanded ? null : name)}
              >
                <div className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className={config.color}>{config.icon}</span>
                      <div>
                        <p className={`text-sm font-semibold ${config.color}`}>{config.labelPt}</p>
                        <p className="text-[10px] text-txt-muted">{config.label}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-txt-primary">{data.count}</p>
                      <p className="text-[10px] text-txt-muted">{pct}%</p>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-white/50 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${config.priority <= 3 ? 'bg-green-500' : config.priority <= 5 ? 'bg-blue-500' : config.priority <= 7 ? 'bg-orange-500' : 'bg-red-500'}`}
                      style={{ width: `${Math.max(parseFloat(pct), 2)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-txt-muted">
                    {data.vip_count > 0 && <span className="flex items-center gap-1"><Crown size={12} className="text-yellow-500" />{data.vip_count} VIP</span>}
                    {data.risk_count > 0 && <span className="flex items-center gap-1"><ShieldAlert size={12} className="text-red-500" />{data.risk_count} risco</span>}
                    {data.avg_churn > 0 && <span className="flex items-center gap-1">{data.avg_churn > 50 ? <ArrowDownRight size={12} className="text-red-500" /> : data.avg_churn > 20 ? <Minus size={12} className="text-orange-500" /> : <ArrowUpRight size={12} className="text-green-500" />}{data.avg_churn}% churn</span>}
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-white/50">
                      {actions.length > 0 && (
                        <>
                          <p className="text-[11px] font-semibold text-txt-secondary mb-2 flex items-center gap-1"><Zap size={12} /> Ações Recomendadas</p>
                          <ul className="space-y-1 mb-3">
                            {actions.map((action, i) => (
                              <li key={i} className="text-[11px] text-txt-secondary flex items-start gap-1.5"><Target size={10} className="shrink-0 mt-0.5" />{action}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {data.count > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openDrawer(name); }}
                          className={`w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg text-white transition-all hover:opacity-90 bg-linear-to-r ${config.headerGradient}`}
                        >
                          <Eye size={14} />Ver {data.count} clientes
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ClientListDrawer
        isOpen={!!drawerSegment}
        onClose={closeDrawer}
        title={drawerConfig?.labelPt || ''}
        subtitle={`Segmento RFM: ${drawerConfig?.label || ''}`}
        icon={drawerConfig?.icon ? <span className="text-white">{drawerConfig.icon}</span> : undefined}
        headerColor={drawerConfig?.headerGradient || 'from-crm-primary to-crm-secondary'}
        clients={drawerClients}
        isLoading={isLoadingClients}
        page={drawerPage}
        totalPages={segmentClientsData?.pagination?.total_pages || 1}
        totalClients={segmentClientsData?.pagination?.total || 0}
        onPageChange={setDrawerPage}
        search={drawerSearch}
        onSearchChange={handleSearchChange}
        onAskAnne={onAskAnne ? handleAskAnne : undefined}
      />
    </>
  );
}