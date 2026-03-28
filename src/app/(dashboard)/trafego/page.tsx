'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  RefreshCw, TrendingUp, TrendingDown, AlertTriangle, CheckCircle,
  Clock, ChevronRight, ChevronLeft, Copy, Pause, Play, Users,
  Image as ImageIcon, FileText, BarChart3, Zap, Target, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

interface CampaignAlert {
  tipo: 'danger' | 'warning';
  mensagem: string;
  acao?: string;
}

interface Campaign {
  id: string;
  nome: string;
  status: string;
  objetivo: string;
  spend: number;
  revenue: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  roas: number;
  cpl: number;
  frequency: number;
  orcamento_diario: number | null;
  date_start?: string;
  date_stop?: string;
  alerts: CampaignAlert[];
  health: 'great' | 'ok' | 'bad' | 'paused';
}

interface Summary {
  totalSpend: number;
  totalRevenue: number;
  totalLeads: number;
  totalClicks: number;
  totalRoas: number;
  totalCpl: number;
  totalCpc: number;
}

interface MetricsData {
  connected: boolean;
  accountName?: string;
  period?: string;
  lastAnalysis?: string | null;
  summary?: Summary;
  campaigns?: Campaign[];
  error?: string;
}

type Period = '1d' | '7d' | '15d' | '30d';
type Tab = 'campanhas' | 'criativos' | 'publicos' | 'textos';

/* ─── Formatadores ─────────────────────────────────────────────────────────── */

