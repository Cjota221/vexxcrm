export interface CampaignAlert {
  tipo: 'danger' | 'warning';
  mensagem: string;
  acao?: string;
}

export interface VideoMetrics {
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  p100: number;
  thruplay: number;
  avg_watch: number;
  cost_per_thruplay: number;
}

export interface DailyMetric {
  date: string;
  spend: number;
  revenue: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  frequency: number;
  roas: number;
  cpl: number;
}

export interface BreakdownRow {
  segment: string;
  spend: number;
  revenue: number;
  leads: number;
  clicks: number;
  impressions: number;
  reach: number;
  cpc: number;
  cpm: number;
  ctr: number;
  frequency: number;
  roas: number;
  cpl: number;
}

export interface Campaign {
  id: string;
  nome: string;
  status: string;
  effective_status?: string;
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
  landing_page_views?: number;
  video?: VideoMetrics;
  orcamento_diario: number | null;
  date_start?: string;
  date_stop?: string;
  alerts: CampaignAlert[];
  health: 'great' | 'ok' | 'bad' | 'paused';
}

export interface Summary {
  totalSpend: number;
  totalRevenue: number;
  totalLeads: number;
  totalClicks: number;
  totalRoas: number;
  totalCpl: number;
  totalCpc: number;
}

export interface MetaAdset {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  daily_budget?: string;
  optimization_goal?: string;
}

export interface MetaAd {
  id: string;
  name: string;
  status: string;
  effective_status?: string;
  adset_id?: string;
  creative?: {
    id: string;
    thumbnail_url?: string;
    title?: string;
    body?: string;
  };
}

export interface MetricsData {
  connected: boolean;
  accountName?: string;
  period?: string;
  lastAnalysis?: string | null;
  summary?: Summary;
  campaigns?: Campaign[];
  error?: string;
  fromCache?: boolean;
  cacheWarning?: string;
  lastSync?: string;
}

export type Period = '1d' | '7d' | '15d' | '30d';
export type Tab = 'campanhas' | 'criativos' | 'publicos' | 'textos' | 'analise' | 'relatorio' | 'config' | 'agente' | 'aprovacoes' | 'leads' | 'regras' | 'consolidado' | 'abtest' | 'catalogo' | 'biblioteca';
