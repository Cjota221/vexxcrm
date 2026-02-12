'use client';

import { useState } from 'react';
import {
  Search,
  Package,
  Plus,
  ExternalLink,
  Image as ImageIcon,
} from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { formatCurrency } from '@/lib/utils';
import type { Product } from '@/types';

// TODO: hook useProdutos
const mockProducts: Product[] = [];

export default function ProdutosPage() {
  const [search, setSearch] = useState('');

  const filtered = mockProducts.filter(
    (p) => !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Produtos</h1>
          <p className="text-sm text-txt-secondary mt-1">
            Catálogo sincronizado com FacilZap
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary">
            <ExternalLink size={16} /> Sincronizar FacilZap
          </Button>
          <Button variant="primary">
            <Plus size={16} /> Novo Produto
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <div className="p-4">
          <Input
            placeholder="Buscar produto..."
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Card>

      {/* Grid de produtos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {filtered.length === 0 ? (
          <div className="col-span-full text-center py-12">
            <Package size={32} className="mx-auto text-txt-secondary mb-3" />
            <p className="text-txt-secondary">Nenhum produto encontrado</p>
            <p className="text-xs text-txt-muted mt-1">
              Sincronize com FacilZap ou adicione manualmente
            </p>
          </div>
        ) : (
          filtered.map((product) => (
            <Card key={product.id} hover padding="none">
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
                  <Badge variant="neutral">{product.category}</Badge>
                )}
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
    </div>
  );
}
