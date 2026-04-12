'use client';

import { useState } from 'react';
import { Image as ImageIcon, Loader2, RefreshCw, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch, brl2, n0 } from '@/components/trafego/trafegoUtils';

interface CatalogItem {
  id: string; nome: string; total_produtos: number; total_feeds: number; vertical: string;
}
interface ProductItem {
  id: string; nome: string; descricao: string; preco: number; preco_oferta: number | null;
  disponivel: boolean; url: string; imagem: string; marca: string; categoria: string;
}

export function CatalogoTab() {
  const [catalogs, setCatalogs]           = useState<CatalogItem[]>([]);
  const [catalogsLoading, setCatalogsLoading] = useState(false);
  const [catalogsLoaded, setCatalogsLoaded]   = useState(false);
  const [selectedCatalog, setSelectedCatalog] = useState<CatalogItem | null>(null);
  const [products, setProducts]           = useState<ProductItem[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [dpaForm, setDpaForm]             = useState(false);
  const [dpaName, setDpaName]             = useState('');
  const [dpaBudget, setDpaBudget]         = useState('50');
  const [dpaLoading, setDpaLoading]       = useState(false);
  const [dpaResult, setDpaResult]         = useState<string | null>(null);
  const [error, setError]                 = useState<string | null>(null);

  async function loadCatalogs() {
    setCatalogsLoading(true); setError(null);
    try {
      const res = await authFetch('/api/meta/catalog');
      const json = await res.json() as { catalogs?: CatalogItem[]; error?: string };
      if (!res.ok) { setError(json.error || 'Erro ao carregar catálogos'); return; }
      setCatalogs(json.catalogs || []);
      setCatalogsLoaded(true);
    } catch (e) { setError(String(e)); }
    finally { setCatalogsLoading(false); }
  }

  async function loadProducts(catalog: CatalogItem) {
    setSelectedCatalog(catalog); setProducts([]); setProductsLoading(true);
    try {
      const res = await authFetch(`/api/meta/catalog?catalog_id=${catalog.id}`);
      const json = await res.json() as { products?: ProductItem[] };
      setProducts(json.products || []);
    } catch { /* silencioso */ }
    finally { setProductsLoading(false); }
  }

  async function criarDPA() {
    if (!selectedCatalog) return;
    setDpaLoading(true); setDpaResult(null); setError(null);
    try {
      const res = await authFetch('/api/meta/catalog', {
        method: 'POST',
        body: JSON.stringify({
          catalog_id:  selectedCatalog.id,
          adset_name:  dpaName || 'Conjunto DPA',
          ad_name:     dpaName || 'Anúncio dinâmico',
          daily_budget: parseFloat(dpaBudget) || 50,
        }),
      });
      const json = await res.json() as { ok?: boolean; campaign_id?: string; aviso?: string; error?: string };
      if (!res.ok || !json.ok) { setError(json.error || 'Erro ao criar DPA'); return; }
      setDpaResult(`Campanha DPA criada! ID: ${json.campaign_id}. ${json.aviso || ''}`);
      setDpaForm(false);
    } catch (e) { setError(String(e)); }
    finally { setDpaLoading(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900">Catálogos de Produtos</h2>
          <p className="text-xs text-gray-400 mt-0.5">Gerencie catálogos e crie anúncios dinâmicos (DPA)</p>
        </div>
        <button onClick={loadCatalogs} disabled={catalogsLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50">
          {catalogsLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
          {catalogsLoaded ? 'Atualizar' : 'Carregar catálogos'}
        </button>
      </div>

      {error && <div className="text-red-600 text-xs bg-red-50 px-4 py-3 rounded-xl border border-red-200">{error}</div>}
      {dpaResult && <div className="text-green-800 text-xs bg-green-50 px-4 py-3 rounded-xl border border-green-200">{dpaResult}</div>}

      {!catalogsLoaded && !catalogsLoading && (
        <div className="text-center py-12 text-gray-300">
          <ImageIcon size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Clique em &quot;Carregar catálogos&quot; para ver seus catálogos do Meta</p>
        </div>
      )}

      {catalogsLoaded && catalogs.length === 0 && (
        <div className="text-center py-12 text-gray-300">
          <ImageIcon size={40} className="mx-auto mb-3" />
          <p className="text-sm text-gray-500">Nenhum catálogo encontrado nesta conta.</p>
        </div>
      )}

      {catalogs.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {catalogs.map(cat => (
            <div key={cat.id}
              onClick={() => loadProducts(cat)}
              className={cn('cursor-pointer rounded-2xl border p-4 transition-all hover:shadow-md',
                selectedCatalog?.id === cat.id ? 'border-blue-400 bg-blue-50' : 'border-gray-100 bg-white')}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-semibold text-gray-900 text-sm">{cat.nome}</div>
                  <div className="text-xs text-gray-400 mt-0.5 capitalize">{cat.vertical}</div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">{n0(cat.total_produtos)}</div>
                  <div className="text-[10px] text-gray-400">produtos</div>
                </div>
              </div>
              {selectedCatalog?.id === cat.id && (
                <button
                  onClick={e => { e.stopPropagation(); setDpaForm(true); }}
                  className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700"
                >
                  <Wand2 size={12} /> Criar anúncio dinâmico (DPA)
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* DPA form */}
      {dpaForm && selectedCatalog && (
        <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-3">
          <div className="font-semibold text-gray-900 text-sm">Criar campanha DPA — {selectedCatalog.nome}</div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Nome do conjunto / anúncio</label>
            <input value={dpaName} onChange={e => setDpaName(e.target.value)} placeholder="Ex: Rasteirinhas Verão"
              className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Orçamento diário (R$)</label>
            <input value={dpaBudget} onChange={e => setDpaBudget(e.target.value)} type="number" min="5" placeholder="50"
              className="mt-1 w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            A campanha será criada com status <strong>PAUSADA</strong>. Revise e ative no Gerenciador de Anúncios.
          </div>
          <div className="flex gap-2">
            <button onClick={criarDPA} disabled={dpaLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
              {dpaLoading ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
              {dpaLoading ? 'Criando...' : 'Criar DPA'}
            </button>
            <button onClick={() => setDpaForm(false)} className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100">Cancelar</button>
          </div>
        </div>
      )}

      {/* Products grid */}
      {selectedCatalog && productsLoading && (
        <div className="text-center py-6 text-gray-400"><Loader2 size={24} className="animate-spin mx-auto mb-2" /><p className="text-sm">Carregando produtos...</p></div>
      )}
      {selectedCatalog && !productsLoading && products.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-3">
            {products.length} produtos — {selectedCatalog.nome}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {products.slice(0, 24).map(p => (
              <div key={p.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {p.imagem && (
                  <img src={p.imagem} alt={p.nome} className="w-full h-28 object-cover bg-gray-100" />
                )}
                {!p.imagem && (
                  <div className="w-full h-28 bg-gray-100 flex items-center justify-center">
                    <ImageIcon size={24} className="text-gray-300" />
                  </div>
                )}
                <div className="p-2">
                  <div className="text-xs font-semibold text-gray-800 truncate">{p.nome}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {p.preco_oferta ? (
                      <><span className="line-through text-gray-300">{brl2(p.preco)}</span> <span className="text-green-700 font-semibold">{brl2(p.preco_oferta)}</span></>
                    ) : brl2(p.preco)}
                  </div>
                  <span className={cn('text-[10px] px-1.5 py-0.5 rounded mt-1 inline-block font-medium',
                    p.disponivel ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600')}>
                    {p.disponivel ? 'Disponível' : 'Indisponível'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          {products.length > 24 && (
            <p className="text-xs text-gray-400 text-center mt-3">Exibindo 24 de {products.length} produtos</p>
          )}
        </div>
      )}
    </div>
  );
}
