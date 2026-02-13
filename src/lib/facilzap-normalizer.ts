/**
 * FacilZap Normalizer — Normalização de dados da API FacilZap.
 * 
 * Trata hierarquia de produtos/variações e normaliza preços/estoque conforme
 * a documentação oficial da FacilZap.
 * 
 * IMPORTANTE: API FacilZap retorna campos em PORTUGUÊS com estrutura complexa:
 * - Preço pode estar em `catalogos[0].precos.preco` ou direto em `preco`
 * - Estoque pode ser número simples ou objeto `{ controlar_estoque, estoque }`
 * - Imagens podem ser objeto `{ url }` ou `{ file }` (precisa construir URL)
 */

interface FacilZapProduct {
  id: number;
  nome: string;
  descricao?: string;
  codigo?: string;
  sku?: string;
  ativado?: boolean;
  
  // Preço pode vir em 4 locais diferentes!
  preco?: string | number;
  valor?: string | number;
  catalogos?: Array<{
    precos?: {
      preco?: string | number;
      preco_promocional?: string | number;
    };
  }>;
  
  // Estoque pode ser número ou objeto
  estoque?: number | {
    controlar_estoque?: boolean;
    estoque?: number;
    quantidade?: number;
  };
  
  // Imagens podem vir em formatos variados
  imagens?: Array<{
    url?: string;
    file?: string;
    path?: string;
  } | string>;
  
  // Código de barras em formatos variados
  cod_barras?: {
    numero?: string;
  } | Array<{
    numero?: string;
  }> | string;
  
  // Variações (tamanhos, cores, etc)
  variacoes?: FacilZapVariation[];
}

interface FacilZapVariation {
  id: number;
  nome: string;
  preco?: string | number;
  valor?: string | number;
  sku?: string;
  ativado?: boolean;
  estoque?: number | {
    estoque?: number;
    quantidade?: number;
  };
}

export interface NormalizedProduct {
  external_id: string;
  sku: string;
  name: string;
  description: string;
  price: number;
  compare_at_price: number | null;
  cost: number | null;
  stock: number;
  category: string;
  image_url: string;
  images: string[];
  is_active: boolean;
  custom_fields: Record<string, unknown>;
}

/**
 * Normaliza um produto da FacilZap para o schema do VEXX CRM.
 * 
 * Regra de preço (hierarquia conforme doc FacilZap):
 * 1. catalogos[0].precos.preco_promocional (se houver promoção ativa)
 * 2. catalogos[0].precos.preco (preço padrão)
 * 3. preco ou valor (campo direto)
 * 4. variacoes[0].preco (preço da primeira variação)
 * 
 * Regra de estoque:
 * - Se estoque é objeto: verifica `controlar_estoque`
 * - Se tem variações: soma estoque de todas as variações
 * - Se não controla estoque: retorna -1 (infinito)
 * 
 * @param raw - Produto bruto da API FacilZap (campos em português)
 * @returns Array de produtos normalizados (1 produto pai + N variações)
 */
