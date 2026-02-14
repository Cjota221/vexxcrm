'use client';

import { useState, useCallback } from 'react';
import {
  CalendarDays,
  TrendingUp,
  ShoppingBag,
  Users,
  Eye,
  ChevronDown,
  ChevronUp,
  Sparkles,
} from 'lucide-react';
import {
  useSeasonalInsights,
  useCalculateSeasonal,
  useSeasonalBuyers,
} from '@/hooks/useIntelligence';
import { ClientListDrawer, type ClientListItem } from './ClientListDrawer';

interface SeasonalInsightsProps {
  onAskAnne?: (clients: ClientListItem[], segmentName: string) => void;
}

const SEASON_ICONS: Record<string, string> = {
  carnaval: '🎭',
  dia_mulher: '🌸',
  pascoa: '🐣',
  dia_maes: '💐',
  dia_namorados: '💕',
  dia_pais: '👔',
  dia_criancas: '🧸',
  black_friday: '🏷️',
  natal: '🎄',
  ano_novo: '🎆',
};

const SEASON_LABELS: Record<string, string> = {
  carnaval: 'Carnaval',
  dia_mulher: 'Dia da Mulher',
  pascoa: 'Páscoa',
  dia_maes: 'Dia das Mães',
  dia_namorados: 'Dia dos Namorados',
  dia_pais: 'Dia dos Pais',
  dia_criancas: 'Dia das Crianças',
  black_friday: 'Black Friday',
  natal: 'Natal',
  ano_novo: 'Ano Novo',
};

export function SeasonalInsights({ onAskAnne }: SeasonalInsightsProps) {
  const { data: seasonalData, isLoading: isLoadingSeasonal } = useSeasonalInsights();
  const { mutate: calculateSeasonal, isPending: isCalculating } = useCalculateSeasonal();
  const [expanded, setExpanded] = useState(false);
  const [drawerEvent, setDrawerEvent] = useState<string | null>(null);
  const [drawerEventName, setDrawerEventName] = useState('');
  const [drawerPage, setDrawerPage] = useState(1);

  const { data: buyersData, isLoading: isLoadingBuyers } = useSeasonalBuyers(
    drawerEvent, undefined, drawerPage
  );

  const events = seasonalData?.insights || [];
  const visibleEvents = expanded ? events : events.slice(0, 6);
  const hasMore = events.length > 6;

  const openBuyersDrawer = useCallback((eventSlug: string) => {
    setDrawerEvent(eventSlug);
    setDrawerEventName(SEASON_LABELS[eventSlug] || eventSlug);
    setDrawerPage(1);
  }, []);

  const closeBuyersDrawer = useCallback(() => {
    setDrawerEvent(null);
    setDrawerPage(1);
  }, []);

  const handleAskAnne = useCallback((clients: ClientListItem[]) => {
    if (onAskAnne && drawerEventName) {
      onAskAnne(clients, `Compradores - ${drawerEventName}`);
    }
  }, [onAskAnne, drawerEventName]);

  const drawerClients: ClientListItem[] = (buyersData?.buyers || []).map((b) => ({
    id: b.client_id,
    name: b.name,
    phone: b.phone,
    total_orders: b.seasonal_orders,
    total_spent: b.seasonal_spent,
    items_count: b.seasonal_items,
    last_order_at: b.seasonal_last_order,
  }));

  if (isLoadingSeasonal) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="w-6 h-6 border-2 border-crm-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-txt-muted">Carregando análise sazonal...</p>
        </div>
      </div>
    );
  }

  if (!events.length) {
    return (
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <CalendarDays size={20} className="text-orange-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-txt-primary">Análise Sazonal</h3>
            <p className="text-xs text-txt-muted">Nenhum dado sazonal disponível</p>
          </div>
        </div>
        <button
          onClick={() => calculateSeasonal()}
          disabled={isCalculating}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50 transition-colors"
        >
          <Sparkles size={16} />
          {isCalculating ? 'Calculando...' : 'Calcular Análise Sazonal'}
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-2xl border border-surface-border shadow-sm">
        <div className="px-6 py-4 border-b border-surface-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                <CalendarDays size={20} className="text-orange-600" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-txt-primary">Análise Sazonal</h3>
                <p className="text-xs text-txt-muted">Clique para ver quem comprou em cada evento &bull; {events.length} eventos</p>
              </div>
            </div>
            <button
              onClick={() => calculateSeasonal()}
              disabled={isCalculating}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-orange-700 bg-orange-50 rounded-lg hover:bg-orange-100 disabled:opacity-50 transition-colors"
            >
              <Sparkles size={14} />
              {isCalculating ? 'Recalculando...' : 'Recalcular'}
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibleEvents.map((event) => {
            const slug = event.event_slug;
            const icon = SEASON_ICONS[slug] || '📅';
            const label = SEASON_LABELS[slug] || slug;

            return (
              <div
                key={slug}
                onClick={() => openBuyersDrawer(slug)}
                className="relative group rounded-xl border border-surface-border bg-linear-to-br from-white to-orange-50/30 p-4 cursor-pointer transition-all duration-200 hover:shadow-md hover:border-orange-200"
              >
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">{icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-txt-primary">{label}</p>
                    <p className="text-[10px] text-txt-muted">{event.year || new Date().getFullYear()}</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-txt-primary">{event.total_orders || 0}</p>
                    <p className="text-[10px] text-txt-muted flex items-center justify-center gap-0.5"><ShoppingBag size={10} />pedidos</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-green-600">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(event.total_revenue || 0)}
                    </p>
                    <p className="text-[10px] text-txt-muted flex items-center justify-center gap-0.5"><TrendingUp size={10} />receita</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-blue-600">{event.unique_buyers || 0}</p>
                    <p className="text-[10px] text-txt-muted flex items-center justify-center gap-0.5"><Users size={10} />clientes</p>
                  </div>
                </div>
                <div className="absolute inset-0 rounded-xl bg-orange-500/0 group-hover:bg-orange-500/5 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                  <span className="flex items-center gap-1 text-xs font-medium text-orange-600 bg-white/90 px-3 py-1.5 rounded-full shadow-sm">
                    <Eye size={14} /> Ver compradores
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <div className="px-6 py-3 border-t border-surface-border">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-xs font-medium text-txt-secondary hover:text-crm-primary transition-colors mx-auto"
            >
              {expanded ? <><ChevronUp size={14} /> Mostrar menos</> : <><ChevronDown size={14} /> Ver todos os {events.length} eventos</>}
            </button>
          </div>
        )}
      </div>

      <ClientListDrawer
        isOpen={!!drawerEvent}
        onClose={closeBuyersDrawer}
        title={`Compradores - ${drawerEventName}`}
        subtitle={`Quem comprou durante ${drawerEventName}`}
        icon={<span className="text-2xl">{SEASON_ICONS[drawerEvent || ''] || '📅'}</span>}
        headerColor="from-orange-500 to-amber-600"
        clients={drawerClients}
        isLoading={isLoadingBuyers}
        page={drawerPage}
        totalPages={buyersData?.pagination?.total_pages || 1}
        totalClients={buyersData?.pagination?.total || 0}
        onPageChange={setDrawerPage}
        onAskAnne={onAskAnne ? handleAskAnne : undefined}
        seasonalMode
      />
    </>
  );
}