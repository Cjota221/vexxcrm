/**
 * FacilZap Service — Integração com API FacilZap (E-commerce).
 * 
 * Todas as funções recebem `token` e `storeUrl` como parâmetros (SaaS multi-tenant).
 * Implementa busca paralela e normalização de produtos/clientes/pedidos.
 * 
 * IMPORTANTE: Endpoints e estrutura de dados conforme documentação oficial FacilZap.
 */

import { normalizeProducts, type NormalizedProduct } from '@/lib/facilzap-normalizer';

export interface FacilZapConfig {
  token: string;       // Token da loja
  storeUrl?: string;   // URL da loja (opcional, para geração de links)
}

const API_BASE_URL = 'https://api.facilzap.app.br';

/**
 * Helper para fazer requisições autenticadas à API FacilZap com timeout e retry.
 */
async function request<T>(
  config: FacilZapConfig,
  endpoint: string,
  options?: RequestInit,
  retryAttempts = 3
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  for (let attempt = 1; attempt <= retryAttempts; attempt++) {
    console.log(`🔄 FacilZap Request: ${endpoint} (tentativa ${attempt}/${retryAttempts})`);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Authorization': `Bearer ${config.token}`,
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      console.log(`✅ FacilZap Response: ${endpoint} (${duration}ms) - Status: ${response.status}`);

      if (!response.ok) {
        const isServerError = response.status >= 500;
        const errorBody = await response.text().catch(() => '');
        let errorMessage = `HTTP ${response.status}`;
        try {
          const parsed = JSON.parse(errorBody);
          errorMessage = parsed.message || parsed.error || parsed.msg || errorMessage;
        } catch {
          // Se é HTML (erro de servidor), mostrar mensagem amigável
          if (errorBody.includes('<!DOCTYPE') || errorBody.includes('<html')) {
            errorMessage = `HTTP ${response.status} — Servidor FacilZap temporariamente indisponível`;
          } else if (errorBody) {
            errorMessage += `: ${errorBody.slice(0, 150)}`;
          }
        }
        console.error(`❌ FacilZap Error ${response.status}:`, errorMessage);

        // Retry automático para erros de servidor (5xx) e 429 (rate limit)
        if ((isServerError || response.status === 429) && attempt < retryAttempts) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
          console.log(`⏳ Servidor instável (${response.status}), retry em ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }

        throw new Error(errorMessage);
      }

      return response.json();
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error(`❌ FacilZap Failed: ${endpoint} (${duration}ms)`, error.message);
      
      if (error.name === 'AbortError') {
        if (attempt < retryAttempts) {
          const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
          console.log(`⏳ Timeout, retry em ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
        throw new Error(`Timeout ao chamar FacilZap API: ${endpoint}`);
      }

      // Para outros erros, retry com backoff
      if (attempt < retryAttempts) {
        const delay = Math.min(2000 * Math.pow(2, attempt - 1), 15000);
        console.log(`⏳ Erro de rede, retry em ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw error;
    }
  }

  throw new Error(`Falha após ${retryAttempts} tentativas: ${endpoint}`);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PRODUTOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface FacilZapProductsResponse {
  data: unknown[];
}

/**
 * Busca produtos da loja com paginação.
 * 
 * @param config - Configuração FacilZap (token)
 * @param page - Número da página (padrão: 1)
 * @param length - Itens por página (padrão: 100, conforme doc FacilZap)
 * @returns Produtos normalizados (com variações expandidas)
 * 
 * @example
 * const products = await fetchProducts({ token: 'abc123' }, 1, 50);
 */
export async function fetchProducts(
  config: FacilZapConfig,
  page = 1,
  length = 100
): Promise<{ products: unknown[]; hasMore: boolean }> {
  const response = await request<FacilZapProductsResponse>(
    config,
    `/produtos?page=${page}&length=${length}`
  );

  const rawData = Array.isArray(response?.data) ? response.data : [];
  const normalized = normalizeProducts(rawData as never[]);

  return {
    products: normalized,
    hasMore: rawData.length > 0,
  };
}

/**
 * Busca TODOS os produtos da loja (busca paralela em lote).
 * 
 * Estratégia (conforme doc FacilZap):
 * 1. Busca páginas sequencialmente até retornar array vazio
 * 2. API NÃO retorna total de páginas — para quando data.length === 0
 * 3. Limite de segurança: máx 20 páginas (2.000 produtos)
 * 
 * @param config - Configuração FacilZap
 * @param length - Itens por página (padrão: 100)
 * @param maxPages - Limite de páginas (padrão: 50)
 * @returns Todos os produtos normalizados
 * 
 * @example
 * const allProducts = await fetchAllProducts({ token: 'abc123' });
 * // Retorna array com produtos + variações de todas as páginas
 */
export async function fetchAllProducts(
  config: FacilZapConfig,
  length = 100,
  maxPages = 50
): Promise<NormalizedProduct[]> {
  const allProducts: NormalizedProduct[] = [];
  let page = 1;
  let hasMore = true;

  console.log(`📦 Sync Produtos: Iniciando busca (maxPages=${maxPages}, length=${length})`);

  while (hasMore && page <= maxPages) {
    const result = await fetchProducts(config, page, length);
    
    if (result.products.length > 0) {
      allProducts.push(...(result.products as NormalizedProduct[]));
      console.log(`📦 Produtos: página ${page} → ${result.products.length} itens (total acumulado: ${allProducts.length})`);
      page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Sync Produtos: ${allProducts.length} produtos em ${page - 1} páginas`);
  return allProducts;
}

/**
 * Busca um produto específico por ID.
 * 
 * @param config - Configuração FacilZap
 * @param productId - ID do produto
 * @returns Produto normalizado (com variações, se houver)
 */
export async function fetchProductById(
  config: FacilZapConfig,
  productId: string
): Promise<NormalizedProduct[]> {
  const response = await request<{ data: unknown }>(config, `/produtos/${productId}`);
  return normalizeProducts([response.data] as never[]);
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CLIENTES
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface FacilZapClient {
  id: string | number;
  tipo_contato?: string;
  nome: string;
  cpf_cnpj?: string;
  email?: string;
  data_nascimento?: string;
  demais_dados?: string;
  catalogos?: string;
  vendedores_associados?: string;
  grupos?: string;
  origem?: string;
  ultima_compra?: string;
  status?: string;
  created_at?: string;
  // Campos legados/extras que podem vir em algumas respostas
  telefone?: string;
  whatsapp?: string;
  celular?: string;
  endereco?: string;
  bairro?: string;
  cidade?: string;
  estado?: string;
  cep?: string;
}

/**
 * Busca clientes da loja.
 * 
 * @param config - Configuração FacilZap
 * @param page - Número da página
 * @param length - Itens por página
 * @returns Clientes da FacilZap
 */
export async function fetchClients(
  config: FacilZapConfig,
  page = 1,
  length = 100
): Promise<{ clients: FacilZapClient[]; hasMore: boolean }> {
  const response = await request<{ data: FacilZapClient[] }>(
    config,
    `/clientes?page=${page}&length=${length}`
  );

  const clients = Array.isArray(response?.data) ? response.data : [];

  return {
    clients,
    hasMore: clients.length > 0,
  };
}

/**
 * Busca TODOS os clientes da loja (busca sequencial).
 * 
 * @param config - Configuração FacilZap
 * @param length - Itens por página
 * @param maxPages - Limite de páginas (padrão: 50)
 * @returns Todos os clientes
 */
export async function fetchAllClients(
  config: FacilZapConfig,
  length = 100,
  maxPages = 50
): Promise<FacilZapClient[]> {
  const allClients: FacilZapClient[] = [];
  let page = 1;
  let hasMore = true;

  console.log(`👥 Sync Clientes: Iniciando busca (maxPages=${maxPages})`);

  while (hasMore && page <= maxPages) {
    const result = await fetchClients(config, page, length);
    
    if (result.clients.length > 0) {
      allClients.push(...result.clients);
      console.log(`👥 Clientes: página ${page} → ${result.clients.length} itens (total: ${allClients.length})`);
      page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Sync Clientes: ${allClients.length} clientes em ${page - 1} páginas`);
  return allClients;
}

/**
 * Busca cliente específico por ID.
 * 
 * @param config - Configuração FacilZap
 * @param clientId - ID do cliente
 * @returns Cliente
 */
export async function fetchClientById(
  config: FacilZapConfig,
  clientId: string
): Promise<FacilZapClient> {
  const response = await request<{ data: FacilZapClient }>(
    config,
    `/clientes/${clientId}`
  );
  return response.data;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PEDIDOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

interface FacilZapOrder {
  id: string | number;
  codigo: string;
  data: string;
  catalogo?: { id: number; nome: string; tipo: string };
  vendedor?: { id: number; nome: string };
  cliente: {
    id: string;
    nome: string;
    cpf_cnpj?: string;
    whatsapp?: string;
    telefone?: string;
    email?: string;
  };
  forma_entrega?: { id: string; nome: string } | null;
  pagamentos?: Array<{ forma_pagamento?: string; valor?: string }>;
  metodo_pagamento?: string;
  subtotal: string;
  valor_frete: string;
  desconto: string;
  desconto_sistema?: string;
  desconto_total?: string;
  total: string;
  taxa?: string;
  status: string;
  status_pedido: string;
  status_pago: string;
  status_em_separacao?: string;
  status_separado?: string;
  status_despachado?: string;
  status_entregue: string;
  observacoes?: string;
  origem?: string;
  cupom_info?: string;
  // Itens só vêm quando incluir_produtos=1
  itens?: FacilZapOrderItem[];
  produtos?: FacilZapOrderItem[];
}

interface FacilZapOrderItem {
  id?: number;
  produto_id?: number;
  nome: string;
  quantidade: number;
  valor: string | number;
  preco_unitario?: string | number;
  variacao?: string;
  imagem?: string;
}

/**
 * Busca pedidos da loja.
 * 
 * ⚠️ CRÍTICO: Sempre incluir `filtros[incluir_produtos]=1` para receber os itens!
 * 
 * @param config - Configuração FacilZap
 * @param page - Número da página
 * @param length - Itens por página
 * @param filters - Filtros adicionais (data, status)
 * @returns Pedidos
 */
export async function fetchOrders(
  config: FacilZapConfig,
  page = 1,
  length = 100,
  filters?: {
    status?: string;
    data_inicial?: string; // YYYY-MM-DD
    data_final?: string;   // YYYY-MM-DD
  }
): Promise<{ orders: FacilZapOrder[]; hasMore: boolean }> {
  const params = new URLSearchParams({
    page: String(page),
    length: String(length),
    'filtros[incluir_produtos]': '1', // ⚠️ CRÍTICO: sem isso, pedidos vêm vazios!
  });

  if (filters?.data_inicial) {
    params.append('filtros[data_inicial]', filters.data_inicial);
  }
  if (filters?.data_final) {
    params.append('filtros[data_final]', filters.data_final);
  }
  if (filters?.status) {
    params.append('filtros[status]', filters.status);
  }

  const response = await request<{ data: FacilZapOrder[] }>(
    config,
    `/pedidos?${params.toString()}`
  );

  const orders = Array.isArray(response?.data) ? response.data : [];

  return {
    orders,
    hasMore: orders.length > 0,
  };
}

/**
 * Busca TODOS os pedidos da loja (últimos 2 anos).
 * 
 * @param config - Configuração FacilZap
 * @param length - Itens por página
 * @param maxPages - Limite de páginas (padrão: 50)
 * @param yearsBack - Anos para buscar histórico (padrão: 5)
 * @returns Todos os pedidos
 */
export async function fetchAllOrders(
  config: FacilZapConfig,
  length = 100,
  maxPages = 50,
  yearsBack = 5
): Promise<FacilZapOrder[]> {
  const allOrders: FacilZapOrder[] = [];
  let page = 1;
  let hasMore = true;

  // Calcular período (últimos N anos)
  const dataFinal = new Date().toISOString().split('T')[0];
  const dataInicial = new Date();
  dataInicial.setFullYear(dataInicial.getFullYear() - yearsBack);
  const dataInicialStr = dataInicial.toISOString().split('T')[0];

  console.log(`📋 Sync Pedidos: Iniciando busca de ${dataInicialStr} até ${dataFinal} (maxPages=${maxPages})`);

  while (hasMore && page <= maxPages) {
    const result = await fetchOrders(config, page, length, {
      data_inicial: dataInicialStr,
      data_final: dataFinal,
    });
    
    if (result.orders.length > 0) {
      allOrders.push(...result.orders);
      console.log(`📋 Pedidos: página ${page} → ${result.orders.length} itens (total: ${allOrders.length})`);
      page++;
    } else {
      hasMore = false;
    }
  }

  console.log(`✅ Sync Pedidos: ${allOrders.length} pedidos em ${page - 1} páginas`);
  return allOrders;
}

/**
 * Busca pedido específico por ID.
 * 
 * @param config - Configuração FacilZap
 * @param orderId - ID do pedido
 * @returns Pedido completo
 */
export async function fetchOrderById(
  config: FacilZapConfig,
  orderId: string
): Promise<FacilZapOrder> {
  const response = await request<{ data: FacilZapOrder }>(
    config,
    `/pedidos/${orderId}?filtros[incluir_produtos]=1`
  );
  return response.data;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   CARRINHO ABANDONADO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Gera link de carrinho abandonado para o cliente.
 * 
 * @param config - Configuração FacilZap
 * @param items - Itens do carrinho
 * @param customerPhone - Telefone do cliente (formato: 5562999998888)
 * @returns URL do carrinho para enviar por WhatsApp
 * 
 * @example
 * const cartUrl = await generateCartLink(config, [
 *   { product_id: 123, quantity: 2 },
 *   { product_id: 456, quantity: 1 },
 * ], '5562999998888');
 * 
 * // Enviar via Evolution API
 * await sendTextMessage(evolutionConfig, '5562999998888', 
 *   `Olá! Finalize seu pedido: ${cartUrl}`
 * );
 */
export async function generateCartLink(
  config: FacilZapConfig,
  items: Array<{ product_id: number; quantity: number }>,
  customerPhone?: string
): Promise<string> {
  const response = await request<{ data: { url: string } }>(config, '/cart/generate', {
    method: 'POST',
    body: JSON.stringify({
      items,
      customer_phone: customerPhone,
    }),
  });

  return response.data.url;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   SINCRONIZAÇÃO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

/**
 * Sincroniza dados completos da loja (produtos, clientes, pedidos).
 * Busca tudo em paralelo para maximizar performance.
 * 
 * @param config - Configuração FacilZap
 * @param fullSync - Se true, busca TODAS as páginas (padrão: false)
 * @returns Objeto com todos os dados sincronizados
 * 
 * @example
 * // Sync rápido (primeira página)
 * const data = await syncStoreData({ token: 'abc123' });
 * 
 * // Sync completo (todas as páginas)
 * const fullData = await syncStoreData({ token: 'abc123' }, true);
 */
export async function syncStoreData(
  config: FacilZapConfig,
  fullSync = false
) {
  if (fullSync) {
    // Sync completo: busca todas as páginas
    const [products, clients, orders] = await Promise.all([
      fetchAllProducts(config),
      fetchAllClients(config),
      fetchAllOrders(config),
    ]);

    return {
      products,
      clients,
      orders,
      synced_at: new Date().toISOString(),
    };
  } else {
    // Sync rápido: apenas primeira página de cada
    const [productsResult, clientsResult, ordersResult] = await Promise.all([
      fetchProducts(config, 1, 100),
      fetchClients(config, 1, 100),
      fetchOrders(config, 1, 100),
    ]);

    return {
      products: productsResult.products,
      clients: clientsResult.clients,
      orders: ordersResult.orders,
      synced_at: new Date().toISOString(),
    };
  }
}
