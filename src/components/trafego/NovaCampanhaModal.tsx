'use client';

import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Globe, Loader2, Wand2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { authFetch } from '@/components/trafego/trafegoUtils';

const OBJETIVOS = [
  { value: 'OUTCOME_LEADS',       label: 'Leads — capturar cadastros' },
  { value: 'OUTCOME_TRAFFIC',     label: 'Tráfego — cliques no site' },
  { value: 'OUTCOME_SALES',       label: 'Vendas — conversões' },
  { value: 'OUTCOME_AWARENESS',   label: 'Reconhecimento de marca' },
  { value: 'OUTCOME_ENGAGEMENT',  label: 'Engajamento — curtidas e comentários' },
];

const CTA_META_OPTIONS = [
  { value: 'LEARN_MORE',        label: 'Saiba mais' },
  { value: 'SHOP_NOW',          label: 'Comprar agora' },
  { value: 'SIGN_UP',           label: 'Cadastrar' },
  { value: 'CONTACT_US',        label: 'Entrar em contato' },
  { value: 'SEND_MESSAGE',      label: 'Enviar mensagem' },
  { value: 'CALL_NOW',          label: 'Ligar agora' },
  { value: 'GET_OFFER',         label: 'Ver oferta' },
  { value: 'GET_QUOTE',         label: 'Pedir orçamento' },
];

