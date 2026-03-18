/**
 * FacilZap Mapper — Mapeamento e normalização rigorosa de dados.
 *
 * REGRAS CRÍTICAS:
 * - NUNCA duplicar cliente: upsert por phone_normalized (canonical) + CPF
 * - SEMPRE usar PhoneNormalizer.canonical() antes de gravar
 * - Validar TODOS os campos antes de gravar
 * - Rejeitar dados inválidos com log detalhado
 *
 * @module facilzap/mapper
 */

import { PhoneNormalizer } from '@/lib/phone-normalizer';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   HELPERS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/** Parse numérico seguro: aceita string BR ("1.234,56") ou EN ("1234.56") */
export function parseNum(v: unknown): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  if (!v) return 0;
  const s = String(v).trim();
  // Detectar formato BR: "1.234,56" → trocar vírgula por ponto
  const n = parseFloat(s.replace(/[^\d.,-]/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

/** Verifica se o valor é "truthy" no padrão da FacilZap */
export function isTruthy(v: unknown): boolean {
  return v === '1' || v === 1 || v === true || v === 'true' || v === 'sim';
}

/** Limpa e normaliza CPF/CNPJ (apenas dígitos) */
export function cleanCpfCnpj(raw: unknown): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  // CPF: 11 dígitos, CNPJ: 14 dígitos
  if (digits.length === 11 || digits.length === 14) return digits;
  // Se veio algo estranho mas tem ao menos 11 dígitos, pegar os primeiros 14
  if (digits.length > 14) return digits.slice(0, 14);
  return digits.length >= 11 ? digits : null;
}

/** Normaliza email: lowercase, trim, validação básica */
export function cleanEmail(raw: unknown): string | null {
  if (!raw) return null;
  const email = String(raw).toLowerCase().trim();
  if (!email.includes('@') || !email.includes('.')) return null;
  return email;
}

/** Garante que stock é inteiro válido para PostgreSQL INTEGER */
export function safeStock(raw: unknown): number {
  let stock = parseInt(String(raw ?? 0), 10);
  if (isNaN(stock) || stock < -1 || stock > 2147483647) stock = 0;
  return stock;
}

/** Extrai data segura (retorna ISO string ou null) */
export function safeDate(raw: unknown): string | null {
  if (!raw) return null;
  try {
    const d = new Date(String(raw));
    return !isNaN(d.getTime()) ? d.toISOString() : null;
  } catch {
    return null;
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAPPER: CLIENTE → clients table
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface MappedClient {
  tenant_id: string;
  phone: string;
  phone_normalized: string;
  name: string;
  email: string | null;
  cpf: string | null;
  source: string;
  status: string;
  address_city: string | null;
  address_state: string | null;
  address_zip: string | null;
  address_neighborhood: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  notes: string | null;
  custom_fields: Record<string, unknown>;
}

export interface MapperResult<T> {
  valid: T[];
  rejected: Array<{ raw: unknown; reason: string }>;
}

/**
 * Mapeia clientes brutos da FacilZap para o schema do VEXX CRM.
 *
 * REGRAS:
 * - Obrigatório: telefone válido (whatsapp/telefone/celular)
 * - phone_normalized = PhoneNormalizer.canonical() → chave de dedup
 * - CPF limpo (apenas dígitos, 11 ou 14 chars)
 * - Dedup interno: se dois clientes no lote têm mesmo phone_normalized, mantém o primeiro
 *
 * @param rawClients - Array de clientes brutos da API FacilZap
 * @param tenantId - ID do tenant
 * @param source - Origem do dado ('facilzap', 'webhook', 'cron')
 */
export function mapClients(
  rawClients: unknown[],
  tenantId: string,
  source: string = 'facilzap'
): MapperResult<MappedClient> {
  const valid: MappedClient[] = [];
  const rejected: Array<{ raw: unknown; reason: string }> = [];
  const seen = new Set<string>();

  for (const raw of rawClients) {
    try {
      const c = raw as Record<string, unknown>;

      // ─── Parsear demais_dados (FacilZap armazena telefone/endereço como JSON string)
      let dd: Record<string, unknown> = {};
      if (c.demais_dados) {
        try {
          dd = typeof c.demais_dados === 'string'
            ? JSON.parse(c.demais_dados)
            : (c.demais_dados as Record<string, unknown>);
        } catch { /* ignore parse error */ }
      }

      // ─── Extrair telefone (top-level tem prioridade; fallback: demais_dados)
      const rawPhone = String(
        c.whatsapp_e164 || c.whatsapp || c.telefone || c.celular || c.phone ||
        dd.whatsapp_e164 || dd.whatsapp || dd.telefone || dd.celular || ''
      ).replace(/\D/g, '');

      if (!rawPhone || rawPhone.length < 8) {
        rejected.push({ raw, reason: 'Telefone ausente ou inválido' });
        continue;
      }

      const phoneCanonical = PhoneNormalizer.canonical(rawPhone);
      const phoneDisplay = PhoneNormalizer.normalize(rawPhone);

      if (!phoneCanonical) {
        rejected.push({ raw, reason: `Falha ao normalizar telefone: ${rawPhone}` });
        continue;
      }

      // ─── Dedup por phone_normalized no mesmo lote
      if (seen.has(phoneCanonical)) {
        rejected.push({ raw, reason: `Duplicado no lote: ${phoneCanonical}` });
        continue;
      }
      seen.add(phoneCanonical);

      // ─── Status
      let clientStatus = 'active';
      const statusRaw = String(c.status || '').toLowerCase();
      if (statusRaw === 'inativo' || statusRaw === 'inactive') clientStatus = 'inactive';
      else if (statusRaw === 'bloqueado' || statusRaw === 'blocked') clientStatus = 'blocked';
      else if (statusRaw === 'vip') clientStatus = 'vip';

      // ─── CPF/CNPJ (top-level tem prioridade; fallback: demais_dados)
      const cpf = cleanCpfCnpj(c.cpf_cnpj || c.cpf || c.cnpj || dd.cpf_cnpj || dd.cpf);

      valid.push({
        tenant_id: tenantId,
        phone: phoneDisplay,
        phone_normalized: phoneCanonical,
        name: String(c.nome || c.name || dd.nome || 'Sem nome').trim(),
        email: cleanEmail(c.email || dd.email),
        cpf,
        source,
        status: clientStatus,
        address_city: String(c.cidade || c.city || dd.cidade || '').trim() || null,
        address_state: String(c.estado || c.state || c.uf || dd.estado || dd.uf || '').trim() || null,
        address_zip: String(c.cep || c.zip || c.codigo_postal || dd.cep || '').trim() || null,
        address_neighborhood: String(c.bairro || c.neighborhood || dd.bairro || '').trim() || null,
        address_street: String(c.endereco || c.logradouro || c.rua || dd.endereco || dd.logradouro || dd.rua || '').trim() || null,
        address_number: String(c.numero || c.number || dd.numero || '').trim() || null,
        address_complement: String(c.complemento || dd.complemento || '').trim() || null,
        notes: String(c.observacoes || dd.observacoes || '').trim() || null,
        custom_fields: {
          facilzap_id: c.id || null,
          tipo_contato: c.tipo_contato || null,
          cpf_cnpj: c.cpf_cnpj || null,
          data_nascimento: c.data_nascimento || null,
          origem: c.origem || null,
          ultima_compra: c.ultima_compra || null,
          status_facilzap: c.status || null,
          created_at_facilzap: c.created_at || null,
          source,
        },
      });
    } catch (err: unknown) {
      rejected.push({ raw, reason: `Erro inesperado: ${(err as Error).message}` });
    }
  }

  return { valid, rejected };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAPPER: PRODUTO → products table
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface MappedProduct {
  tenant_id: string;
  external_id: string;
  sku: string | null;
  name: string;
  description: string | null;
  price: number;
  compare_at_price: number | null;
  cost: number | null;
  stock: number;
  image_url: string | null;
  images: string[];
  category: string | null;
  is_active: boolean;
  custom_fields: Record<string, unknown>;
  synced_at: string;
}

/**
 * Mapeia produtos brutos da FacilZap para o schema do VEXX CRM.
 *
 * REGRAS:
 * - Obrigatório: ID (external_id)
 * - Price ≥ 0 (não pode ser NaN)
 * - Stock inteiro válido para PostgreSQL
 * - SKU: se objeto, extrair .nome ou .sku
 * - Dedup por external_id no mesmo lote
 */
export function mapProducts(
  rawProducts: unknown[],
  tenantId: string,
  source: string = 'facilzap'
): MapperResult<MappedProduct> {
  const valid: MappedProduct[] = [];
  const rejected: Array<{ raw: unknown; reason: string }> = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  for (const raw of rawProducts) {
    try {
      const p = raw as Record<string, unknown>;
      const externalId = String(p.external_id || p.id || '').trim();

      if (!externalId) {
        rejected.push({ raw, reason: 'Produto sem ID' });
        continue;
      }

      if (seen.has(externalId)) {
        rejected.push({ raw, reason: `Duplicado no lote: ${externalId}` });
        continue;
      }
      seen.add(externalId);

      // SKU pode ser string ou objeto
      let sku: string | null = null;
      if (typeof p.sku === 'object' && p.sku !== null) {
        const skuObj = p.sku as Record<string, unknown>;
        sku = String(skuObj.nome || skuObj.sku || JSON.stringify(p.sku));
      } else {
        sku = p.sku ? String(p.sku) : null;
      }

      // Imagens: filtrar strings válidas
      const images = Array.isArray(p.images || p.imagens)
        ? (p.images as string[] || p.imagens as string[]).filter((i: unknown) => typeof i === 'string' && !!i)
        : [];

      // Categoria: pode ser string ou objeto
      let category: string | null = null;
      if (typeof p.category === 'object' && p.category !== null) {
        const catObj = p.category as Record<string, unknown>;
        category = String(catObj.nome || catObj.name || JSON.stringify(p.category));
      } else {
        category = p.category ? String(p.category) : (p.categoria ? String(p.categoria) : null);
      }

      valid.push({
        tenant_id: tenantId,
        external_id: externalId,
        sku,
        name: String(p.name || p.nome || 'Sem nome').trim(),
        description: p.description ? String(p.description) : null,
        price: Math.max(0, parseNum(p.price || p.preco)),
        compare_at_price: parseNum(p.compare_at_price || p.preco_comparacao) || null,
        cost: parseNum(p.cost || p.custo) || null,
        stock: safeStock(p.stock ?? p.estoque ?? 0),
        image_url: p.image_url ? String(p.image_url) : (p.imagem ? String(p.imagem) : null),
        images,
        category,
        is_active: p.is_active !== false && p.ativado !== false,
        custom_fields: {
          ...(typeof p.custom_fields === 'object' && p.custom_fields !== null ? p.custom_fields as Record<string, unknown> : {}),
          source,
        },
        synced_at: now,
      });
    } catch (err: unknown) {
      rejected.push({ raw, reason: `Erro inesperado: ${(err as Error).message}` });
    }
  }

  return { valid, rejected };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   MAPPER: PEDIDO → orders table
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export interface MappedOrder {
  tenant_id: string;
  client_id: string | null;
  external_id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  tracking_code: string | null;
  notes: string | null;
  coupon_code: string | null;
  created_at: string;
  metadata: Record<string, unknown>;
  synced_at: string;
}

/**
 * Contexto de lookup para linkar pedidos a clientes.
 * Construído a partir dos clientes existentes no banco.
 */
export interface ClientLookup {
  byPhone: Map<string, string>;       // phone_normalized → client_id
  byFacilZapId: Map<string, string>;  // facilzap_id → client_id
  byCpf: Map<string, string>;         // cpf/cnpj (só dígitos) → client_id
  byEmail: Map<string, string>;       // email → client_id
  byName: Map<string, string>;        // name (lowercase) → client_id
}

/**
 * Constrói o contexto de lookup a partir de clientes do banco.
 * Aceita opcionalmente a coluna `cpf` para matching por CPF/CNPJ.
 */
export function buildClientLookup(
  dbClients: Array<{
    id: string;
    phone: string | null;
    phone_normalized: string | null;
    name: string | null;
    email: string | null;
    cpf?: string | null;
    custom_fields: unknown;
  }>
): ClientLookup {
  const byPhone = new Map<string, string>();
  const byFacilZapId = new Map<string, string>();
  const byCpf = new Map<string, string>();
  const byEmail = new Map<string, string>();
  const byName = new Map<string, string>();

  for (const c of dbClients) {
    // Telefone — registrar todas as variações
    for (const raw of [c.phone_normalized, c.phone]) {
      if (!raw) continue;
      const cleaned = raw.replace(/\D/g, '');
      if (cleaned) {
        byPhone.set(cleaned, c.id);
        byPhone.set(PhoneNormalizer.canonical(cleaned), c.id);
        byPhone.set(PhoneNormalizer.normalize(cleaned), c.id);
      }
    }
    // FacilZap ID
    const cf = c.custom_fields as Record<string, unknown> | null;
    const fzId = cf?.facilzap_id;
    if (fzId) byFacilZapId.set(String(fzId), c.id);
    // CPF/CNPJ — coluna cpf + custom_fields.cpf_cnpj
    const cpfSources = [c.cpf, cf?.cpf_cnpj as string, cf?.cpf as string].filter(Boolean);
    for (const raw of cpfSources) {
      const digits = String(raw).replace(/\D/g, '');
      if (digits.length >= 11) byCpf.set(digits, c.id);
    }
    // Email
    if (c.email) byEmail.set(c.email.toLowerCase().trim(), c.id);
    // Nome
    if (c.name && c.name !== 'Sem nome') byName.set(c.name.toLowerCase().trim(), c.id);
  }

  return { byPhone, byFacilZapId, byCpf, byEmail, byName };
}

/**
 * Resolve client_id para um pedido usando múltiplas estratégias.
 */
export function resolveClientId(
  order: Record<string, unknown>,
  lookup: ClientLookup
): string | null {
  const cliente = order.cliente as Record<string, unknown> | null;
  if (!cliente) return null;

  // 1. Telefone (whatsapp_e164 > whatsapp > telefone)
  const rawPhone = String(
    cliente.whatsapp_e164 || cliente.whatsapp || cliente.telefone || ''
  ).replace(/\D/g, '');
  if (rawPhone && rawPhone.length >= 8) {
    const match = lookup.byPhone.get(rawPhone)
      || lookup.byPhone.get(PhoneNormalizer.canonical(rawPhone))
      || lookup.byPhone.get(PhoneNormalizer.normalize(rawPhone));
    if (match) return match;
  }

  // 2. FacilZap ID
  if (cliente.id) {
    const match = lookup.byFacilZapId.get(String(cliente.id));
    if (match) return match;
  }

  // 3. Email
  if (cliente.email) {
    const match = lookup.byEmail.get(String(cliente.email).toLowerCase().trim());
    if (match) return match;
  }

  // 4. Nome (match exato)
  if (cliente.nome && String(cliente.nome) !== 'Sem nome') {
    const match = lookup.byName.get(String(cliente.nome).toLowerCase().trim());
    if (match) return match;
  }

  return null;
}

/**
 * Mapeia pedidos brutos da FacilZap para o schema do VEXX CRM.
 *
 * REGRAS:
 * - Obrigatório: ID (external_id)
 * - Total ≥ 0
 * - client_id resolvido via ClientLookup (phone → facilzap_id → email → nome)
 * - Dedup por external_id no mesmo lote
 * - Items limitados a 50 por pedido
 */
export function mapOrders(
  rawOrders: unknown[],
  tenantId: string,
  lookup: ClientLookup,
  source: string = 'facilzap'
): MapperResult<MappedOrder> {
  const valid: MappedOrder[] = [];
  const rejected: Array<{ raw: unknown; reason: string }> = [];
  const seen = new Set<string>();
  const now = new Date().toISOString();

  for (const raw of rawOrders) {
    try {
      const o = raw as Record<string, unknown>;
      const externalId = String(o.id || '').trim();

      if (!externalId) {
        rejected.push({ raw, reason: 'Pedido sem ID' });
        continue;
      }

      if (seen.has(externalId)) {
        rejected.push({ raw, reason: `Duplicado no lote: ${externalId}` });
        continue;
      }
      seen.add(externalId);

      // ─── Client ID via lookup
      const clientId = resolveClientId(o, lookup);

      // ─── Status do pedido
      let orderStatus = 'pending';
      if (isTruthy(o.status_entregue)) orderStatus = 'delivered';
      else if (isTruthy(o.status_despachado)) orderStatus = 'shipped';
      else if (isTruthy(o.status_separado) || isTruthy(o.status_em_separacao)) orderStatus = 'processing';
      else if (isTruthy(o.status_pago)) orderStatus = 'confirmed';
      else if (o.status === 'cancelado' || o.status_pedido === 'cancelado') orderStatus = 'cancelled';

      const paymentStatus = isTruthy(o.status_pago) ? 'paid' : 'pending';

      // ─── Método pagamento (pode ser string ou objeto)
      let paymentMethod: string | null = null;
      if (typeof o.metodo_pagamento === 'string' && o.metodo_pagamento) {
        paymentMethod = o.metodo_pagamento;
      } else if (typeof o.metodo_pagamento === 'object' && o.metodo_pagamento !== null) {
        const mp = o.metodo_pagamento as Record<string, unknown>;
        paymentMethod = String(mp.nome || '');
      } else if (typeof o.forma_pagamento === 'string' && o.forma_pagamento) {
        paymentMethod = o.forma_pagamento;
      } else if (Array.isArray(o.pagamentos) && o.pagamentos.length > 0) {
        const p = o.pagamentos[0] as Record<string, unknown>;
        paymentMethod = String(p.metodo || p.forma || p.nome || '');
      }

      // ─── Items
      const items = (o.itens || o.produtos || []) as Array<Record<string, unknown>>;
      const totalItems = items.reduce(
        (sum, it) => sum + (parseNum(it.quantidade) || 1),
        0
      );

      // ─── Data
      const orderDate = safeDate(o.data) || now;

      // ─── Valores financeiros
      const subtotal = parseNum(o.subtotal);
      const discount = parseNum(o.desconto_total || o.desconto);
      const shipping = parseNum(o.valor_frete);
      const total = parseNum(o.total || o.valor_total) || (subtotal - discount + shipping);

      // ─── Order number
      const orderNumber = (() => {
        const codigo = o.codigo || o.numero || o.number || o.numero_pedido;
        return codigo ? String(codigo).trim() || externalId : externalId;
      })();

      // ─── Cliente data for metadata
      const cliente = (o.cliente || {}) as Record<string, unknown>;
      const rawPhone = String(
        cliente.whatsapp_e164 || cliente.whatsapp || cliente.telefone || ''
      );

      valid.push({
        tenant_id: tenantId,
        client_id: clientId,
        external_id: externalId,
        order_number: orderNumber,
        status: orderStatus,
        payment_status: paymentStatus,
        payment_method: paymentMethod || null,
        subtotal,
        discount,
        shipping,
        total,
        tracking_code: o.codigo_rastreio ? String(o.codigo_rastreio) : null,
        notes: o.observacoes ? String(o.observacoes) : null,
        coupon_code: (o.cupom_info as Record<string, unknown>)?.codigo
          ? String((o.cupom_info as Record<string, unknown>).codigo)
          : null,
        created_at: orderDate,
        metadata: {
          cliente_nome: cliente.nome || null,
          cliente_telefone: rawPhone || null,
          cliente_whatsapp: cliente.whatsapp || null,
          cliente_whatsapp_e164: cliente.whatsapp_e164 || null,
          cliente_cpf_cnpj: cliente.cpf_cnpj || null,
          cliente_email: cliente.email || null,
          cliente_id_facilzap: cliente.id || null,
          total_items: totalItems,
          itens: items.slice(0, 50).map((it) => ({
            id: it.id || null,
            produto_id: it.produto_id || null,
            nome: String(it.nome || it.name || ''),
            quantidade: parseNum(it.quantidade) || 1,
            valor: parseNum(it.preco_unitario || it.valor || it.preco),
            variacao: it.variacao || null,
            sku: it.sku || it.codigo || null,
          })),
          pagamentos: o.pagamentos || [],
          status_original: o.status || null,
          status_pedido: o.status_pedido || null,
          status_pago: o.status_pago || null,
          webhook_event: source === 'webhook' ? (o.event || o.tipo || 'unknown') : undefined,
          source,
        },
        synced_at: now,
      });
    } catch (err: unknown) {
      rejected.push({ raw, reason: `Erro inesperado: ${(err as Error).message}` });
    }
  }

  return { valid, rejected };
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   UPSERT HELPERS (batch-safe)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type SupabaseAdmin = ReturnType<typeof import('@/lib/supabase').createServerSupabaseClient>;

export interface UpsertResult {
  created: number;
  updated: number;
  failed: number;
  errors: string[];
}

/**
 * Upsert batch de clientes.
 * Conflict key: tenant_id + phone_normalized
 * NUNCA duplica: se phone_normalized já existe, faz UPDATE.
 */
export async function upsertClients(
  supabase: SupabaseAdmin,
  clients: MappedClient[]
): Promise<UpsertResult> {
  if (clients.length === 0) return { created: 0, updated: 0, failed: 0, errors: [] };

  const errors: string[] = [];
  let total = 0;

  // Processar em batches de 100
  for (let i = 0; i < clients.length; i += 100) {
    const batch = clients.slice(i, i + 100);
    const { error } = await supabase
      .from('clients')
      .upsert(batch, { onConflict: 'tenant_id,phone_normalized' });

    if (error) {
      // Fallback: tentar um por um
      for (const client of batch) {
        const { error: singleErr } = await supabase
          .from('clients')
          .upsert(client, { onConflict: 'tenant_id,phone_normalized' });
        if (singleErr) {
          errors.push(`Cliente ${client.phone}: ${singleErr.message}`);
        } else {
          total++;
        }
      }
    } else {
      total += batch.length;
    }
  }

  return {
    created: total, // Supabase upsert não distingue created/updated
    updated: 0,
    failed: errors.length,
    errors,
  };
}

/**
 * Upsert batch de produtos.
 * Conflict key: tenant_id + external_id
 */
export async function upsertProducts(
  supabase: SupabaseAdmin,
  products: MappedProduct[]
): Promise<UpsertResult> {
  if (products.length === 0) return { created: 0, updated: 0, failed: 0, errors: [] };

  const errors: string[] = [];
  let total = 0;

  for (let i = 0; i < products.length; i += 100) {
    const batch = products.slice(i, i + 100);
    const { error } = await supabase
      .from('products')
      .upsert(batch, { onConflict: 'tenant_id,external_id' });

    if (error) {
      // Fallback: delete + insert (resolve problemas de unique constraint)
      const ids = batch.map((p) => p.external_id);
      const tenantId = batch[0].tenant_id;
      await supabase.from('products').delete().eq('tenant_id', tenantId).in('external_id', ids);
      const { error: ie } = await supabase.from('products').insert(batch);
      if (ie) {
        errors.push(`Produtos batch ${i}: ${ie.message}`);
      } else {
        total += batch.length;
      }
    } else {
      total += batch.length;
    }
  }

  return { created: total, updated: 0, failed: errors.length, errors };
}

/**
 * Upsert batch de pedidos.
 * Conflict key: tenant_id + external_id
 */
export async function upsertOrders(
  supabase: SupabaseAdmin,
  orders: MappedOrder[]
): Promise<UpsertResult> {
  if (orders.length === 0) return { created: 0, updated: 0, failed: 0, errors: [] };

  const errors: string[] = [];
  let total = 0;

  for (let i = 0; i < orders.length; i += 100) {
    const batch = orders.slice(i, i + 100);
    const { error } = await supabase
      .from('orders')
      .upsert(batch, { onConflict: 'tenant_id,external_id' });

    if (error) {
      const ids = batch.map((o) => o.external_id);
      const tenantId = batch[0].tenant_id;
      await supabase.from('orders').delete().eq('tenant_id', tenantId).in('external_id', ids);
      const { error: ie } = await supabase.from('orders').insert(batch);
      if (ie) {
        errors.push(`Pedidos batch ${i}: ${ie.message}`);
      } else {
        total += batch.length;
      }
    } else {
      total += batch.length;
    }
  }

  return { created: total, updated: 0, failed: errors.length, errors };
}

/**
 * Atualiza estatísticas de clientes (LTV, total_orders, avg_ticket).
 * Chamado após upsert de pedidos.
 */
export async function updateClientStats(
  supabase: SupabaseAdmin,
  tenantId: string,
  clientIds?: string[]
): Promise<void> {
  try {
    let query = supabase
      .from('orders')
      .select('client_id, total, created_at')
      .eq('tenant_id', tenantId)
      .not('client_id', 'is', null);

    if (clientIds && clientIds.length > 0) {
      query = query.in('client_id', clientIds);
    }

    const { data: allOrders } = await query;
    if (!allOrders || allOrders.length === 0) return;

    const stats = new Map<string, { total: number; count: number; last: string }>();
    for (const o of allOrders) {
      if (!o.client_id) continue;
      const prev = stats.get(o.client_id) || { total: 0, count: 0, last: '' };
      prev.total += Number(o.total) || 0;
      prev.count += 1;
      if (o.created_at > prev.last) prev.last = o.created_at;
      stats.set(o.client_id, prev);
    }

    const updates = Array.from(stats.entries()).map(([clientId, s]) => ({
      id: clientId,
      tenant_id: tenantId,
      ltv: Math.round(s.total * 100) / 100,
      total_orders: s.count,
      avg_ticket: s.count > 0 ? Math.round((s.total / s.count) * 100) / 100 : 0,
      last_order_at: s.last || null,
    }));

    for (let i = 0; i < updates.length; i += 100) {
      const batch = updates.slice(i, i + 100);
      await supabase.from('clients').upsert(batch, { onConflict: 'id' });
    }

    console.log(`[Mapper] Stats atualizadas para ${stats.size} clientes`);
  } catch (err: unknown) {
    console.error('[Mapper] Erro ao atualizar stats:', (err as Error).message);
  }
}

/**
 * Re-vincula pedidos órfãos (client_id = null) usando o lookup.
 */
export async function relinkOrphans(
  supabase: SupabaseAdmin,
  tenantId: string,
  lookup: ClientLookup,
  limit: number = 5000
): Promise<number> {
  // Processar em batches para não estourar timeout
  let relinked = 0;
  let offset = 0;
  const batchSize = Math.min(limit, 1000);

  while (offset < limit) {
    const { data: orphans } = await supabase
      .from('orders')
      .select('id, metadata')
      .eq('tenant_id', tenantId)
      .is('client_id', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + batchSize - 1);

    if (!orphans || orphans.length === 0) break;

    const updates: Array<{ id: string; client_id: string }> = [];

    for (const order of orphans) {
      const meta = order.metadata as Record<string, unknown> | null;
      if (!meta) continue;

      let cid: string | null = null;

      // 1. Telefone (whatsapp_e164 > whatsapp > telefone)
      const rawPh = String(
        meta.cliente_whatsapp_e164 || meta.cliente_whatsapp || meta.cliente_telefone || ''
      ).replace(/\D/g, '');
      if (rawPh && rawPh.length >= 8) {
        cid = lookup.byPhone.get(rawPh)
          || lookup.byPhone.get(PhoneNormalizer.canonical(rawPh))
          || lookup.byPhone.get(PhoneNormalizer.normalize(rawPh))
          || null;
      }

      // 2. FacilZap ID
      if (!cid && meta.cliente_id_facilzap) {
        cid = lookup.byFacilZapId.get(String(meta.cliente_id_facilzap)) || null;
      }

      // 3. CPF/CNPJ
      if (!cid && meta.cliente_cpf_cnpj) {
        const digits = String(meta.cliente_cpf_cnpj).replace(/\D/g, '');
        if (digits.length >= 11) cid = lookup.byCpf.get(digits) || null;
      }

      // 4. Email
      if (!cid && meta.cliente_email) {
        cid = lookup.byEmail.get(String(meta.cliente_email).toLowerCase().trim()) || null;
      }

      // 5. Nome (último recurso — match exato)
      if (!cid && meta.cliente_nome && String(meta.cliente_nome) !== 'Sem nome') {
        cid = lookup.byName.get(String(meta.cliente_nome).toLowerCase().trim()) || null;
      }

      if (cid) updates.push({ id: order.id, client_id: cid });
    }

    // Batch update (evita N queries individuais)
    for (const u of updates) {
      await supabase.from('orders').update({ client_id: u.client_id }).eq('id', u.id);
      relinked++;
    }

    if (orphans.length < batchSize) break;
    offset += batchSize;
  }

  if (relinked > 0) {
    console.log(`[Mapper] Re-vinculados ${relinked} pedidos órfãos`);
  }

  return relinked;
}