export function normalizeProduct(raw: FacilZapProduct): NormalizedProduct[] {
  const products: NormalizedProduct[] = [];

  // ━━━ HELPER: Converter preço string → number ━━━
  const parsePrice = (value?: string | number): number => {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    return parseFloat(String(value).replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
  };

  // ━━━ EXTRAÇÃO DE PREÇO (4 locais possíveis) ━━━
  const extractPrice = (product: FacilZapProduct): { price: number; compareAt: number | null } => {
    // 1. Tentar catalogos[0].precos (estrutura padrão FacilZap)
    if (product.catalogos && product.catalogos.length > 0) {
      const precos = product.catalogos[0].precos;
      if (precos) {
        const preco = parsePrice(precos.preco);
        const promoPrice = parsePrice(precos.preco_promocional);
        
        if (promoPrice > 0) {
          return { price: promoPrice, compareAt: preco };
        }
        if (preco > 0) {
          return { price: preco, compareAt: null };
        }
      }
    }
    
    // 2. Campo direto (preco ou valor)
    const preco = parsePrice(product.preco || product.valor);
    if (preco > 0) {
      return { price: preco, compareAt: null };
    }
    
    // 3. Variação
    if (product.variacoes && product.variacoes.length > 0) {
      const varPrice = parsePrice(product.variacoes[0].preco || product.variacoes[0].valor);
      if (varPrice > 0) {
        return { price: varPrice, compareAt: null };
      }
    }
    
    return { price: 0, compareAt: null };
  };

  // ━━━ EXTRAÇÃO DE ESTOQUE ━━━
  const extractStock = (
    product: FacilZapProduct | FacilZapVariation,
    isVariation = false
  ): number => {
    const estoque = product.estoque;
    
    // Caso 1: Número simples
    if (typeof estoque === 'number') return estoque;
    
    // Caso 2: Objeto com flags
    if (typeof estoque === 'object' && estoque !== null) {
      // Se não controla estoque: infinito
      if ('controlar_estoque' in estoque && !estoque.controlar_estoque) {
        return -1;
      }
      
      // Se tem variações (produto pai): somar estoque de todas
      if (!isVariation && 'variacoes' in product && Array.isArray(product.variacoes) && product.variacoes.length > 0) {
        return product.variacoes.reduce((sum, v) => {
          const vEstoque = v.estoque;
          const qty = typeof vEstoque === 'number' 
            ? vEstoque 
            : (vEstoque?.estoque || vEstoque?.quantidade || 0);
          return sum + qty;
        }, 0);
      }
      
      // Estoque individual
      return estoque.estoque ?? estoque.quantidade ?? 0;
    }
    
    return 0;
  };

  // ━━━ EXTRAÇÃO DE IMAGENS (3 formatos) ━━━
  const extractImages = (product: FacilZapProduct): string[] => {
    const imagens = product.imagens || [];
    const result: string[] = [];
    
    imagens.forEach((img) => {
      if (typeof img === 'string') {
        result.push(img);
      } else if (typeof img === 'object' && img !== null) {
        // Ordem de prioridade: url → path → file (construir URL)
        const url = img.url || img.path;
        if (url) {
          result.push(url);
        } else if (img.file) {
          result.push(`https://arquivos.facilzap.app.br/${img.file}`);
        }
      }
    });
    
    return result;
  };

  // ━━━ EXTRAÇÃO DE CÓDIGO DE BARRAS ━━━
  const extractBarcode = (product: FacilZapProduct): string | null => {
    const cod = product.cod_barras;
    
    if (!cod) return null;
    if (typeof cod === 'string') return cod;
    if (Array.isArray(cod) && cod.length > 0) {
      return cod[0].numero || null;
    }
    if (typeof cod === 'object' && 'numero' in cod) {
      return cod.numero || null;
    }
    
    return null;
  };

  // ━━━ CAMPOS BASE DO PRODUTO ━━━
  const images = extractImages(raw);
  const baseProduct = {
    name: raw.nome || 'Produto sem nome',
    description: raw.descricao || '',
    category: '', // FacilZap não retorna categoria na estrutura básica
    image_url: images[0] || '',
    images,
    is_active: raw.ativado !== false,
  };

  const pricing = extractPrice(raw);

  // ━━━ CASO 1: Produto SEM variações (produto simples) ━━━
  if (!raw.variacoes || raw.variacoes.length === 0) {
    products.push({
      external_id: String(raw.id),
      sku: raw.sku || raw.codigo || `FZ-${raw.id}`,
      ...baseProduct,
      price: pricing.price,
      compare_at_price: pricing.compareAt,
      cost: 0, // FacilZap não expõe custo na API pública
      stock: extractStock(raw),
      custom_fields: {
        is_variation: false,
        barcode: extractBarcode(raw),
      },
    });
  }
  // ━━━ CASO 2: Produto COM variações ━━━
  // Agrupado: produto único com estoque total e variações em custom_fields
  else {
    // Somar estoque de todas as variações
    const totalStock = raw.variacoes.reduce((sum, v) => {
      const vStock = extractStock(v, true);
      return sum + (vStock > 0 ? vStock : 0);
    }, 0);

    // Montar lista de variações para metadado
    const variations = raw.variacoes.map((v) => ({
      id: v.id,
      name: v.nome,
      sku: v.sku || `FZ-${raw.id}-${v.id}`,
      stock: extractStock(v, true),
      price: parsePrice(v.preco || v.valor) || pricing.price,
      is_active: v.ativado !== false,
    }));

    products.push({
      external_id: String(raw.id),
      sku: raw.sku || raw.codigo || `FZ-${raw.id}`,
      ...baseProduct,
      price: pricing.price,
      compare_at_price: pricing.compareAt,
      cost: 0,
      stock: totalStock,
      custom_fields: {
        is_variation: false,
        has_variations: true,
        variations,
        barcode: extractBarcode(raw),
      },
    });
  }

  return products;
}

/**
 * Normaliza múltiplos produtos de uma vez (busca em lote).
 * 
 * @param rawProducts - Array de produtos da API FacilZap
 * @returns Array flat de produtos normalizados (produtos + variações)
 */
export function normalizeProducts(rawProducts: FacilZapProduct[]): NormalizedProduct[] {
  return rawProducts.flatMap((raw) => normalizeProduct(raw));
}

/**
 * Agrupa produtos por categoria (útil para exibição).
 * 
 * @param products - Produtos normalizados
 * @returns Map de categoria → produtos
 */
export function groupByCategory(
  products: NormalizedProduct[]
): Map<string, NormalizedProduct[]> {
  const grouped = new Map<string, NormalizedProduct[]>();

  products.forEach((product) => {
    const category = product.category || 'Sem categoria';
    if (!grouped.has(category)) {
      grouped.set(category, []);
    }
    grouped.get(category)!.push(product);
  });

  return grouped;
}

/**
 * Filtra produtos em estoque (stock > 0).
 * 
 * @param products - Produtos normalizados
 * @returns Apenas produtos disponíveis
 */
export function filterInStock(products: NormalizedProduct[]): NormalizedProduct[] {
  return products.filter((p) => p.stock > 0);
}

/**
 * Filtra apenas produtos ativos.
 * 
 * @param products - Produtos normalizados
 * @returns Apenas produtos ativos
 */
export function filterActive(products: NormalizedProduct[]): NormalizedProduct[] {
  return products.filter((p) => p.is_active);
}

/**
 * Busca produto por SKU.
 * 
 * @param products - Produtos normalizados
 * @param sku - SKU a buscar
 * @returns Produto encontrado ou undefined
 */
export function findBySKU(
  products: NormalizedProduct[],
  sku: string
): NormalizedProduct | undefined {
  return products.find((p) => p.sku === sku);
}

/**
 * Busca fuzzy por nome de produto (case-insensitive).
 * 
 * @param products - Produtos normalizados
 * @param query - Termo de busca
 * @returns Produtos que contêm o termo no nome
 */
export function searchByName(
  products: NormalizedProduct[],
  query: string
): NormalizedProduct[] {
  const lowerQuery = query.toLowerCase();
  return products.filter((p) => p.name.toLowerCase().includes(lowerQuery));
}
