'use client';

import { useState, useMemo } from 'react';
import {
  ShoppingBag,
  Search,
  X,
  Send,
  ExternalLink,
  Package,
  Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSendProductToChat } from '@/hooks/useContactCenter';
import { useChatsStore } from '@/store/chats';
import type { Product } from '@/types';

interface CatalogoDrawerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Drawer de Catálogo — busca e envia produtos direto no chat.
 */
export function CatalogoDrawer({ open, onClose }: CatalogoDrawerProps) {
  const { selectedChatId } = useChatsStore();
  const [search, setSearch] = useState('');
  const [sentProductId, setSentProductId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const sendMutation = useSendProductToChat();

  // A API retorna { data: Product[], total, page, ... }
  interface ProductsResponse {
    data: Product[];
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
  }

  const { data: productsResponse, isLoading, isError, error: queryError } = useQuery<ProductsResponse>({
    queryKey: ['products', 'catalog'],
    queryFn: async () => {
      const res = await api.get<ProductsResponse>('/api/products?per_page=200');
      if (res.error) throw new Error(res.error);
      if (!res.data) throw new Error('Nenhum dado retornado');
      return res.data;
    },
    enabled: open,
    staleTime: 60_000,
  });

  // Extrair array de produtos da resposta paginada
  const products = productsResponse?.data || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q)
    );
  }, [products, search]);

  const handleSend = async (product: Product) => {
    if (!selectedChatId) return;

    sendMutation.mutate(
      {
        conversation_id: selectedChatId,
        product_id: product.id,
        include_price: true,
        include_link: true,
      },
      {
        onSuccess: () => {
          setSentProductId(product.id);
          setTimeout(() => setSentProductId(null), 2000);
          // Invalidar mensagens e chats para exibir a mensagem enviada
          queryClient.invalidateQueries({ queryKey: ['messages', selectedChatId] });
          queryClient.invalidateQueries({ queryKey: ['chats'] });
        },
      }
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-80 bg-white border-l border-surface-200 shadow-xl z-40 flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-surface-200 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingBag size={16} className="text-crm-primary" />
          <h3 className="text-sm font-semibold text-txt-primary">Catálogo</h3>
          <span className="text-xs text-txt-muted">
            {products.length} produtos
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-txt-secondary hover:bg-surface-100 transition-colors"
        >
          <X size={16} />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2 border-b border-surface-200 shrink-0">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            placeholder="Buscar produto..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
          />
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-crm-primary" />
          </div>
        ) : isError ? (
          <div className="px-4 py-8 text-center">
            <Package size={28} className="text-red-300 mx-auto mb-2" />
            <p className="text-xs text-red-500">Erro ao carregar produtos</p>
            <p className="text-[10px] text-txt-muted mt-1">{queryError?.message}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Package size={28} className="text-gray-300 mx-auto mb-2" />
            <p className="text-xs text-txt-muted">Nenhum produto encontrado</p>
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {filtered.map((product) => {
              const isSent = sentProductId === product.id;
              const isSending =
                sendMutation.isPending &&
                sendMutation.variables?.product_id === product.id;

              return (
                <div
                  key={product.id}
                  className={cn(
                    'flex items-center gap-3 p-2.5 rounded-lg transition-all border',
                    isSent
                      ? 'border-emerald-200 bg-emerald-50'
                      : 'border-transparent hover:bg-surface-50'
                  )}
                >
                  {/* Product image or placeholder */}
                  <div className="w-12 h-12 rounded-lg bg-surface-100 shrink-0 overflow-hidden flex items-center justify-center">
                    {product.image_url ? (
                      <img
                        src={product.image_url}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Package size={18} className="text-gray-300" />
                    )}
                  </div>

                  {/* Product info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-txt-primary truncate">
                      {product.name}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs font-semibold text-emerald-600">
                        R$ {product.price.toFixed(2)}
                      </span>
                      {product.stock !== null && product.stock <= 5 && (
                        <span className="text-[10px] text-orange-600">
                          {product.stock} un.
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Send button */}
                  <button
                    onClick={() => handleSend(product)}
                    disabled={!selectedChatId || isSending || isSent}
                    className={cn(
                      'p-2 rounded-lg transition-all shrink-0',
                      isSent
                        ? 'bg-emerald-500 text-white'
                        : 'bg-crm-primary/10 text-crm-primary hover:bg-crm-primary hover:text-white',
                      (!selectedChatId || isSending) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {isSending ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : isSent ? (
                      <ExternalLink size={14} />
                    ) : (
                      <Send size={14} />
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
