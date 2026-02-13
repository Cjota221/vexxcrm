'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  Package,
  Image as ImageIcon,
  Tag,
  Barcode,
  Layers,
  TrendingUp,
  ShoppingBag,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { formatCurrency } from '@/lib/utils';

export default function ProdutoDetalhe() {
  const params = useParams();
  const router = useRouter();
  const productId = params.id as string;

  const { data: product, isLoading } = useQuery({
    queryKey: ['product', productId],
    queryFn: async () => {
      const response = await api.get(`/api/products/${productId}`);
      return response.data as any;
    },
    enabled: !!productId,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-8 bg-surface-200 rounded w-48 animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="h-96 bg-surface-200 rounded-xl animate-pulse" />
          <div className="lg:col-span-2 h-96 bg-surface-200 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <Package size={48} className="mx-auto text-txt-secondary mb-4" />
        <p className="text-txt-secondary">Produto não encontrado</p>
        <Button variant="ghost" onClick={() => router.back()} className="mt-4">
          <ArrowLeft size={16} /> Voltar
        </Button>
      </div>
    );
  }

  // Parse custom_fields
  const cf = typeof product.custom_fields === 'string'
    ? (() => { try { return JSON.parse(product.custom_fields); } catch { return {}; } })()
    : (product.custom_fields || {});
  const variations = cf.variations || [];
  const images = product.images || [];
  const category = product.category
    ? (typeof product.category === 'object' ? (product.category.nome || product.category.name || JSON.stringify(product.category)) : product.category)
    : null;

  // Calcular estoque total incluindo variações
  const totalStock = variations.length > 0
    ? variations.reduce((sum: number, v: any) => sum + (Number(v.stock) || 0), 0)
    : (Number(product.stock) || 0);
  const inStockVariations = variations.filter((v: any) => (Number(v.stock) || 0) > 0).length;
  const outOfStockVariations = variations.filter((v: any) => (Number(v.stock) || 0) <= 0).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="p-2 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-txt-primary">{product.name}</h1>
          <p className="text-sm text-txt-secondary mt-1">
            {product.sku && `SKU: ${typeof product.sku === 'object' ? JSON.stringify(product.sku) : product.sku}`}
            {product.sku && product.external_id && ' · '}
            {product.external_id && `ID: ${product.external_id}`}
          </p>
        </div>
        <Badge variant={product.is_active !== false ? 'success' : 'danger'}>
          {product.is_active !== false ? 'Ativo' : 'Inativo'}
        </Badge>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
              <Tag size={20} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Preço</p>
              <p className="text-lg font-bold text-txt-primary">
                {formatCurrency(Number(product.price) || 0)}
              </p>
            </div>
          </div>
        </Card>
        {product.compare_at_price && Number(product.compare_at_price) > 0 && (
          <Card>
            <div className="p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <TrendingUp size={20} className="text-red-500" />
              </div>
              <div>
                <p className="text-xs text-txt-secondary">Preço Original</p>
                <p className="text-lg font-bold text-red-500 line-through">
                  {formatCurrency(Number(product.compare_at_price))}
                </p>
              </div>
            </div>
          </Card>
        )}
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
              <Package size={20} className="text-green-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Estoque Total</p>
              <p className={`text-lg font-bold ${totalStock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                {totalStock}
              </p>
            </div>
          </div>
        </Card>
        <Card>
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <Layers size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-txt-secondary">Variações</p>
              <p className="text-lg font-bold text-txt-primary">
                {variations.length || 0}
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Coluna da imagem */}
        <div className="space-y-4">
          <Card padding="none">
            <div className="aspect-square bg-surface-100 rounded-2xl overflow-hidden flex items-center justify-center">
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                />
              ) : (
                <ImageIcon size={48} className="text-txt-secondary" />
              )}
            </div>
          </Card>

          {/* Galeria de imagens extras */}
          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.slice(0, 8).map((img: string, idx: number) => (
                <div key={idx} className="aspect-square bg-surface-100 rounded-lg overflow-hidden">
                  <img
                    src={img}
                    alt={`${product.name} ${idx + 1}`}
                    className="w-full h-full object-cover"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* Informações gerais */}
          <Card>
            <CardHeader>
              <CardTitle>Informações</CardTitle>
            </CardHeader>
            <div className="px-4 pb-4 space-y-2">
              {category && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Categoria</span>
                  <Badge variant="neutral">{category}</Badge>
                </div>
              )}
              {product.sku && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">SKU</span>
                  <span className="text-sm text-txt-primary font-medium">
                    {typeof product.sku === 'object' ? JSON.stringify(product.sku) : product.sku}
                  </span>
                </div>
              )}
              {product.cost && Number(product.cost) > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Custo</span>
                  <span className="text-sm text-txt-primary">{formatCurrency(Number(product.cost))}</span>
                </div>
              )}
              {product.synced_at && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-txt-secondary">Última sync</span>
                  <span className="text-xs text-txt-secondary">
                    {new Date(product.synced_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Coluna principal */}
        <div className="lg:col-span-2 space-y-6">
          {/* Descrição */}
          {product.description && (
            <Card>
              <CardHeader>
                <CardTitle>Descrição</CardTitle>
              </CardHeader>
              <div className="px-4 pb-4">
                <p className="text-sm text-txt-secondary whitespace-pre-wrap leading-relaxed">
                  {product.description}
                </p>
              </div>
            </Card>
          )}

          {/* Variações */}
          {variations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>
                  <Layers size={16} /> Variações ({variations.length})
                  {inStockVariations > 0 && (
                    <Badge variant="success" className="ml-2">{inStockVariations} em estoque</Badge>
                  )}
                  {outOfStockVariations > 0 && (
                    <Badge variant="danger" className="ml-1">{outOfStockVariations} sem estoque</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <div className="px-4 pb-4">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-surface-200">
                        <th className="text-left text-xs font-medium text-txt-secondary py-2">Variação</th>
                        <th className="text-left text-xs font-medium text-txt-secondary py-2">SKU</th>
                        <th className="text-right text-xs font-medium text-txt-secondary py-2">Preço</th>
                        <th className="text-right text-xs font-medium text-txt-secondary py-2">Estoque</th>
                        <th className="text-center text-xs font-medium text-txt-secondary py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variations.map((v: any) => {
                        const vStock = Number(v.stock) || 0;
                        const vPrice = Number(v.price) || Number(product.price) || 0;
                        return (
                          <tr key={v.id} className="border-b border-surface-100">
                            <td className="py-2.5">
                              <span className="text-sm font-medium text-txt-primary">{v.name}</span>
                            </td>
                            <td className="py-2.5">
                              <span className="text-xs text-txt-secondary font-mono">{v.sku || '—'}</span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className="text-sm text-txt-primary">{formatCurrency(vPrice)}</span>
                            </td>
                            <td className="py-2.5 text-right">
                              <span className={`text-sm font-medium ${vStock > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                {vStock}
                              </span>
                            </td>
                            <td className="py-2.5 text-center">
                              {vStock > 0 ? (
                                <CheckCircle size={16} className="text-green-500 inline" />
                              ) : (
                                <AlertTriangle size={16} className="text-red-400 inline" />
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </Card>
          )}

          {/* Custom fields extras */}
          {cf.source && (
            <Card>
              <CardHeader>
                <CardTitle>Fonte dos Dados</CardTitle>
              </CardHeader>
              <div className="px-4 pb-4">
                <Badge variant="info">{cf.source === 'facilzap' ? 'Importado do FacilZap' : cf.source}</Badge>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
