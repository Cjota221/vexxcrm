'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  Package,
  ExternalLink,
  Image as ImageIcon,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency, debounce } from '@/lib/utils';
import { useProducts } from '@/hooks/useProducts';
import type { Product } from '@/types';

export default function ProdutosPage() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const perPage = 24;

  const { data, isLoading } = useProducts({ search: search || undefined, page: currentPage, per_page: perPage });

  const products = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.total_pages ?? 1;

  const handleSearch = debounce((value: string) => {
    setSearch(value);
    setCurrentPage(1);
  }, 300);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Produtos</h1>
          <p className="text-sm text-txt-secondary mt-1">
            {total} produtos sincronizados via FacilZap
          </p>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <div className="p-4">
          <Input
            placeholder="Buscar produto por nome..."
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Grid de produtos */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-surface-200 rounded-2xl h-72 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.length === 0 ? (
            <div className="col-span-full text-center py-12">
              <Package size={32} className="mx-auto text-txt-secondary mb-3" />
              <p className="text-txt-secondary">Nenhum produto encontrado</p>
              <p className="text-xs text-txt-muted mt-1">
                Sincronize com FacilZap em Configurações para importar seus produtos
              </p>
            </div>
          ) : (
            products.map((product: any) => (
            <Card
              key={product.id}
              hover
              padding="none"
              className="cursor-pointer"
              onClick={() => router.push(`/produtos/${product.id}`)}
            >
              <div className="aspect-square bg-surface-100 rounded-t-2xl overflow-hidden flex items-center justify-center">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <ImageIcon size={32} className="text-txt-secondary" />
                )}
              </div>
              <div className="p-4 space-y-2">
                <h3 className="text-sm font-semibold text-txt-primary truncate">
                  {product.name}
                </h3>
                {product.category && (
                  <Badge variant="neutral">
                    {typeof product.category === 'object'
                      ? (product.category.nome || product.category.name || JSON.stringify(product.category))
                      : product.category}
                  </Badge>
                )}
                {/* Variações (tamanhos) */}
                {(() => {
                  const cf = typeof product.custom_fields === 'string'
                    ? JSON.parse(product.custom_fields || '{}')
                    : (product.custom_fields || {});
                  const variations = cf.variations || [];
                  if (variations.length > 0) {
                    return (
                      <div className="flex flex-wrap gap-1">
                        {variations.map((v: any) => (
                          <span
                            key={v.id}
                            className={`text-xs px-1.5 py-0.5 rounded border ${
                              v.stock > 0
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-red-200 bg-red-50 text-red-500 line-through'
                            }`}
                          >
                            {v.name}
                          </span>
                        ))}
                      </div>
                    );
                  }
                  return null;
                })()}
                <div className="flex items-center justify-between">
                  <div>
                    {product.price_promotional ? (
                      <>
                        <span className="text-xs text-txt-secondary line-through">
                          {formatCurrency(product.price)}
                        </span>
                        <p className="text-sm font-bold text-green-600">
                          {formatCurrency(product.price_promotional)}
                        </p>
                      </>
                    ) : (
                      <p className="text-sm font-bold text-txt-primary">
                        {formatCurrency(product.price)}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-txt-secondary">
                    Estoque: {product.stock}
                  </span>
                </div>
              </div>
            </Card>
          ))
        )}
        </div>
      )}

      {/* Paginação */}
      {totalPages > 1 && (
        <Card>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-xs text-txt-secondary">
              Mostrando {((currentPage - 1) * perPage) + 1}–{Math.min(currentPage * perPage, total)} de {total} produtos
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-crm-primary text-white'
                        : 'hover:bg-surface-100 text-txt-secondary'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg hover:bg-surface-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