export function NovaCampanhaModal({ onClose, onCreated }: { onClose: () => void; onCreated: (msg: string) => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [verificandoDup, setVerificandoDup] = useState(false);
  const [avisosDup, setAvisosDup] = useState<Array<{ id: string; nome: string }>>([]);

  // Step 1 — Basic
  const [nome, setNome] = useState('');
  const [objetivo, setObjetivo] = useState('OUTCOME_LEADS');
  const [orcamento, setOrcamento] = useState('50');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');

  // Step 2 — Audience
  const [idadeMin, setIdadeMin] = useState('18');
  const [idadeMax, setIdadeMax] = useState('65');
  const [genero, setGenero] = useState<'0' | '1' | '2'>('0');

  // Step 3 — Creative
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [cta, setCta] = useState('LEARN_MORE');
  const [urlDestino, setUrlDestino] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  async function handleCreate() {
    setLoading(true);
    setErr(null);
    try {
      const res = await authFetch('/api/trafego/campaign-create', {
        method: 'POST',
        body: JSON.stringify({
          nome,
          objetivo,
          orcamento_diario: parseFloat(orcamento) || 50,
          data_inicio: dataInicio || new Date().toISOString(),
          data_fim: dataFim || undefined,
          publico: {
            paises: ['BR'],
            idade_min: parseInt(idadeMin) || 18,
            idade_max: parseInt(idadeMax) || 65,
            genero: parseInt(genero),
          },
          criativo: {
            titulo: titulo.trim(),
            texto: texto.trim(),
            cta,
            url_destino: urlDestino.trim(),
            image_url: imageUrl.trim() || undefined,
          },
        }),
      });
      const json = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !json.ok) {
        setErr(json.error || 'Erro ao criar campanha');
        return;
      }
      onCreated(json.message || 'Campanha criada com sucesso!');
      onClose();
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }

  const canGoStep2 = nome.trim().length > 2 && parseFloat(orcamento) >= 5;
  const canGoStep3 = true; // audience always valid
  const canCreate = titulo.trim().length > 0 && texto.trim().length > 0 && urlDestino.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2">
            <Wand2 size={18} className="text-crm-primary" />
            <h2 className="font-bold text-gray-900">Nova Campanha no Meta</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={18} /></button>
        </div>

        {/* Steps indicator */}
        <div className="flex px-6 pt-4 gap-2">
          {(['Básico', 'Público', 'Criativo'] as const).map((label, i) => (
            <div key={label} className="flex-1 text-center">
              <div className={cn(
                'h-1.5 rounded-full mb-1 transition-colors',
                step > i + 1 ? 'bg-crm-primary' : step === i + 1 ? 'bg-crm-primary' : 'bg-gray-200'
              )} />
              <span className={cn('text-xs font-medium', step === i + 1 ? 'text-crm-primary' : 'text-gray-400')}>{label}</span>
            </div>
          ))}
        </div>

        <div className="p-6 space-y-4">
          {err && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 flex items-start gap-2">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {err}
            </div>
          )}

          {avisosDup.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800 space-y-2">
              <div className="flex items-start gap-2 font-medium">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                Já existe{avisosDup.length > 1 ? 'm' : ''} {avisosDup.length} campanha{avisosDup.length > 1 ? 's' : ''} com nome similar nos últimos 7 dias:
              </div>
              <ul className="list-disc list-inside text-xs space-y-0.5 pl-1">
                {avisosDup.map(d => <li key={d.id}>{d.nome}</li>)}
              </ul>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => { setAvisosDup([]); setStep(2); }}
                  className="text-xs font-medium text-amber-900 underline hover:no-underline"
                >
                  Criar mesmo assim
                </button>
                <span className="text-amber-400">·</span>
                <button
                  onClick={() => setAvisosDup([])}
                  className="text-xs text-amber-700 hover:text-amber-900"
                >
                  Alterar nome
                </button>
              </div>
            </div>
          )}

          {/* STEP 1 */}
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome da campanha *</label>
                <input
                  type="text"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Ex: Rasteirinhas Atacado — Verão 2025"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Objetivo *</label>
                <div className="relative">
                  <select
                    value={objetivo}
                    onChange={e => setObjetivo(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 pr-8"
                  >
                    {OBJETIVOS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Orçamento diário (R$) *</label>
                <input
                  type="number"
                  min={5}
                  step={1}
                  value={orcamento}
                  onChange={e => setOrcamento(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data início *</label>
                  <input
                    type="date"
                    value={dataInicio}
                    onChange={e => setDataInicio(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data fim (opcional)</label>
                  <input
                    type="date"
                    value={dataFim}
                    onChange={e => setDataFim(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  />
                </div>
              </div>
              <div className="bg-blue-50 rounded-xl px-3 py-2.5 text-xs text-blue-800">
                A campanha será criada <strong>pausada</strong> para revisão antes de ativar.
              </div>
            </div>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 rounded-xl px-3 py-2.5">
                <Globe size={15} className="text-gray-400" /> Brasil (BR) — país padrão
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idade mínima</label>
                  <input type="number" min={18} max={64} value={idadeMin} onChange={e => setIdadeMin(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Idade máxima</label>
                  <input type="number" min={19} max={65} value={idadeMax} onChange={e => setIdadeMax(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gênero</label>
                <div className="flex gap-2">
                  {[{ v: '0', l: 'Todos' }, { v: '2', l: 'Mulheres' }, { v: '1', l: 'Homens' }].map(({ v, l }) => (
                    <button key={v} onClick={() => setGenero(v as '0' | '1' | '2')}
                      className={cn('flex-1 py-2 rounded-xl border text-sm font-medium transition-all',
                        genero === v ? 'bg-crm-primary text-white border-crm-primary' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      )}>
                      {l}
                    </button>
                  ))}
                </div>
              </div>
              <div className="bg-amber-50 rounded-xl px-3 py-2.5 text-xs text-amber-800">
                Segmentação por interesses pode ser adicionada depois no Meta Ads Manager para refinamento avançado.
              </div>
            </div>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Título do anúncio * <span className="font-normal text-gray-400">({titulo.length}/40)</span>
                </label>
                <input
                  type="text" maxLength={40} value={titulo} onChange={e => setTitulo(e.target.value)}
                  placeholder="Ex: Direto da fábrica pra você revender"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Texto principal * <span className="font-normal text-gray-400">({texto.length}/125)</span>
                </label>
                <textarea
                  maxLength={125} rows={3} value={texto} onChange={e => setTexto(e.target.value)}
                  placeholder="Ex: Rasteirinhas de R$25 a R$49,90 — mínimo 5 pares. Sortido à sua escolha."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30 resize-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Botão de ação (CTA) *</label>
                <div className="relative">
                  <select value={cta} onChange={e => setCta(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-crm-primary/30 pr-8">
                    {CTA_META_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL de destino *</label>
                <input type="url" value={urlDestino} onChange={e => setUrlDestino(e.target.value)}
                  placeholder="https://cjrasteirinhas.com.br/atacado"
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">URL da imagem (opcional)</label>
                <input type="url" value={imageUrl} onChange={e => setImageUrl(e.target.value)}
                  placeholder="https://..."
                  className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-6 sticky bottom-0 bg-white pt-2 border-t border-gray-100">
          {step > 1 && (
            <button onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">
              Voltar
            </button>
          )}
          <div className="flex-1" />
          {step < 3 ? (
            <button
              onClick={async () => {
                if (step === 1) {
                  // Verificar duplicatas antes de avançar
                  setVerificandoDup(true);
                  setAvisosDup([]);
                  try {
                    const res = await authFetch(`/api/trafego/metrics?period=7d`);
                    if (res.ok) {
                      const dados = await res.json() as { campaigns?: Array<{ id: string; nome: string }> };
                      const iguais = (dados.campaigns ?? []).filter(
                        c => c.nome.toLowerCase().includes(nome.trim().toLowerCase())
                      );
                      if (iguais.length > 0) {
                        setAvisosDup(iguais);
                        return; // não avança — mostra aviso
                      }
                    }
                  } catch { /* silencia: se falhar a checagem, avança normalmente */ }
                  finally { setVerificandoDup(false); }
                }
                setStep(s => (s + 1) as 2 | 3);
              }}
              disabled={(step === 1 ? !canGoStep2 : !canGoStep3) || verificandoDup}
              className="px-5 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1.5"
            >
              {verificandoDup ? <Loader2 size={14} className="animate-spin" /> : null}
              Próximo <ChevronRight size={15} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              disabled={loading || !canCreate}
              className="px-5 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              <Wand2 size={14} />
              Criar campanha
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
