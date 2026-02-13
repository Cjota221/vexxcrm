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
}

export interface TenantConfigEvolution {
  url: string;
  api_key: string;
  instance_name: string;
  status?: 'open' | 'close' | 'connecting';
}

export interface TenantConfigOpenAI {
  api_key?: string;
  model?: string;
  enabled: boolean;
  system_prompt?: string;
  provider?: string;  // openai, anthropic, google, groq, deepseek, custom
  base_url?: string;  // URL base customizada para provedores alternativos
}

export interface TenantPreferences {
  theme: 'light' | 'dark';
  language: string;
  notifications_enabled: boolean;
}

export interface TenantConfig {
  facilzap?: TenantConfigFacilzap;
  evolution?: TenantConfigEvolution;
  openai?: TenantConfigOpenAI;
  preferences?: TenantPreferences;
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
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CHAT (Conversa)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface Chat {
  id: string;
  client: Client;
  last_message?: Message;
  unread_count: number;
  is_pinned: boolean;
  is_archived: boolean;
  is_muted: boolean;
  assigned_to?: string;
  updated_at: string;
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
  sku?: string;
  category?: string;
  image_url?: string;
  stock: number;
  is_active: boolean;
  source: 'facilzap' | 'manual';
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
      imageMessage?: { url?: string; caption?: string; mimetype?: string };
      videoMessage?: { url?: string; caption?: string; mimetype?: string };
      audioMessage?: { url?: string; mimetype?: string; ptt?: boolean };
      documentMessage?: { url?: string; fileName?: string; mimetype?: string };
      stickerMessage?: { url?: string };
    };
    messageTimestamp?: number;
    status?: string;
  };
}
