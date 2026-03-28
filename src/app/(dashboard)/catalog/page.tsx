'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  ShoppingBag, Plus, RefreshCw, Loader2, AlertTriangle,
  CheckCircle, XCircle, Package, Image as ImageIcon, X,
  ExternalLink, Tag, ChevronDown, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function authFetch(url: string, options?: RequestInit): Promise<Response> {
  const token = useAuthStore.getState().accessToken;
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options?.headers ?? {}),
    },
  });
}

/* ─── Tipos ────────────────────────────────────────────────────────────────── */

interface Catalog {
  id: string;
  nome: string;
  meta_catalog_id?: string;
  tenant_id: string;
  created_at: string;
}

interface Product {
  id: string;
  catalog_id?: string;
  titulo: string;
  descricao?: string;
  preco: number; // centavos
  disponibilidade: string;
  condicao: string;
  image_url?: string;
  link_produto?: string;
  marca?: string;
  sku?: string;
  meta_item_id?: string;
  meta_item_id?: string;
  sincronizado_em?: string;
  created_at: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function brl(centavos: number) {
  return (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ─── Componente: Modal de Produto ─────────────────────────────────────────── */

function NovoProdutoModal({
  catalogs,
  onClose,
  onSaved,
}: {
  catalogs: Catalog[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [linkProduto, setLinkProduto] = useState('');
  const [marca, setMarca] = useState('');
  const [sku, setSku] = useState('');
  const [catalogId, setCatalogId] = useState(catalogs[0]?.id || '');
  const [sincronizar, setSincronizar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    if (!titulo.trim() || !preco) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await authFetch('/api/catalog', {
        method: 'POST',
        body: JSON.stringify({
          catalog_id: catalogId || undefined,
          titulo: titulo.trim(),
          descricao: descricao.trim() || undefined,
          preco: parseFloat(preco) || 0,
          image_url: imageUrl.trim() || undefined,
          link_produto: linkProduto.trim() || undefined,
          marca: marca.trim() || undefined,
          sku: sku.trim() || undefined,
          sincronizar_meta: sincronizar,
        }),
      });
      const json = await res.json() as { id?: string; error?: string };
      if (!res.ok || !json.id) {
        setErr(json.error || 'Erro ao salvar produto');
        return;
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="font-bold text-gray-900 flex items-center gap-2">
            <Package size={18} className="text-crm-primary" /> Novo produto
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>

        <div className="p-6 space-y-4">
          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {err}
            </div>
          )}

          {catalogs.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Catálogo</label>
              <div className="relative">
                <select value={catalogId} onChange={e => setCatalogId(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 pr-8">
                  {catalogs.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do produto *</label>
            <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)}
              placeholder="Ex: Rasteirinha Elástico Verão"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <textarea rows={2} value={descricao} onChange={e => setDescricao(e.target.value)}
              placeholder="Breve descrição do produto"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30 resize-none" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Preço (R$) *</label>
              <input type="number" min={0} step={0.01} value={preco} onChange={e => setPreco(e.target.value)}
                placeholder="49.90"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
              <input type="text" value={sku} onChange={e => setSku(e.target.value)}
                placeholder="RAST-001"
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Marca</label>
            <input type="text" value={marca} onChange={e => setMarca(e.target.value)}
              placeholder="CJ Rasteirinhas"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">URL da imagem</label>
            <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
              placeholder="https://..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link do produto</label>
            <input type="url" value={linkProduto} onChange={e => setLinkProduto(e.target.value)}
              placeholder="https://cjrasteirinhas.com.br/produto/..."
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
          </div>

          {catalogs.some(c => c.meta_catalog_id) && (
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input type="checkbox" checked={sincronizar} onChange={e => setSincronizar(e.target.checked)}
                className="w-4 h-4 accent-crm-primary" />
              Sincronizar com catálogo Meta (Facebook/Instagram Shopping)
            </label>
          )}
        </div>

        <div className="flex gap-2 px-6 pb-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} disabled={saving || !titulo.trim() || !preco}
            className="flex-1 px-4 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 size={13} className="animate-spin" />}
            <Plus size={13} /> Salvar produto
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Página Principal ─────────────────────────────────────────────────────── */

export default function CatalogPage() {
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [newProdutoOpen, setNewProdutoOpen] = useState(false);
  const [filterCatalog, setFilterCatalog] = useState<string>('all');
  const [business, setBusiness] = useState<{
    businesses?: Array<{ id: string; name: string }>;
    adAccount?: { name?: string; currency?: string; amount_spent?: string; account_status?: number };
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [catRes, bizRes] = await Promise.all([
        authFetch('/api/catalog'),
        authFetch('/api/business'),
      ]);
      if (catRes.ok) {
        const d = await catRes.json() as { catalogs: Catalog[]; products: Product[] };
        setCatalogs(d.catalogs || []);
        setProducts(d.products || []);
      }
      if (bizRes.ok) {
        setBusiness(await bizRes.json() as typeof business);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = filterCatalog === 'all'
    ? products
    : products.filter(p => p.catalog_id === filterCatalog);

  const syncedCount = products.filter(p => p.meta_item_id).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <ShoppingBag size={22} className="text-crm-primary" />
                Catálogo de Produtos
              </h1>
              <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                <span>{products.length} produto{products.length !== 1 ? 's' : ''}</span>
                {syncedCount > 0 && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle size={11} /> {syncedCount} sincronizado{syncedCount !== 1 ? 's' : ''} com Meta
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={load} disabled={loading}
                className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => setNewProdutoOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90"
              >
                <Plus size={14} /> Novo produto
              </button>
            </div>
          </div>
        </div>

        {/* Business Manager Card */}
        {business?.adAccount && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
              <Building2 size={18} className="text-crm-primary" />
              Business Manager
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-500">Conta</div>
                <div className="font-semibold text-gray-900 text-sm mt-0.5">{business.adAccount.name || '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-500">Moeda</div>
                <div className="font-semibold text-gray-900 text-sm mt-0.5">{business.adAccount.currency || '—'}</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-500">Gasto total</div>
                <div className="font-semibold text-gray-900 text-sm mt-0.5">
                  {business.adAccount.amount_spent
                    ? `R$ ${(parseInt(business.adAccount.amount_spent) / 100).toLocaleString('pt-BR')}`
                    : '—'}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-3">
                <div className="text-xs text-gray-500">Status</div>
                <div className={cn('font-semibold text-sm mt-0.5 flex items-center gap-1',
                  business.adAccount.account_status === 1 ? 'text-green-700' : 'text-red-600')}>
                  <span className={cn('w-1.5 h-1.5 rounded-full',
                    business.adAccount.account_status === 1 ? 'bg-green-500' : 'bg-red-500')} />
                  {business.adAccount.account_status === 1 ? 'Ativo' : 'Inativo'}
                </div>
              </div>
            </div>
            {(business.businesses || []).length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <div className="text-xs text-gray-500 mb-2">Businesses</div>
                <div className="flex flex-wrap gap-2">
                  {(business.businesses || []).map(b => (
                    <span key={b.id} className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Catálogos + Produtos */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          {/* Filtros */}
          {catalogs.length > 0 && (
            <div className="flex gap-2 px-5 pt-5 flex-wrap">
              <button
                onClick={() => setFilterCatalog('all')}
                className={cn('px-3 py-1.5 rounded-xl text-sm font-medium transition-all',
                  filterCatalog === 'all' ? 'bg-crm-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                Todos
              </button>
              {catalogs.map(c => (
                <button key={c.id} onClick={() => setFilterCatalog(c.id)}
                  className={cn('px-3 py-1.5 rounded-xl text-sm font-medium transition-all',
                    filterCatalog === c.id ? 'bg-crm-primary text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  )}>
                  {c.nome}
                  {c.meta_catalog_id && <span className="ml-1 text-xs opacity-70">(Meta)</span>}
                </button>
              ))}
            </div>
          )}

          <div className="p-5">
            {loading ? (
              <div className="text-center py-12 text-gray-400 text-sm flex items-center justify-center gap-2">
                <Loader2 size={16} className="animate-spin" /> Carregando produtos...
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <ShoppingBag size={40} className="text-gray-200 mx-auto mb-3" />
                <p className="text-gray-500 text-sm">Nenhum produto cadastrado</p>
                <p className="text-gray-400 text-xs mt-1">Clique em "Novo produto" para adicionar ao catálogo</p>
                <button onClick={() => setNewProdutoOpen(true)}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90 mx-auto">
                  <Plus size={14} /> Adicionar primeiro produto
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map(p => (
                  <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-md transition-shadow">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.titulo} className="w-full aspect-square object-cover" />
                    ) : (
                      <div className="w-full aspect-square bg-gray-50 flex items-center justify-center">
                        <ImageIcon size={32} className="text-gray-200" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-semibold text-gray-900 text-sm truncate">{p.titulo}</div>
                          {p.marca && <div className="text-xs text-gray-400 mt-0.5">{p.marca}</div>}
                        </div>
                        <div className="text-sm font-bold text-crm-primary shrink-0">{brl(p.preco)}</div>
                      </div>
                      {p.descricao && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{p.descricao}</p>
                      )}
                      <div className="flex items-center gap-2 mt-3">
                        {p.sku && (
                          <span className="flex items-center gap-1 text-xs text-gray-400">
                            <Tag size={10} /> {p.sku}
                          </span>
                        )}
                        {p.meta_item_id ? (
                          <span className="ml-auto flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle size={11} /> Meta
                          </span>
                        ) : (
                          <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                            <Package size={11} /> Local
                          </span>
                        )}
                      </div>
                      {p.link_produto && (
                        <a href={p.link_produto} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs text-crm-primary mt-2 hover:underline">
                          <ExternalLink size={10} /> Ver produto
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Info sobre catálogos Meta */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <CheckCircle size={16} className="text-green-500" />
            Catálogos Meta — Dynamic Ads & Shopping
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { icon: <ShoppingBag size={18} className="text-blue-500" />, title: 'Facebook Shopping', desc: 'Produtos aparecem na aba Shop da sua página e nos anúncios de catálogo' },
              { icon: <ImageIcon size={18} className="text-pink-500" />, title: 'Instagram Shopping', desc: 'Tags de produto em posts e Stories — compra direto do feed' },
              { icon: <Tag size={18} className="text-green-500" />, title: 'Dynamic Ads', desc: 'Anúncios automáticos que mostram produtos relevantes para cada pessoa' },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="bg-gray-50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">{icon}<span className="font-medium text-gray-900 text-sm">{title}</span></div>
                <p className="text-xs text-gray-500">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            Para criar catálogos Meta e habilitar Shopping, acesse o{' '}
            <strong>Meta Commerce Manager</strong> e vincule ao seu token.
            Use a permissão <span className="font-mono bg-amber-100 px-1 rounded">catalog_management</span> para sincronizar produtos via API.
          </div>
        </div>

      </div>

      {newProdutoOpen && (
        <NovoProdutoModal
          catalogs={catalogs}
          onClose={() => setNewProdutoOpen(false)}
          onSaved={load}
        />
      )}
    </div>
  );
}
