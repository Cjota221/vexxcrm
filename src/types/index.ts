/**
 * Tipos centrais do VEXX CRM 2.0
 *
 * Todas as interfaces e tipos compartilhados pelo sistema.
 * Mantém correspondência direta com o schema do Supabase.
 */

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TENANT (Multi-Tenant)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type TenantPlan = 'free' | 'pro' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'trial';

export interface TenantConfigFacilzap {
  token: string;
  site_url?: string;
  enabled: boolean;
  has_token?: boolean; // Indica se token existe (key mascarada no GET)
}

export interface TenantConfigEvolution {
  url: string;
  api_key: string;
  instance_name: string;
  status?: 'open' | 'close' | 'connecting';
  has_key?: boolean; // Indica se API key existe (key mascarada no GET)
}

export interface TenantConfigOpenAI {
  api_key?: string;
  model?: string;
  enabled: boolean;
  system_prompt?: string;
  provider?: string;  // openai, anthropic, google, groq, deepseek, custom
  base_url?: string;  // URL base customizada para provedores alternativos
  has_key?: boolean; // Indica se API key existe (key mascarada no GET)
}

export interface TenantPreferences {
  theme: 'light' | 'dark';
  language: string;
  notifications_enabled: boolean;
}

export interface TenantConfigPix {
  key: string;                                                       // Chave Pix da loja
  keyType: 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';   // Tipo da chave
  holderName: string;                                                // Nome do titular / loja
}

export interface TenantConfig {
  facilzap?: TenantConfigFacilzap;
  evolution?: TenantConfigEvolution;
  openai?: TenantConfigOpenAI;
  preferences?: TenantPreferences;
  pix?: TenantConfigPix;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  owner_email: string;
  plan: TenantPlan;
  status: TenantStatus;
  config: TenantConfig;
  evolution_instance_name?: string;
  created_at: string;
  updated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   USER (Autenticação)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type UserRole = 'owner' | 'admin' | 'agent';

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  avatar_url?: string;
  role: UserRole;
  is_active: boolean;
  last_login?: string;
  created_at: string;
}