function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function brl2(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}
function n0(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
function pct(v: number): string {
  return v.toFixed(1) + '%';
}
function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return `hoje às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return formatDate(iso);
}

/* ─── Sub-componentes ──────────────────────────────────────────────────────── */

function PeriodBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
        active ? 'bg-crm-primary text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
      )}
    >
      {label}
    </button>
  );
}

function MetricCard({
  label, value, sub, badge, badgeColor, icon,
}: {
  label: string;
  value: string;
  sub?: string;
  badge?: string;
  badgeColor?: 'green' | 'yellow' | 'red' | 'gray';
  icon: React.ReactNode;
}) {
  const badgeStyles = {
    green:  'bg-green-100 text-green-700',
    yellow: 'bg-amber-100 text-amber-700',
    red:    'bg-red-100 text-red-700',
    gray:   'bg-gray-100 text-gray-600',
  };
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-start justify-between mb-3">
        <div className="text-gray-400">{icon}</div>
        {badge && (
          <span className={cn('text-xs font-semibold px-2 py-0.5 rounded-full', badgeStyles[badgeColor || 'gray'])}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      <div className="text-sm text-gray-500 mt-0.5">{label}</div>
      {sub && <div className="text-xs text-gray-400 mt-1">{sub}</div>}
    </div>
  );
}

function HealthBadge({ health }: { health: Campaign['health'] }) {
  const map = {
    great:  { label: '🟢 Ótima',    cls: 'bg-green-100 text-green-700' },
    ok:     { label: '🟡 Atenção',  cls: 'bg-amber-100 text-amber-700' },
    bad:    { label: '🔴 Pausar',   cls: 'bg-red-100 text-red-700' },
    paused: { label: '⏸️ Pausada',  cls: 'bg-gray-100 text-gray-600' },
  };
  const { label, cls } = map[health];
  return (
    <span className={cn('px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap', cls)}>
      {label}
    </span>
  );
}

/* ─── Painel lateral de campanha ───────────────────────────────────────────── */

function CampaignDetailPanel({
  campaign,
  onClose,
  onQueueAction,
}: {
  campaign: Campaign;
  onClose: () => void;
  onQueueAction: (campaignId: string, action: string) => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <div>
          <h2 className="font-bold text-gray-900 text-lg leading-tight">{campaign.nome}</h2>
          <HealthBadge health={campaign.health} />
        </div>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Alertas */}
        {campaign.alerts.length > 0 && (
          <div className="space-y-2">
            {campaign.alerts.map((alert, i) => (
              <div
                key={i}
                className={cn(
                  'p-3 rounded-xl text-sm',
                  alert.tipo === 'danger' ? 'bg-red-50 text-red-800' : 'bg-amber-50 text-amber-800'
                )}
              >
                {alert.tipo === 'danger' ? '🔴' : '🟡'} {alert.mensagem}
              </div>
            ))}
          </div>
        )}

        {/* Métricas */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Números do período</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Gastei', value: brl(campaign.spend) },
              { label: 'Retorno', value: brl(campaign.revenue), sub: `${campaign.roas.toFixed(1)}x ROAS` },
              { label: 'Leads', value: n0(campaign.leads), sub: campaign.leads > 0 ? `${brl2(campaign.cpl)}/lead` : '—' },
              { label: 'Cliques', value: n0(campaign.clicks), sub: `${brl2(campaign.cpc)}/clique` },
              { label: 'Alcance', value: n0(campaign.reach) },
              { label: 'Impressões', value: n0(campaign.impressions) },
              { label: 'Taxa de clique', value: pct(campaign.ctr) },
              { label: 'Frequência', value: campaign.frequency.toFixed(1) + 'x', sub: campaign.frequency > 4 ? '⚠️ saturando' : 'normal' },
            ].map(({ label, value, sub }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-500">{label}</div>
                <div className="font-bold text-gray-900">{value}</div>
                {sub && <div className="text-xs text-gray-400">{sub}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Período */}
        {campaign.date_start && (
          <div className="text-xs text-gray-400 text-center">
            {formatDate(campaign.date_start)} — {campaign.date_stop ? formatDate(campaign.date_stop) : 'hoje'}
          </div>
        )}

        {/* Ações */}
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Ações</h3>
          <div className="space-y-2">
            {campaign.status === 'ACTIVE' ? (
              <button
                onClick={() => onQueueAction(campaign.id, 'pausar')}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 text-red-700 hover:bg-red-50 transition-colors font-medium text-sm"
              >
                <Pause size={16} />
                Pausar esta campanha
              </button>
            ) : (
              <button
                onClick={() => onQueueAction(campaign.id, 'ativar')}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-green-200 text-green-700 hover:bg-green-50 transition-colors font-medium text-sm"
              >
                <Play size={16} />
                Ativar esta campanha
              </button>
            )}
            <button
              onClick={() => onQueueAction(campaign.id, 'pedir_copy')}
              className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors font-medium text-sm"
            >
              <FileText size={16} />
              Cláudio, escreva um texto novo para essa campanha
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Abas de conteúdo ─────────────────────────────────────────────────────── */

// Públicos pré-configurados CJ Rasteirinhas
const PUBLICOS_CJ = [
  {
    nome: '👩 Revendedoras — Brasil',
    descricao: 'Mulheres 25-50 anos | Atacado, moda, revenda',
    tamanho: '~450.000 pessoas',
    interesses: 'Atacado de moda, revenda, renda extra, empreendedorismo feminino, sacoleira, calçados femininos',
    campanhas: 'Atacado Verão',
  },
  {
    nome: '🏪 Candidatas C4 Franquias',
    descricao: 'Mulheres 22-45 anos | Franquia, negócio próprio',
    tamanho: '~200.000 pessoas',
    interesses: 'Franquia, negócio próprio, trabalhar em casa, venda online, loja virtual',
    campanhas: 'C4 Franquias',
  },
  {
    nome: '🏷️ Marca Própria / Private Label',
    descricao: 'Homens e mulheres 25-50 | Lojistas',
    tamanho: '~80.000 pessoas',
    interesses: 'Marca própria, private label, lojista, boutique, atacado de calçados',
    campanhas: '—',
  },
  {
    nome: '🔄 Remarketing 30 dias',
    descricao: 'Quem interagiu com CJ Rasteirinhas nos últimos 30 dias',
    tamanho: 'Varia',
    interesses: 'Visitantes do site + seguidores Instagram + engajamento nos posts',
    campanhas: 'Remarketing',
  },
];

// Copies padrão CJ Rasteirinhas
const COPIES_PADRAO = [
  {
    campanha: 'Atacado',
    titulo: 'Direto da fábrica pra você revender',
    texto: 'Rasteirinhas de R$25 a R$49,90 — mínimo 5 pares\nSortido à sua escolha | Parcele em 12x | Entrega Brasil',
    cta: 'Quero comprar no atacado',
  },
  {
    campanha: 'C4 Franquias',
    titulo: 'Seu site de moda pronto hoje',
    texto: 'Com a C4 você tem site + produtos + suporte.\nSem estoque. Sem complicação.',
    cta: 'Quero ser franqueada',
  },
  {
    campanha: 'Remarketing',
    titulo: 'Ainda pensando? A fábrica tá esperando 👡',
    texto: 'Mais de 500 revendedoras já compram com a CJ.\nRasteirinhas que vendem — a partir de 5 pares.',
    cta: 'Falar com a equipe',
  },
];

function CriativosTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Meus Criativos</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
          + Subir vídeo ou imagem
        </button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
        <strong>Dicas da Judite para CJ Rasteirinhas:</strong>
        <ul className="mt-2 space-y-1 list-disc list-inside">
          <li>Vídeo do produto em uso converte mais que foto estática</li>
          <li>Mostrar o preço visível ("R$25 o par") aumenta cliques</li>
          <li>Stories 9:16 costuma sair mais barato que feed quadrado</li>
          <li>Depoimento de revendedora real gera mais confiança</li>
        </ul>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
        <ImageIcon size={40} className="text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">Nenhum criativo cadastrado ainda</p>
        <p className="text-gray-400 text-xs mt-1">Suba um vídeo ou imagem para que a Judite avalie</p>
      </div>
    </div>
  );
}

function PublicosTab() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Meus Públicos</h2>
        <button className="flex items-center gap-2 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90 transition-opacity">
          + Criar público
        </button>
      </div>

      <div className="space-y-3">
        {PUBLICOS_CJ.map((p) => (
          <div key={p.nome} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="font-semibold text-gray-900">{p.nome}</div>
                <div className="text-sm text-gray-500 mt-0.5">{p.descricao}</div>
                <div className="text-xs text-gray-400 mt-1">Tamanho estimado: {p.tamanho}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  <span className="font-medium">Interesses:</span> {p.interesses}
                </div>
                {p.campanhas !== '—' && (
                  <div className="text-xs text-crm-primary mt-1">Usado em: {p.campanhas}</div>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Editar
              </button>
              <button className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
                Duplicar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TextosTab({ copies }: { copies: Array<{ headline: string; texto_principal: string; cta: string; justificativa?: string; id: string }> }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Textos para Anúncios</h2>
        <a href="/time-ia" className="text-sm text-crm-primary hover:underline">
          Pedir novo ao Cláudio →
        </a>
      </div>

      {/* Copies gerados pelo Cláudio */}
      {copies.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Do Cláudio (aguardando uso)</h3>
          {copies.map((copy) => (
            <div key={copy.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="font-semibold text-gray-900">{copy.headline}</div>
              <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">{copy.texto_principal}</div>
              <div className="text-xs text-gray-400 mt-1">Botão: {copy.cta}</div>
              {copy.justificativa && (
                <div className="mt-2 text-xs text-crm-primary bg-blue-50 rounded-lg px-3 py-2">
                  💡 {copy.justificativa}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => copyText(copy.id, `${copy.headline}\n\n${copy.texto_principal}\n\n${copy.cta}`)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Copy size={12} />
                  {copied === copy.id ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Copies padrão da CJ */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Textos padrão CJ Rasteirinhas</h3>
        {COPIES_PADRAO.map((copy) => (
          <div key={copy.campanha} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                {copy.campanha}
              </span>
            </div>
            <div className="font-semibold text-gray-900">{copy.titulo}</div>
            <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">{copy.texto}</div>
            <div className="text-xs text-gray-400 mt-1">Botão: {copy.cta}</div>
            <button
              onClick={() => copyText(`padrao-${copy.campanha}`, `${copy.titulo}\n\n${copy.texto}\n\n${copy.cta}`)}
              className="flex items-center gap-1.5 text-xs mt-3 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <Copy size={12} />
              {copied === `padrao-${copy.campanha}` ? 'Copiado!' : 'Copiar texto'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Sazonalidade (Pedro) ─────────────────────────────────────────────────── */

function getSazonalidade(): { status: string; recomendacao: string; proximaData: string; dica: string } {
  const mes = new Date().getMonth() + 1; // 1-12
  if (mes >= 10 || mes <= 3) {
    return {
      status: '🔥 ALTA — Temporada de verão para rasteirinhas',
      recomendacao: 'Aumentar verba 20-30% nas campanhas de atacado',
      proximaData: mes >= 11 ? 'Black Friday (novembro) — começar campanha agora' :
                   mes === 12 ? 'Natal (25 dez) — últimas peças do ano' :
                   mes <= 2   ? 'Carnaval (fevereiro) — produto em alta' :
                   'Dia das Mães (maio) — começar em 2 semanas',
      dica: 'Rasteirinhas coloridas e de tiras finas têm alta busca no verão',
    };
  }
  return {
    status: '❄️ BAIXA — Inverno, foco em branding',
    recomendacao: 'Reduzir verba em campanhas de volume, manter remarketing',
    proximaData: mes <= 5 ? 'Dia das Mães (maio) — oportunidade premium' :
                 'Dia dos Pais (agosto) — campanha de marca própria',
    dica: 'Período ideal para captar franqueadas C4 — elas planejam para o verão',
  };
}

/* ─── Página Principal ─────────────────────────────────────────────────────── */

export default function TrafegoPage() {
  const [period, setPeriod] = useState<Period>('7d');
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('campanhas');
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [copies, setCopies] = useState<Array<{ id: string; headline: string; texto_principal: string; cta: string; justificativa?: string }>>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const loadMetrics = useCallback(async (p: Period) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/trafego/metrics?period=${p}`);
      if (!res.ok) throw new Error(`Erro ${res.status}`);
      const json = await res.json() as MetricsData;
      setData(json);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCopies = useCallback(async () => {
    try {
      const res = await fetch('/api/ai-team/copies?status=draft');
      if (!res.ok) return;
      const json = await res.json() as { data: typeof copies };
      setCopies(json.data || []);
    } catch {
      // silencioso
    }
  }, []);

  useEffect(() => {
    loadMetrics(period);
    loadCopies();
  }, [loadMetrics, loadCopies, period]);

  async function handleQueueAction(campaignId: string, action: string) {
    if (action === 'pausar') {
      setActionFeedback('Solicitação de pausa enviada para aprovação — acesse o Time de IAs para confirmar.');
    } else if (action === 'pedir_copy') {
      setActionFeedback('Pedido enviado ao Cláudio — o texto aparecerá na aba "Textos" em breve.');
    }
    setTimeout(() => setActionFeedback(null), 4000);
    setSelectedCampaign(null);
  }

  const sazon = getSazonalidade();
  const allAlerts = (data?.campaigns || []).flatMap((c) =>
    c.alerts.map((a) => ({ ...a, campaign: c }))
  ).sort((a, b) => (a.tipo === 'danger' ? -1 : 1) - (b.tipo === 'danger' ? -1 : 1));

  const periodLabel = { '1d': 'Hoje', '7d': '7 dias', '15d': '15 dias', '30d': '30 dias' }[period];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* ─── Cabeçalho ─────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <BarChart3 size={22} className="text-crm-primary" />
                Tráfego Pago — CJ Rasteirinhas
              </h1>
              {data?.connected && data.accountName && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Conta vinculada: <span className="font-medium text-gray-700">{data.accountName}</span>
                </p>
              )}
              {data?.lastAnalysis && (
                <div className="flex gap-4 mt-1 text-xs text-gray-400">
                  <span>👨 José analisou: {formatDateTime(data.lastAnalysis)}</span>
                  <span>🧠 Cláudio sugeriu: {formatDateTime(data.lastAnalysis)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
                {(['1d', '7d', '15d', '30d'] as Period[]).map((p) => (
                  <PeriodBtn
                    key={p}
                    label={{ '1d': 'Hoje', '7d': '7 dias', '15d': '15 dias', '30d': '30 dias' }[p]}
                    active={period === p}
                    onClick={() => setPeriod(p)}
                  />
                ))}
              </div>
              <button
                onClick={() => loadMetrics(period)}
                disabled={loading}
                className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
                title="Atualizar"
              >
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>
        </div>

        {/* ─── Feedback de ação ────────────────────────────────────────────── */}
        {actionFeedback && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-800 flex items-center gap-2">
            <CheckCircle size={16} />
            {actionFeedback}
          </div>
        )}

        {/* ─── Meta não conectado ──────────────────────────────────────────── */}
        {!loading && data && !data.connected && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-amber-900">Conta Meta não conectada</div>
                <div className="text-sm text-amber-700 mt-0.5">
                  {data.error || 'Configure a conta do Meta para ver suas campanhas'}
                </div>
              </div>
            </div>
            <a
              href="/time-ia"
              className="px-4 py-2 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors whitespace-nowrap"
            >
              Conectar agora →
            </a>
          </div>
        )}

        {/* ─── Loading ─────────────────────────────────────────────────────── */}
        {loading && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 animate-pulse">
                <div className="h-4 w-12 bg-gray-200 rounded mb-4" />
                <div className="h-8 w-20 bg-gray-200 rounded mb-2" />
                <div className="h-3 w-16 bg-gray-100 rounded" />
              </div>
            ))}
          </div>
        )}

        {/* ─── Cards de métricas ───────────────────────────────────────────── */}
        {!loading && data?.connected && data.summary && (() => {
          const s = data.summary;
          const roasBadge = s.totalRoas >= 3 ? { label: `${s.totalRoas.toFixed(1)}x Excelente`, color: 'green' as const } :
                            s.totalRoas >= 1.5 ? { label: `${s.totalRoas.toFixed(1)}x Atenção`, color: 'yellow' as const } :
                            s.totalRoas > 0 ? { label: `${s.totalRoas.toFixed(1)}x Prejuízo`, color: 'red' as const } :
                            { label: 'Sem retorno', color: 'gray' as const };
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <MetricCard
                icon={<span className="text-xl">💰</span>}
                label={`Gastei (${periodLabel})`}
                value={brl(s.totalSpend)}
              />
              <MetricCard
                icon={<span className="text-xl">💵</span>}
                label="Retorno gerado"
                value={brl(s.totalRevenue)}
                badge={roasBadge.label}
                badgeColor={roasBadge.color}
              />
              <MetricCard
                icon={<span className="text-xl">👆</span>}
                label="Cliques"
                value={n0(s.totalClicks)}
                sub={s.totalCpc > 0 ? `${brl2(s.totalCpc)}/clique` : undefined}
              />
              <MetricCard
                icon={<span className="text-xl">👥</span>}
                label="Leads"
                value={n0(s.totalLeads)}
                sub={s.totalCpl > 0 ? `${brl2(s.totalCpl)}/lead` : undefined}
                badge={s.totalLeads > 0 ? (s.totalCpl <= 20 ? 'Bom' : s.totalCpl <= 30 ? 'Atenção' : 'Caro') : undefined}
                badgeColor={s.totalLeads > 0 ? (s.totalCpl <= 20 ? 'green' : s.totalCpl <= 30 ? 'yellow' : 'red') : 'gray'}
              />
            </div>
          );
        })()}

        {/* ─── Alertas inteligentes ────────────────────────────────────────── */}
        {!loading && allAlerts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4">
              <AlertTriangle size={18} className="text-amber-500" />
              <h2 className="font-bold text-gray-900">
                José identificou {allAlerts.length} situaç{allAlerts.length === 1 ? 'ão' : 'ões'} para atenção:
              </h2>
            </div>
            <div className="space-y-3">
              {allAlerts.slice(0, 5).map((alert, i) => (
                <div
                  key={i}
                  className={cn(
                    'rounded-xl p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3',
                    alert.tipo === 'danger' ? 'bg-red-50' : 'bg-amber-50'
                  )}
                >
                  <div>
                    <div className={cn('font-semibold text-sm', alert.tipo === 'danger' ? 'text-red-900' : 'text-amber-900')}>
                      {alert.tipo === 'danger' ? '🔴' : '🟡'} {alert.campaign.nome}
                    </div>
                    <div className={cn('text-sm mt-0.5', alert.tipo === 'danger' ? 'text-red-700' : 'text-amber-700')}>
                      {alert.mensagem}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() => { setSelectedCampaign(alert.campaign); setTab('campanhas'); }}
                      className="text-xs px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                    >
                      Ver campanha
                    </button>
                    {(alert.acao === 'pausar' || alert.tipo === 'danger') && (
                      <button
                        onClick={() => handleQueueAction(alert.campaign.id, 'pausar')}
                        className="text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
                      >
                        Pausar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Abas ────────────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* Tab headers */}
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {(
              [
                { key: 'campanhas', label: '📊 Campanhas' },
                { key: 'criativos', label: '🎬 Criativos' },
                { key: 'publicos',  label: '👥 Públicos' },
                { key: 'textos',    label: '✍️ Textos' },
              ] as { key: Tab; label: string }[]
            ).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors',
                  tab === key
                    ? 'border-crm-primary text-crm-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {/* ── CAMPANHAS ── */}
            {tab === 'campanhas' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Suas Campanhas</h2>
                  <button className="text-sm px-4 py-2 bg-crm-primary text-white rounded-xl font-medium hover:opacity-90">
                    + Nova Campanha
                  </button>
                </div>

                {loading && (
                  <div className="text-center py-12 text-gray-400 text-sm">Carregando campanhas...</div>
                )}

                {!loading && (!data?.campaigns || data.campaigns.length === 0) && (
                  <div className="text-center py-12">
                    <Target size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">Nenhuma campanha encontrada no período</p>
                    <p className="text-gray-400 text-xs mt-1">
                      {data?.connected ? 'Sem campanhas ativas ou pausadas' : 'Conecte o Meta Ads para ver campanhas'}
                    </p>
                  </div>
                )}

                {!loading && (data?.campaigns || []).length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-gray-100">
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Campanha</th>
                          <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Situação</th>
                          <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Gastei</th>
                          <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Retorno</th>
                          <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wide pb-3">Leads</th>
                          <th className="text-right pb-3" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {(data?.campaigns || []).map((c) => (
                          <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                            <td className="py-3 pr-4">
                              <div className="font-medium text-gray-900 text-sm">{c.nome}</div>
                              {c.alerts.length > 0 && (
                                <div className="text-xs text-red-600 mt-0.5">
                                  {c.alerts[0].mensagem.substring(0, 50)}…
                                </div>
                              )}
                            </td>
                            <td className="py-3 pr-4">
                              <HealthBadge health={c.health} />
                            </td>
                            <td className="py-3 pr-4 text-right text-sm font-medium text-gray-900">
                              {brl(c.spend)}
                            </td>
                            <td className="py-3 pr-4 text-right">
                              <div className="text-sm font-medium text-gray-900">
                                {c.roas > 0 ? `${c.roas.toFixed(1)}x` : '—'}
                              </div>
                            </td>
                            <td className="py-3 pr-4 text-right text-sm text-gray-600">
                              {c.leads > 0 ? c.leads : '—'}
                            </td>
                            <td className="py-3">
                              <button
                                onClick={() => setSelectedCampaign(c)}
                                className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1 whitespace-nowrap"
                              >
                                Gerir <ChevronRight size={12} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* ── CRIATIVOS ── */}
            {tab === 'criativos' && <CriativosTab />}

            {/* ── PÚBLICOS ── */}
            {tab === 'publicos' && <PublicosTab />}

            {/* ── TEXTOS ── */}
            {tab === 'textos' && <TextosTab copies={copies} />}
          </div>
        </div>

        {/* ─── Pedro — Sazonalidade ────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">📅</span>
            <h2 className="font-bold text-gray-900">Pedro monitorando oportunidades</h2>
          </div>
          <div className="space-y-3">
            <div className="bg-orange-50 rounded-xl px-4 py-3 text-sm text-orange-900">
              <strong>{sazon.status}</strong>
              <div className="mt-1 text-orange-700">Recomendação: {sazon.recomendacao}</div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 bg-blue-50 rounded-xl px-4 py-3 text-sm text-blue-900">
                <strong>📌 {sazon.proximaData}</strong>
              </div>
              <div className="flex-1 bg-purple-50 rounded-xl px-4 py-3 text-sm text-purple-900">
                <strong>💡 Pedro encontrou:</strong> {sazon.dica}
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* ─── Painel lateral de campanha ──────────────────────────────────── */}
      {selectedCampaign && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setSelectedCampaign(null)}
          />
          <CampaignDetailPanel
            campaign={selectedCampaign}
            onClose={() => setSelectedCampaign(null)}
            onQueueAction={handleQueueAction}
          />
        </>
      )}
    </div>
  );
}