export interface AuthSession {
  user: User;
  tenant: Tenant;
  access_token: string;
  refresh_token: string;
  expires_at: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CLIENT (CRM)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type ClientStatus = 'novo' | 'ativo' | 'active' | 'risco' | 'inativo' | 'inactive' | 'blocked' | 'vip';

export interface Client {
  id: string;
  tenant_id: string;
  name: string;
  email?: string;
  phone: string;
  phone_normalized: string;
  birthday?: string;
  cpf?: string;
  ltv: number;
  ticket_medio: number;
  total_pedidos: number;
  ultima_compra?: string;
  status: ClientStatus;
  tags: string[];
  notas?: string;
  origem?: string;
  avatar_url?: string;
  created_at: string;
  updated_at: string;
}

export interface ClientFilters {
  search?: string;
  status?: ClientStatus | ClientStatus[];
  has_orders?: boolean;
  source?: 'whatsapp' | 'import' | 'manual' | 'campaign' | 'facilzap';
  has_name?: boolean; // true = com nome, false = sem nome, undefined = todos
  tags?: string[];
  ltv_min?: number;
  ltv_max?: number;
  last_purchase_days?: number;
  page?: number;
  per_page?: number;
  sort_by?: keyof Client;
  sort_order?: 'asc' | 'desc';
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MESSAGE (Chat)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'sticker' | 'location' | 'contact';
export type MessageStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Message {
  id: string;
  tenant_id: string;
  client_id: string;
  remote_jid: string;
  message_id: string;
  from_me: boolean;
  content: string;
  type: MessageType;
  media_url?: string;
  media_type?: string;
  media_size?: number;
  timestamp: string;
  status: MessageStatus;
  metadata?: Record<string, unknown>;
  created_at: string;
  deleted?: boolean;
  deleted_at?: string | null;
  edited?: boolean;
  edited_at?: string | null;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CHAT (Conversa)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface ChatLabel {
  id: string;
  name: string;
  cor_hex?: string;
}

export interface Chat {
  id: string;
  client: Client;
  last_message?: Message;
  unread_count: number;
  is_pinned: boolean;
  is_archived: boolean;
  is_muted: boolean;
  is_group?: boolean;
  assigned_to?: string;
  updated_at: string;
  labels?: ChatLabel[];
  /** Campo interno para paginação cursor-based (não exibido na UI) */
  _cursor?: string;
}

export type ChatFilter = 'all' | 'unread' | 'waiting' | 'mine' | 'archived';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CAMPAIGN
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type CampaignType = 'broadcast' | 'sequence' | 'drip';
export type CampaignStatus = 'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'failed';

export interface CampaignBlock {
  id: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'delay' | 'condition';
  content?: string;
  media_url?: string;
  delay_seconds?: number;
  condition?: Record<string, unknown>;
  order: number;
}

export interface Campaign {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  type: CampaignType;
  status: CampaignStatus;
  blocks: CampaignBlock[];
  filters?: ClientFilters;
  total_destinatarios: number;
  enviadas: number;
  entregues: number;
  lidas: number;
  falhas: number;
  scheduled_at?: string;
  started_at?: string;
  completed_at?: string;
  created_at: string;
  updated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PRODUCT
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface Product {
  id: string;
  tenant_id: string;
  external_id?: string;
  name: string;
  description?: string;
  price: number;
  price_promotional?: number;
  compare_at_price?: number;
  sku?: string;
  category?: string;
  image_url?: string;
  stock: number;
  is_active: boolean;
  source: 'facilzap' | 'manual';
  checkout_url?: string;
  chat_template?: string;
  chat_send_count?: number;
  created_at: string;
  updated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ORDER (Pedido)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded' | 'paid';

export interface OrderItem {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Order {
  id: string;
  tenant_id: string;
  client_id: string;
  external_id?: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  status: OrderStatus;
  payment_method?: string;
  tracking_code?: string;
  notes?: string;
  source: 'facilzap' | 'manual';
  created_at: string;
  updated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COUPON
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type CouponType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  tenant_id: string;
  code: string;
  type: CouponType;
  value: number;
  min_order_value?: number;
  max_uses?: number;
  used_count: number;
  is_active: boolean;
  expires_at?: string;
  created_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   REAL-TIME EVENTS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type SSEEventType =
  | 'new_message'
  | 'message_status'
  | 'typing_indicator'
  | 'connection_update'
  | 'client_updated';

export interface SSEEvent<T = unknown> {
  type: SSEEventType;
  data: T;
  timestamp: string;
}

export interface NewMessageEvent {
  client_id: string;
  message: Message;
}

export interface MessageStatusEvent {
  message_id: string;
  client_id: string;
  status: MessageStatus;
}

export interface TypingIndicatorEvent {
  client_id: string;
  is_typing: boolean;
}

export interface ConnectionUpdateEvent {
  status: 'open' | 'close' | 'connecting';
  instance_name: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   DASHBOARD
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface DashboardKPIs {
  total_clients: number;
  active_chats: number;
  running_campaigns: number;
  messages_today: number;
  total_revenue: number;
  avg_ticket: number;
  new_clients_month: number;
  response_time_avg: number; // em minutos
  total_orders?: number;
  total_paid?: number;
  total_delivered?: number;
  total_products?: number;
  total_pieces_sold?: number;
  paid_revenue?: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   API RESPONSES
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface ApiResponse<T = unknown> {
  data: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T = unknown> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  total_pages: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   WEBHOOK (Evolution API)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface EvolutionWebhookPayload {
  event: string;
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string };
      imageMessage?: { url?: string; directPath?: string; caption?: string; mimetype?: string; base64?: string };
      videoMessage?: { url?: string; directPath?: string; caption?: string; mimetype?: string };
      audioMessage?: { url?: string; directPath?: string; mimetype?: string; ptt?: boolean };
      documentMessage?: { url?: string; directPath?: string; fileName?: string; mimetype?: string };
      stickerMessage?: { url?: string; directPath?: string };
    };
    messageTimestamp?: number;
    status?: string;
  };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CUSTOMER HEALTH (Sentinela)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type HealthClassification = 'VIP' | 'Ativo' | 'Oportunidade' | 'Risco' | 'Perdido';
export type TendenciaType = 'aumentando' | 'estavel' | 'diminuindo';

export interface ProdutoPreferido {
  nome: string;
  quantidade: number;
  percentualCompras: number;
}

export interface CustomerHealth {
  clienteId: string;
  metricas: {
    diasInatividade: number;
    ultimaCompra: string | null;
    frequenciaCompra: {
      mediaComprasMes: number;
      totalPedidos: number;
      primeiraCompra: string | null;
      mesesComoCliente: number;
    };
    comportamentoCompra: {
      ticketMedio: number;
      valorTotalGasto: number; // LTV — soma de pedidos PAGOS
      produtosPreferidos: ProdutoPreferido[];
      categoriasPreferidas: string[];
    };
    tendencias: {
      crescimentoFrequencia: TendenciaType;
      crescimentoTicket: TendenciaType;
      ultimosTresMeses: {
        pedidos: number;
        valorTotal: number;
      };
    };
  };
  classificacao: {
    nivel: HealthClassification;
    score: number;
    razao: string;
    recomendacoes: string[];
    /** Frase humanizada resumindo o cliente para exibir na UI */
    logInteligencia: string;
  };
  calculadoEm: string;
}

export interface SentinelaResult {
  totalProcessados: number;
  distribuicao: {
    VIP: number;
    Ativo: number;
    Oportunidade: number;
    Risco: number;
    Perdido: number;
  };
  mudancasStatus: Array<{
    clienteId: string;
    clienteNome: string;
    statusAnterior: string;
    statusNovo: string;
    razao: string;
    logInteligencia: string;
  }>;
  /** Clientes VIP com LTV acima da média que não compram há 15+ dias */
  vipsEmRisco: Array<{
    clienteId: string;
    clienteNome: string;
    ltv: number;
    ticketMedio: number;
    diasInatividade: number;
    logInteligencia: string;
  }>;
  ltvMedioBase: number;
  tempoExecucao: string;
  erros: string[];
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   INTELIGÊNCIA AI — RFM, Behavioral Events, Predictions
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type RFMSegmentName =
  | 'Champions'
  | 'Loyal Customers'
  | 'Potential Loyalist'
  | 'New Customers'
  | 'Promising'
  | 'Need Attention'
  | 'About to Sleep'
  | 'At Risk'
  | 'Cant Lose Them'
  | 'Hibernating'
  | 'Lost';

export interface ClientRFMData {
  rfm_recency: number;
  rfm_frequency: number;
  rfm_monetary: number;
  rfm_score: string;
  rfm_segment: RFMSegmentName;
  rfm_calculated_at: string | null;
  churn_probability: number;
  purchase_prob_30d: number;
  expected_frequency: number;
  expected_next_ticket: number;
  next_purchase_at: string | null;
  ltv_projected_12m: number;
  ltv_projected_life: number;
  flag_auto_vip: boolean;
  flag_churn_risk: boolean;
  flag_needs_attention: boolean;
  flag_upsell_ready: boolean;
  sentiment_score: number | null;
  sentiment_label: string | null;
}

export type EventCategory =
  | 'purchase'
  | 'communication'
  | 'engagement'
  | 'support'
  | 'lifecycle'
  | 'campaign'
  | 'product'
  | 'churn_signal';

export type EventType =
  | 'order_placed'
  | 'order_completed'
  | 'order_cancelled'
  | 'message_sent'
  | 'message_received'
  | 'message_read'
  | 'cart_created'
  | 'cart_abandoned'
  | 'cart_recovered'
  | 'campaign_sent'
  | 'campaign_opened'
  | 'campaign_clicked'
  | 'campaign_converted'
  | 'support_requested'
  | 'complaint_made'
  | 'product_viewed'
  | 'product_wishlisted'
  | 'coupon_used'
  | 'coupon_expired'
  | 'review_submitted'
  | 'client_created'
  | 'client_returned'
  | 'inactivity_30d'
  | 'inactivity_60d'
  | 'inactivity_90d'
  | 'churn_detected'
  | 'win_back'
  | 'upgrade_segment'
  | 'downgrade_segment';

export interface BehavioralEvent {
  id: string;
  tenant_id: string;
  client_id: string;
  event_type: EventType;
  event_category: EventCategory;
  event_data?: Record<string, unknown>;
  channel?: string;
  sentiment_score?: number;
  sentiment_label?: string;
  session_id?: string;
  source?: string;
  created_at: string;
}

export interface RFMReport {
  execution: {
    started_at: string;
    finished_at: string;
    duration_secs: number;
    algorithm_version: string;
  };
  stats: {
    total_processed: number;
    total_updated: number;
    total_errors: number;
    segment_changes: number;
    upgrades: number;
    downgrades: number;
  };
  distribution: Record<string, number>;
  alerts: Array<{
    type: 'critical' | 'warning' | 'info';
    message: string;
    action: string;
  }>;
}

export interface PredictionLog {
  id: string;
  tenant_id: string;
  client_id?: string;
  prediction_type: string;
  model_version: string;
  input_features: Record<string, unknown>;
  predicted_value: number;
  predicted_label?: string;
  confidence: number;
  actual_value?: number;
  was_correct?: boolean;
  validated_at?: string;
  created_at: string;
}

export interface SyncAuditLog {
  id: string;
  tenant_id: string;
  sync_type: string;
  source: string;
  records_fetched: number;
  records_created: number;
  records_updated: number;
  records_failed: number;
  errors?: unknown[];
  metadata?: Record<string, unknown>;
  duration_ms: number;
  status: 'success' | 'partial' | 'error';
  created_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CONTACT CENTER
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface Department {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  color: string;
  is_active: boolean;
}

export interface Queue {
  id: string;
  tenant_id: string;
  department_id: string | null;
  name: string;
  slug: string;
  type: string;
  priority_level: number;
  distribution_mode: string;
  auto_assign: boolean;
  is_active: boolean;
  accepting_new: boolean;
  total_waiting?: number;
}

export interface QuickAction {
  id: string;
  tenant_id: string;
  name: string;
  slug: string;
  icon: string;
  type: string;
  config: Record<string, unknown>;
  is_active: boolean;
  sort_order: number;
}

export interface AgentStatus {
  is_online: boolean;
  accepting_chats: boolean;
  active_chats: number;
  max_chats: number;
  closed_today: number;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SENTINELA ANNE v3
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type SentinelaAnalysisType =
  | 'churn_risk'
  | 'upsell_opportunity'
  | 'reactivation'
  | 'vip_care'
  | 'seasonal_opportunity'
  | 'cross_sell'
  | 'win_back'
  | 'new_customer_nurture';

export type SentinelaAnalysisStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'expired';
export type SentinelaUrgency = 'low' | 'medium' | 'high' | 'critical';

export interface SentinelaAnalysisItem {
  id: string;
  tenant_id: string;
  client_id: string;
  client_name: string;
  type: SentinelaAnalysisType;
  urgency: SentinelaUrgency;
  title: string;
  description: string;
  recommended_action: string;
  action_payload: Record<string, unknown>;
  confidence: number;
  status: SentinelaAnalysisStatus;
  approved_by: string | null;
  approved_at: string | null;
  executed_at: string | null;
  feedback_score: number | null;
  feedback_notes: string | null;
  created_at: string;
}

export interface SentinelaStats {
  total_analyses: number;
  pending: number;
  approved: number;
  executed: number;
  coupons_generated: number;
  coupons_used: number;
  conversion_rate: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   KANBAN (Central de Atendimento v3)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type KanbanColumn =
  | 'PRIMEIRO_CONTATO'
  | 'EM_NEGOCIACAO'
  | 'AGUARDANDO_PAGAMENTO'
  | 'PAGO'
  | 'DESPACHADO'
  | 'REATIVAR'
  | 'CANCELADO'
  | 'CONCLUIDO';

export interface KanbanTransition {
  id: string;
  tenant_id: string;
  chat_id: string;
  client_id: string;
  de_coluna: KanbanColumn | null;
  para_coluna: KanbanColumn;
  autor: 'anne' | 'human';
  autor_id?: string;
  motivo?: string;
  created_at: string;
}

export interface KanbanCard {
  id: string;
  tenant_id: string;
  chat_id: string;
  client_id: string;
  client_name: string;
  client_phone: string;
  coluna: KanbanColumn;
  tags: string[];
  score_anne?: number;
  tentativas_reativacao: number;
  ultimo_contato: string;
  transitions: KanbanTransition[];
  created_at: string;
  updated_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ANNE TRIGGERS (Motor de Gatilhos)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type AnneTriggerType =
  | 'primeiro_contato'
  | 'pedido_recebido'
  | 'pagamento_aprovado'
  | 'sinal_rejeicao'
  | 'engajamento_alto'
  | 'ghosting';

export type AnneActionType =
  | 'atualiza_tag'
  | 'move_kanban'
  | 'dispara_template'
  | 'notifica_atendente';

export interface AnneTriggerResult {
  trigger: AnneTriggerType;
  score: number;
  matched: boolean;
  acoes_executadas: AnneActionType[];
  escalona_para_humano: boolean;
  motivo_escalona?: string;
  nova_coluna?: KanbanColumn;
  nova_tag?: string;
}

export interface AnneTriggerLogEntry {
  id: string;
  tenant_id: string;
  chat_id: string;
  client_id: string;
  trigger: AnneTriggerType;
  score: number;
  acao: AnneActionType | null;
  resultado: 'executado' | 'sugerido' | 'ignorado' | 'escalado';
  escalona_para_humano: boolean;
  created_at: string;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TEMPLATE COMPOSTO (Mensagens Rápidas v2)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export type TemplateBlockType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'link' | 'link_banner' | 'cta' | 'copy_code';

export interface TemplateBlock {
  id: string;
  type: TemplateBlockType;
  order: number;
  /** Atraso em ms antes de enviar este bloco (padrão: 1000 = 1s para simular digitação humana) */
  delay_ms?: number;
  // text
  content?: string;
  // image / video / audio / document
  media_url?: string;
  media_caption?: string;
  /** @deprecated use media_url */
  image_url?: string;
  /** @deprecated use media_caption */
  image_caption?: string;
  // link simples
  link_title?: string;
  link_url?: string;
  // link_banner: link com título, descrição e imagem opcional (preview WhatsApp-style)
  link_banner_title?: string;
  link_banner_description?: string;
  link_banner_image?: string;
  // cta
  cta_label?: string;
  cta_url?: string;
  cta_utm?: string;
}

export interface CompositeTemplate {
  id: string;
  tenant_id: string;
  name: string;
  description?: string;
  blocks: TemplateBlock[];
  variables: string[]; // lista de {{variavel}} usadas nos blocos
  created_by: string;
  created_at: string;
  updated_at: string;
}
