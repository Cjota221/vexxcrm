'use client';

import { useState, useEffect, useRef, Suspense, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Check, Upload, Trash2, GripVertical,
  Image as ImageIcon, Type, Link2, ChevronDown, ChevronUp,
  Plus, Calendar, Users, Zap, Send, Loader2, AlertCircle,
  Search, Mic, Video, UsersRound, X, ChevronRight, Database, Filter,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoBloco = 'imagem' | 'video' | 'audio' | 'texto' | 'cta';
type ModoDestinatario = 'inteligencia' | 'toda_base' | 'manual' | 'grupos';

interface Bloco {
  id: string;
  ordem: number;
  tipo: TipoBloco;
  conteudo: {
    url?: string;
    storage_path?: string;
    kind?: 'image' | 'video' | 'audio';
    texto_raw?: string;
    texto_botao?: string;
    url_destino?: string;
    caption?: string;
  };
}

interface Contato {
  id: string;
  telefone: string;
  nome?: string;
  cidade?: string;
  estado?: string;
  ultimo_pedido?: string;
  valor_ltv?: number;
}

interface GrupoWA {
  id: string;
  nome: string;
  participantes: number;
  descricao?: string;
}

interface AntibanConfig {
  delay_min_ms: number;
  delay_max_ms: number;
  cooloff_a_cada: number;
  cooloff_duracao_ms: number;
  janela_horaria_inicio: number;
  janela_horaria_fim: number;
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const ANTIBAN_PADRAO: AntibanConfig = {
  delay_min_ms: 15_000,         // Regra da Carol: mínimo 15s
  delay_max_ms: 45_000,
  cooloff_a_cada: 10,           // Regra da Carol: pausa a cada 10
  cooloff_duracao_ms: 60_000,   // Regra da Carol: 60s de pausa
  janela_horaria_inicio: 8,
  janela_horaria_fim: 20,
};

const LIMITE_DIARIO = 200; // Regra da Carol: máx 200 envios/24h

const VARIAVEIS_DISPONIVEIS = ['{{nome}}', '{{cidade}}', '{{estado}}', '{{ultimo_pedido}}', '{{valor_ltv}}'];

function uuid8() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

// ─── Compressor de imagem no client ──────────────────────────────────────────

async function comprimirImagem(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return Promise.resolve(file);
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const MAX = 1080;
      let { width, height } = img;
      if (width > MAX || height > MAX) {
        if (width > height) { height = Math.round(height * MAX / width); width = MAX; }
        else { width = Math.round(width * MAX / height); height = MAX; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => {
        if (!blob) return reject(new Error('Falha ao comprimir'));
        resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
      }, 'image/webp', 0.82);
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ─── Componente BlocoEditor ───────────────────────────────────────────────────

function BlocoEditor({
  bloco, onChange, onRemove, uploading, onUpload,
}: {
  bloco: Bloco;
  onChange: (b: Bloco) => void;
  onRemove: () => void;
  uploading: boolean;
  onUpload: (file: File, blocoId: string) => Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const set = (partial: Partial<Bloco['conteudo']>) =>
    onChange({ ...bloco, conteudo: { ...bloco.conteudo, ...partial } });

  const isMedia = bloco.tipo === 'imagem' || bloco.tipo === 'video' || bloco.tipo === 'audio';

  const acceptMap: Record<TipoBloco, string> = {
    imagem: 'image/jpeg,image/png,image/webp',
    video:  'video/mp4,video/webm',
    audio:  'audio/ogg,audio/mpeg,audio/mp4,audio/wav,audio/webm',
    texto:  '',
    cta:    '',
  };

  const metaMap = {
    imagem: { icon: <ImageIcon size={14} className="text-blue-500" />,  label: 'Imagem',    hint: 'Clique para enviar imagem (máx 5MB)'              },
    video:  { icon: <Video size={14} className="text-violet-500" />,    label: 'Vídeo',     hint: 'Clique para enviar vídeo MP4 (máx 50MB)'          },
    audio:  { icon: <Mic size={14} className="text-rose-500" />,        label: 'Áudio',     hint: 'Clique para enviar áudio OGG/MP3 (máx 10MB)'      },
    texto:  { icon: <Type size={14} className="text-green-600" />,      label: 'Texto',     hint: ''                                                 },
    cta:    { icon: <Link2 size={14} className="text-purple-600" />,    label: 'Botão CTA', hint: ''                                                 },
  };

  const meta = metaMap[bloco.tipo];

  return (
    <div className="border border-surface-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-txt-primary">
          <GripVertical size={14} className="text-txt-muted cursor-grab" />
          {meta.icon} {meta.label}
        </div>
        <button onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {/* ── Mídia (imagem / vídeo / áudio) ── */}
      {isMedia && (
        <div>
          {bloco.conteudo.url ? (
            <>
              <div className="relative group rounded-lg overflow-hidden bg-surface-50 border border-surface-200">
                {bloco.tipo === 'imagem' && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={bloco.conteudo.url} alt="criativo" className="w-full max-h-48 object-cover" />
                )}
                {bloco.tipo === 'video' && (
                  <video src={bloco.conteudo.url} controls className="w-full max-h-48" />
                )}
                {bloco.tipo === 'audio' && (
                  <div className="px-4 py-3">
                    <audio src={bloco.conteudo.url} controls className="w-full" />
                  </div>
                )}
                <button
                  onClick={() => set({ url: undefined, storage_path: undefined, kind: undefined, caption: undefined })}
                  className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {/* Campo de legenda para imagem e vídeo */}
              {(bloco.tipo === 'imagem' || bloco.tipo === 'video') && (
                <input
                  type="text"
                  value={bloco.conteudo.caption ?? ''}
                  onChange={e => set({ caption: e.target.value })}
                  placeholder="Adicione uma legenda... (opcional)"
                  className="w-full mt-2 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40 placeholder:text-txt-muted"
                />
              )}
            </>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-surface-300 rounded-xl py-8 flex flex-col items-center gap-2 text-txt-secondary hover:border-crm-primary hover:text-crm-primary transition-colors disabled:opacity-60"
            >
              {uploading
                ? <Loader2 size={20} className="animate-spin" />
                : bloco.tipo === 'audio' ? <Mic size={20} />
                : bloco.tipo === 'video' ? <Video size={20} />
                : <Upload size={20} />
              }
              <span className="text-sm">{uploading ? 'Enviando...' : meta.hint}</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept={acceptMap[bloco.tipo]}
            className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (file) await onUpload(file, bloco.id);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {bloco.tipo === 'texto' && (
        <div>
          <textarea
            value={bloco.conteudo.texto_raw ?? ''}
            onChange={e => set({ texto_raw: e.target.value })}
            rows={4}
            placeholder="Digite o texto da mensagem... Use {{nome}}, {{cidade}}, etc."
            className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
          />
          <div className="flex flex-wrap gap-1 mt-2">
            {VARIAVEIS_DISPONIVEIS.map(v => (
              <button
                key={v}
                onClick={() => set({ texto_raw: (bloco.conteudo.texto_raw ?? '') + v })}
                className="text-xs px-2 py-0.5 bg-crm-primary/10 text-crm-primary rounded-full hover:bg-crm-primary/20 transition-colors"
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      )}

      {bloco.tipo === 'cta' && (
        <div className="space-y-2">
          <Input
            placeholder="Texto do botão (ex: Ver oferta)"
            value={bloco.conteudo.texto_botao ?? ''}
            onChange={e => set({ texto_botao: e.target.value })}
          />
          <Input
            placeholder="URL de destino (https://...)"
            value={bloco.conteudo.url_destino ?? ''}
            onChange={e => set({ url_destino: e.target.value })}
          />
        </div>
      )}
    </div>
  );
}

// ─── ETA Calculator ───────────────────────────────────────────────────────────

function calcEta(totalContatos: number, config: AntibanConfig): string {
  const delayMedio = (config.delay_min_ms + config.delay_max_ms) / 2;
  const cooloffs = Math.floor(totalContatos / config.cooloff_a_cada);
  const ms = totalContatos * delayMedio + cooloffs * config.cooloff_duracao_ms;
  const min = Math.ceil(ms / 60_000);
  if (min < 60) return `~${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `~${h}h${m > 0 ? ` ${m}min` : ''}`;
}

// ─── Steps ────────────────────────────────────────────────────────────────────

const STEPS = ['Destinatários', 'Criativo', 'Agendamento', 'Confirmar'];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-0">
      {STEPS.map((label, i) => (
        <div key={i} className="flex items-center">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            i === current ? 'bg-crm-primary text-white' :
            i < current ? 'bg-green-100 text-green-700' : 'bg-surface-100 text-txt-muted'
          }`}>
            {i < current ? <Check size={12} /> : <span>{i + 1}</span>}
            {label}
          </div>
          {i < STEPS.length - 1 && (
            <div className={`w-8 h-0.5 ${i < current ? 'bg-green-400' : 'bg-surface-200'}`} />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Seletor de Segmento de Inteligência ──────────────────────────────────────

// Mapa simplificado dos segmentos RFM (label em PT e cor)
const SEGMENTOS_RFM: { nome: string; label: string; cor: string }[] = [
  { nome: 'Champions',         label: 'Campeões',         cor: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { nome: 'Loyal Customers',   label: 'Clientes Fiéis',   cor: 'bg-green-100 text-green-800 border-green-200'   },
  { nome: 'Potential Loyalist',label: 'Potencial Fiel',   cor: 'bg-blue-100 text-blue-800 border-blue-200'      },
  { nome: 'New Customers',     label: 'Novos Clientes',   cor: 'bg-cyan-100 text-cyan-800 border-cyan-200'      },
  { nome: 'Promising',         label: 'Promissores',      cor: 'bg-purple-100 text-purple-800 border-purple-200'},
  { nome: 'Need Attention',    label: 'Precisa Atenção',  cor: 'bg-orange-100 text-orange-800 border-orange-200'},
  { nome: 'About To Sleep',    label: 'Quase Dormindo',   cor: 'bg-red-100 text-red-700 border-red-200'         },
  { nome: 'At Risk',           label: 'Em Risco',         cor: 'bg-red-100 text-red-800 border-red-300'         },
  { nome: 'Cant Lose Them',    label: 'Não Posso Perder', cor: 'bg-red-200 text-red-900 border-red-400'         },
  { nome: 'Hibernating',       label: 'Hibernando',       cor: 'bg-gray-100 text-gray-700 border-gray-200'      },
  { nome: 'Lost',              label: 'Perdidos',         cor: 'bg-gray-200 text-gray-700 border-gray-300'      },
];

interface SeletorSegmentoInteligenciaProps {
  segmentoAtivo: string | null;
  totalContatos: number;
  carregando: boolean;
  onSelecionar: (segmento: { nome: string; label: string }) => void;
  distribuicao: Record<string, number>; // segmento → count
}

function SeletorSegmentoInteligencia({
  segmentoAtivo,
  totalContatos,
  carregando,
  onSelecionar,
  distribuicao,
}: SeletorSegmentoInteligenciaProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-txt-secondary">
        Selecione um segmento de Inteligência para carregar os contatos automaticamente:
      </p>

      <div className="grid grid-cols-1 gap-2 max-h-72 overflow-y-auto pr-1">
        {SEGMENTOS_RFM.map(seg => {
          const count = distribuicao[seg.nome] ?? 0;
          const ativo = segmentoAtivo === seg.nome;
          return (
            <button
              key={seg.nome}
              onClick={() => onSelecionar(seg)}
              disabled={count === 0}
              className={`flex items-center justify-between px-4 py-3 rounded-xl border-2 text-left transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                ativo
                  ? 'border-crm-primary bg-crm-primary/5'
                  : 'border-surface-200 hover:border-crm-primary/40 hover:bg-surface-50'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${ativo ? 'bg-crm-primary border-crm-primary' : 'border-surface-300'}`}>
                  {ativo && <Check size={10} className="text-white" />}
                </div>
                <div>
                  <p className={`text-sm font-medium ${ativo ? 'text-crm-primary' : 'text-txt-primary'}`}>{seg.label}</p>
                  <p className="text-xs text-txt-muted">{seg.nome}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${seg.cor}`}>
                  {count.toLocaleString('pt-BR')}
                </span>
                {ativo && carregando && <Loader2 size={13} className="animate-spin text-crm-primary" />}
                {ativo && !carregando && totalContatos > 0 && <ChevronRight size={13} className="text-crm-primary" />}
              </div>
            </button>
          );
        })}
      </div>

      {segmentoAtivo && !carregando && totalContatos > 0 && (
        <div className="flex items-center gap-2 p-3 bg-crm-primary/5 rounded-xl border border-crm-primary/20">
          <Zap size={14} className="text-crm-primary shrink-0" />
          <p className="text-sm text-crm-primary font-medium">
            {totalContatos.toLocaleString('pt-BR')} contatos carregados do segmento &ldquo;{SEGMENTOS_RFM.find(s => s.nome === segmentoAtivo)?.label}&rdquo;
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Seletor de Contatos Manual ───────────────────────────────────────────────

interface SeletorContatosManualProps {
  selecionados: Contato[];
  onToggle: (c: Contato) => void;
}

function SeletorContatosManual({ selecionados, onToggle }: SeletorContatosManualProps) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<Contato[]>([]);
  const [carregando, setCarregando] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIds = useMemo(() => new Set(selecionados.map(c => c.id)), [selecionados]);

  const pesquisar = useCallback((q: string) => {
    if (!q.trim()) { setResultados([]); return; }
    setCarregando(true);
    api.get<Record<string, unknown>>(`/api/v1/clients`, { q, limit: '20' })
      .then(({ data }) => {
        const lista = ((data as Record<string, unknown>)?.clients ?? (data as Record<string, unknown>)?.data ?? []) as Record<string, unknown>[];
        setResultados(lista.map(c => ({
          id: c.id as string,
          telefone: (c.phone ?? c.telefone) as string,
          nome: (c.name ?? c.nome) as string,
          cidade: c.cidade as string | undefined,
          estado: c.estado as string | undefined,
          valor_ltv: (c.ltv ?? c.valor_ltv) as number | undefined,
        })));
      })
      .catch(() => setResultados([]))
      .finally(() => setCarregando(false));
  }, []);

  const handleBusca = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setBusca(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => pesquisar(v), 300);
  };

  return (
    <div className="space-y-3">
      {/* Tags dos selecionados */}
      {selecionados.length > 0 && (
        <div className="flex flex-wrap gap-1.5 p-3 bg-surface-50 rounded-xl border border-surface-200">
          {selecionados.map(c => (
            <span
              key={c.id}
              className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-crm-primary/10 text-crm-primary rounded-full"
            >
              {c.nome || c.telefone}
              <button onClick={() => onToggle(c)} className="hover:bg-crm-primary/20 rounded-full p-0.5 transition-colors">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Input de busca */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
        <input
          type="text"
          value={busca}
          onChange={handleBusca}
          placeholder="Buscar por nome ou telefone..."
          className="w-full pl-8 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
        />
        {carregando && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-txt-muted" />}
      </div>

      {/* Resultados */}
      {resultados.length > 0 && (
        <div className="border border-surface-200 rounded-xl divide-y divide-surface-100 max-h-64 overflow-y-auto">
          {resultados.map(c => {
            const sel = selectedIds.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => onToggle(c)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-50 transition-colors ${sel ? 'bg-crm-primary/5' : ''}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-crm-primary border-crm-primary' : 'border-surface-300'}`}>
                  {sel && <Check size={10} className="text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-txt-primary truncate">{c.nome || '(sem nome)'}</p>
                  <p className="text-xs text-txt-muted">{c.telefone}</p>
                </div>
                {c.cidade && <span className="text-xs text-txt-muted shrink-0">{c.cidade}</span>}
              </button>
            );
          })}
        </div>
      )}

      {busca.trim() && !carregando && resultados.length === 0 && (
        <p className="text-xs text-txt-muted text-center py-2">Nenhum contato encontrado</p>
      )}

      <p className="text-xs text-txt-muted">
        {selecionados.length > 0
          ? `${selecionados.length} contato${selecionados.length > 1 ? 's' : ''} selecionado${selecionados.length > 1 ? 's' : ''}`
          : 'Busque e selecione os contatos desejados'}
      </p>
    </div>
  );
}

// ─── Seletor Toda a Base ──────────────────────────────────────────────────────

const STATUS_OPCOES = [
  { value: 'novo',    label: 'Novo',    cor: 'bg-blue-100 text-blue-800 border-blue-200'   },
  { value: 'ativo',   label: 'Ativo',   cor: 'bg-green-100 text-green-800 border-green-200' },
  { value: 'vip',     label: 'VIP',     cor: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { value: 'risco',   label: 'Em risco',cor: 'bg-red-100 text-red-800 border-red-200'      },
  { value: 'inativo', label: 'Inativo', cor: 'bg-gray-100 text-gray-700 border-gray-200'   },
];

interface ClienteBase {
  id: string;
  telefone: string;
  nome?: string;
  cidade?: string;
  estado?: string;
  total_orders: number;
}

interface SeletorTodaBaseProps {
  selecionados: Contato[];
  onSetSelecionados: (lista: Contato[]) => void;
}

function SeletorTodaBase({ selecionados, onSetSelecionados }: SeletorTodaBaseProps) {
  const [busca, setBusca] = useState('');
  const [statusFiltro, setStatusFiltro] = useState<string>('');
  const [pedidosFiltro, setPedidosFiltro] = useState<'todos' | 'com' | 'sem'>('todos');
  const [clientes, setClientes] = useState<ClienteBase[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [carregandoTodos, setCarregandoTodos] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIds = useMemo(() => new Set(selecionados.map(c => c.id)), [selecionados]);
  const LIMIT = 50;

  const buscarClientes = useCallback(async (pg: number, q: string, st: string, ped: string) => {
    setCarregando(true);
    try {
      const params: Record<string, string> = { page: String(pg), limit: String(LIMIT) };
      if (q.trim()) params.search = q.trim();
      if (st) params.status = st;
      if (ped === 'com') params.has_orders = 'true';
      if (ped === 'sem') params.has_orders = 'false';

      const qs = new URLSearchParams(params).toString();
      const resp = await fetch(`/api/v2/campanhas/clientes-base?${qs}`);
      const data = await resp.json() as { clients: ClienteBase[]; total: number; pages: number };
      setClientes(data.clients ?? []);
      setTotal(data.total ?? 0);
      setPages(data.pages ?? 1);
    } catch {
      setClientes([]);
    } finally {
      setCarregando(false);
    }
  }, []);

  // Busca inicial e ao mudar filtros
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setPage(1);
      buscarClientes(1, busca, statusFiltro, pedidosFiltro);
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [busca, statusFiltro, pedidosFiltro, buscarClientes]);

  // Paginação
  useEffect(() => {
    buscarClientes(page, busca, statusFiltro, pedidosFiltro);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page]);

  const toggleCliente = (c: ClienteBase) => {
    if (selectedIds.has(c.id)) {
      onSetSelecionados(selecionados.filter(s => s.id !== c.id));
    } else {
      onSetSelecionados([...selecionados, {
        id: c.id, telefone: c.telefone, nome: c.nome,
        cidade: c.cidade, estado: c.estado,
      }]);
    }
  };

  const selecionarTodaLista = async () => {
    setCarregandoTodos(true);
    try {
      const params: Record<string, string> = { page: '1', limit: '500' };
      if (busca.trim()) params.search = busca.trim();
      if (statusFiltro) params.status = statusFiltro;
      if (pedidosFiltro === 'com') params.has_orders = 'true';
      if (pedidosFiltro === 'sem') params.has_orders = 'false';

      const qs = new URLSearchParams(params).toString();
      const resp = await fetch(`/api/v2/campanhas/clientes-base?${qs}`);
      const data = await resp.json() as { clients: ClienteBase[] };
      const todos = data.clients ?? [];
      const novos = todos.filter(c => !selectedIds.has(c.id));
      onSetSelecionados([
        ...selecionados,
        ...novos.map(c => ({ id: c.id, telefone: c.telefone, nome: c.nome, cidade: c.cidade, estado: c.estado })),
      ]);
    } catch {
      // silencia
    } finally {
      setCarregandoTodos(false);
    }
  };

  const limparSelecao = () => onSetSelecionados([]);

  return (
    <div className="space-y-3">
      {/* ── Filtros ── */}
      <div className="p-3 bg-surface-50 rounded-xl border border-surface-200 space-y-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-txt-secondary">
          <Filter size={12} /> Filtros
        </div>

        {/* Busca */}
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por nome ou telefone..."
            className="w-full pl-8 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40 bg-white"
          />
        </div>

        {/* Status chips */}
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setStatusFiltro('')}
            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
              statusFiltro === ''
                ? 'bg-crm-primary text-white border-crm-primary'
                : 'bg-white text-txt-secondary border-surface-300 hover:border-crm-primary/40'
            }`}
          >
            Todos
          </button>
          {STATUS_OPCOES.map(s => (
            <button
              key={s.value}
              onClick={() => setStatusFiltro(statusFiltro === s.value ? '' : s.value)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-all ${
                statusFiltro === s.value ? s.cor + ' ring-2 ring-offset-1 ring-crm-primary/30' : 'bg-white text-txt-secondary border-surface-300 hover:border-crm-primary/40'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Pedidos */}
        <div className="flex gap-1.5">
          {([
            { value: 'todos', label: 'Com e sem pedidos' },
            { value: 'com',   label: '✅ Com pedidos'    },
            { value: 'sem',   label: '🆕 Sem pedidos'   },
          ] as const).map(opt => (
            <button
              key={opt.value}
              onClick={() => setPedidosFiltro(opt.value)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border font-medium transition-all flex-1 ${
                pedidosFiltro === opt.value
                  ? 'border-crm-primary bg-crm-primary/5 text-crm-primary'
                  : 'border-surface-200 bg-white text-txt-secondary hover:border-crm-primary/40'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Contador + ações ── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-sm text-txt-secondary">
          {carregando
            ? <><Loader2 size={13} className="animate-spin" /> Carregando...</>
            : <><Database size={13} /><span><strong className="text-txt-primary">{total.toLocaleString('pt-BR')}</strong> clientes no filtro</span></>
          }
        </div>
        <div className="flex items-center gap-2">
          {selecionados.length > 0 && (
            <button
              onClick={limparSelecao}
              className="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
            >
              Limpar ({selecionados.length})
            </button>
          )}
          <button
            onClick={selecionarTodaLista}
            disabled={carregandoTodos || total === 0}
            className="text-xs px-3 py-1.5 rounded-lg border border-crm-primary/30 text-crm-primary bg-crm-primary/5 hover:bg-crm-primary/10 transition-colors disabled:opacity-50 flex items-center gap-1"
          >
            {carregandoTodos
              ? <><Loader2 size={11} className="animate-spin" /> Carregando...</>
              : `Selecionar todos (até 500)`
            }
          </button>
        </div>
      </div>

      {/* ── Lista ── */}
      <div className="border border-surface-200 rounded-xl divide-y divide-surface-100 max-h-72 overflow-y-auto">
        {clientes.length === 0 && !carregando ? (
          <div className="py-8 text-center text-sm text-txt-muted">
            {busca || statusFiltro || pedidosFiltro !== 'todos'
              ? 'Nenhum cliente encontrado com esses filtros'
              : 'Nenhum cliente na base'
            }
          </div>
        ) : (
          clientes.map(c => {
            const sel = selectedIds.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCliente(c)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface-50 transition-colors ${sel ? 'bg-crm-primary/5' : ''}`}
              >
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-crm-primary border-crm-primary' : 'border-surface-300'}`}>
                  {sel && <Check size={10} className="text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-txt-primary truncate">{c.nome || '(sem nome)'}</p>
                  <p className="text-xs text-txt-muted">{c.telefone}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {c.cidade && <span className="text-xs text-txt-muted">{c.cidade}</span>}
                  {c.total_orders === 0
                    ? <span className="text-xs px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded-full border border-blue-100">Sem pedidos</span>
                    : <span className="text-xs px-1.5 py-0.5 bg-green-50 text-green-700 rounded-full border border-green-100">{c.total_orders} ped.</span>
                  }
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Paginação ── */}
      {pages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-1">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-50 transition-colors"
          >
            ← Anterior
          </button>
          <span className="text-xs text-txt-muted">
            {page} / {pages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pages, p + 1))}
            disabled={page === pages}
            className="text-xs px-3 py-1.5 rounded-lg border border-surface-200 disabled:opacity-40 hover:bg-surface-50 transition-colors"
          >
            Próxima →
          </button>
        </div>
      )}

      {/* ── Resumo selecionados ── */}
      <p className="text-xs text-txt-muted text-center">
        {selecionados.length > 0
          ? <span className="text-crm-primary font-medium">{selecionados.length.toLocaleString('pt-BR')} contato{selecionados.length > 1 ? 's' : ''} selecionado{selecionados.length > 1 ? 's' : ''}</span>
          : 'Selecione os clientes que receberão o disparo'
        }
      </p>
    </div>
  );
}

// ─── Seletor de Grupos WhatsApp ────────────────────────────────────────────────

interface SeletorGruposProps {
  selecionados: GrupoWA[];
  onToggle: (g: GrupoWA) => void;
}

function SeletorGrupos({ selecionados, onToggle }: SeletorGruposProps) {
  const [grupos, setGrupos] = useState<GrupoWA[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const [filtro, setFiltro] = useState('');
  const selectedIds = useMemo(() => new Set(selecionados.map(g => g.id)), [selecionados]);

  useEffect(() => {
    api.get<Record<string, unknown>>('/api/v2/whatsapp/grupos')
      .then(({ data }) => {
        setGrupos((data as Record<string, unknown>)?.grupos as GrupoWA[] ?? []);
        const aviso = (data as Record<string, unknown>)?.aviso;
        if (aviso) setAviso(aviso as string);
      })
      .catch(() => setErro('Erro ao buscar grupos'))
      .finally(() => setCarregando(false));
  }, []);

  const gruposFiltrados = useMemo(() =>
    filtro.trim()
      ? grupos.filter(g => g.nome.toLowerCase().includes(filtro.toLowerCase()))
      : grupos,
    [grupos, filtro]
  );

  if (carregando) return (
    <div className="flex items-center gap-2 text-sm text-txt-secondary py-4">
      <Loader2 size={14} className="animate-spin" /> Carregando grupos...
    </div>
  );

  if (erro) return (
    <div className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">{erro}</div>
  );

  if (aviso && grupos.length === 0) return (
    <div className="text-sm text-txt-secondary bg-amber-50 rounded-lg px-4 py-3 border border-amber-200">
      ⚠️ {aviso}
    </div>
  );

  if (grupos.length === 0) return (
    <p className="text-sm text-txt-secondary py-2">Nenhum grupo encontrado no WhatsApp conectado.</p>
  );

  return (
    <div className="space-y-3">
      {/* Filtro */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-txt-muted" />
        <input
          type="text"
          value={filtro}
          onChange={e => setFiltro(e.target.value)}
          placeholder="Filtrar grupos..."
          className="w-full pl-8 pr-4 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
        />
      </div>

      {/* Lista de grupos */}
      <div className="border border-surface-200 rounded-xl divide-y divide-surface-100 max-h-72 overflow-y-auto">
        {gruposFiltrados.map(g => {
          const sel = selectedIds.has(g.id);
          return (
            <button
              key={g.id}
              onClick={() => onToggle(g)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface-50 transition-colors ${sel ? 'bg-crm-primary/5' : ''}`}
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${sel ? 'bg-crm-primary border-crm-primary' : 'border-surface-300'}`}>
                {sel && <Check size={10} className="text-white" />}
              </div>
              <UsersRound size={15} className={`shrink-0 ${sel ? 'text-crm-primary' : 'text-txt-muted'}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-txt-primary truncate">{g.nome}</p>
                {g.participantes > 0 && (
                  <p className="text-xs text-txt-muted">{g.participantes} participante{g.participantes !== 1 ? 's' : ''}</p>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-txt-muted">
        {selecionados.length > 0
          ? `${selecionados.length} grupo${selecionados.length > 1 ? 's' : ''} selecionado${selecionados.length > 1 ? 's' : ''}`
          : `${grupos.length} grupo${grupos.length !== 1 ? 's' : ''} disponível${grupos.length !== 1 ? 'is' : ''}`}
      </p>
    </div>
  );
}

// ─── Page inner (precisa de useSearchParams) ──────────────────────────────────

function NovaCampanhaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const origemParam = searchParams.get('origem') ?? '';
  const grupoNomeParam = searchParams.get('grupo_nome') ?? '';
  const contatosIdsParam = searchParams.get('contatos_ids') ?? '';
  const totalParam = Number(searchParams.get('total') ?? '0');
  const filtroDescricao = searchParams.get('filtro_descricao') ?? '';
  const segmentoParam = searchParams.get('segmento') ?? '';

  const [step, setStep] = useState(0);
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [modoDestinatario, setModoDestinatario] = useState<ModoDestinatario>('inteligencia');
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [gruposSelecionados, setGruposSelecionados] = useState<GrupoWA[]>([]);
  const [carregandoContatos, setCarregandoContatos] = useState(false);
  const [segmentoRFM, setSegmentoRFM] = useState<string | null>(segmentoParam || null);
  const [distribuicaoRFM, setDistribuicaoRFM] = useState<Record<string, number>>({});
  const [carregandoDistribuicao, setCarregandoDistribuicao] = useState(false);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [antiban, setAntiban] = useState<AntibanConfig>(ANTIBAN_PADRAO);
  const [mostrarAntiban, setMostrarAntiban] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceTime, setRecurrenceTime] = useState('09:00');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [volumeCheck, setVolumeCheck] = useState<{
    enviados_hoje: number;
    limite_diario: number;
    restantes: number;
    risco: 'safe' | 'warning' | 'danger';
    percentual: number;
  } | null>(null);
  const [confirmaRisco, setConfirmaRisco] = useState(false);

  // ━━━ REGRA DA CAROL: Verificar volume diário ao abrir ━━━
  useEffect(() => {
    api.get<Record<string, unknown>>('/api/v2/campanhas/volume-check')
      .then(({ data }) => {
        if (data) setVolumeCheck(data as typeof volumeCheck);
      })
      .catch(() => {}); // Silencia se a RPC não existir ainda
  }, []);

  // Define modo inicial baseado na origem
  useEffect(() => {
    if (origemParam === 'inteligencia') setModoDestinatario('inteligencia');
  }, [origemParam]);

  // Carrega distribuição RFM ao entrar em modo inteligência
  useEffect(() => {
    if (modoDestinatario !== 'inteligencia') return;
    setCarregandoDistribuicao(true);
    api.get<Record<string, unknown>>('/api/intelligence/rfm')
      .then(({ data }) => {
        const dist: Record<string, number> = {};
        const distData = (data as Record<string, unknown>)?.distribution ?? {};
        for (const [k, v] of Object.entries(distData as Record<string, unknown>)) {
          dist[k] = typeof v === 'object' && v !== null
            ? ((v as Record<string, number>).count ?? 0)
            : Number(v);
        }
        setDistribuicaoRFM(dist);
      })
      .catch(() => {})
      .finally(() => setCarregandoDistribuicao(false));
  }, [modoDestinatario]);

  // Função para selecionar segmento e carregar contatos
  const selecionarSegmento = useCallback(async (seg: { nome: string; label: string }) => {
    if (segmentoRFM === seg.nome) {
      setSegmentoRFM(null);
      setContatos([]);
      return;
    }
    setSegmentoRFM(seg.nome);
    setContatos([]);
    setCarregandoContatos(true);
    try {
      const { data } = await api.get<Record<string, unknown>>(
        '/api/intelligence/rfm/clients',
        { segment: seg.nome, page: '1', limit: '500' }
      );
      const lista = ((data as Record<string, unknown>)?.clients ?? []) as Record<string, unknown>[];
      setContatos(lista.map(c => ({
        id: c.id as string,
        telefone: (c.phone ?? c.telefone) as string,
        nome: (c.name ?? c.nome) as string,
        cidade: c.cidade as string | undefined,
        estado: c.estado as string | undefined,
        valor_ltv: (c.total_spent ?? c.ltv ?? c.valor_ltv) as number | undefined,
      })));
    } catch {
      // silencia erro
    } finally {
      setCarregandoContatos(false);
    }
  }, [segmentoRFM]);

  // Pré-carrega contatos se veio da Inteligência via segmentoParam
  useEffect(() => {
    if (segmentoParam) {
      const seg = SEGMENTOS_RFM.find(s => s.nome === segmentoParam);
      if (seg) selecionarSegmento(seg);
    } else if (origemParam === 'inteligencia' && contatosIdsParam) {
      // Legado: veio com IDs de contatos na URL
      setCarregandoContatos(true);
      const ids = contatosIdsParam.split(',').filter(Boolean);
      api.get<Record<string, unknown>>(`/api/v1/clients`, { ids: ids.join(','), limit: '500' })
        .then(({ data }) => {
          setContatos((((data as Record<string, unknown>)?.clients ?? (data as Record<string, unknown>)?.data) as Record<string, unknown>[] ?? []).map((c) => ({
            id: c.id as string,
            telefone: (c.phone ?? c.telefone) as string,
            nome: (c.name ?? c.nome) as string,
            cidade: c.cidade as string,
            estado: c.estado as string,
            valor_ltv: (c.ltv ?? c.valor_ltv) as number,
          })));
        })
        .catch(() => {})
        .finally(() => setCarregandoContatos(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Callbacks de seleção ──────────────────────────────────────────────────

  const toggleContato = useCallback((c: Contato) => {
    setContatos(prev =>
      prev.some(x => x.id === c.id)
        ? prev.filter(x => x.id !== c.id)
        : [...prev, c]
    );
  }, []);

  const toggleGrupo = useCallback((g: GrupoWA) => {
    setGruposSelecionados(prev =>
      prev.some(x => x.id === g.id)
        ? prev.filter(x => x.id !== g.id)
        : [...prev, g]
    );
  }, []);

  // ─── Handlers de blocos ────────────────────────────────────────────────────

  const adicionarBloco = (tipo: TipoBloco) => {
    setBlocos(prev => [...prev, {
      id: uuid8(),
      ordem: prev.length + 1,
      tipo,
      conteudo: {},
    }]);
  };

  const atualizarBloco = (bloco: Bloco) =>
    setBlocos(prev => prev.map(b => b.id === bloco.id ? bloco : b));

  const removerBloco = (id: string) =>
    setBlocos(prev => prev.filter(b => b.id !== id).map((b, i) => ({ ...b, ordem: i + 1 })));

  const handleUpload = async (file: File, blocoId: string) => {
    setUploadingId(blocoId);
    try {
      const compressed = await comprimirImagem(file); // bypass automático para video/audio
      const form = new FormData();
      form.append('file', compressed);

      // Injetar token de auth (rota exige Authorization: Bearer)
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};

      const res = await fetch('/api/v2/upload/criativo', { method: 'POST', body: form, headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro no upload');
      setBlocos(prev => prev.map(b =>
        b.id === blocoId
          ? { ...b, conteudo: { ...b.conteudo, url: json.url, storage_path: json.path, kind: json.kind } }
          : b
      ));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro no upload');
    } finally {
      setUploadingId(null);
    }
  };

  // ─── Envio ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setErro('');
    setEnviando(true);
    try {
      const destinatarios = modoDestinatario === 'grupos'
        ? gruposSelecionados.map(g => ({ id: g.id, telefone: g.id, nome: g.nome }))
        : contatos;

      // Mapear modo UI → valor aceito pelo CHECK constraint do banco
      const tipoDestinatarioDB =
        modoDestinatario === 'grupos' ? 'grupos' : 'contatos';

      const { data: json, error } = await api.post<{ campanha_id: string; status: string }>('/api/v2/campanhas', {
        nome: nomeCampanha,
        blocos,
        destinatarios,
        scheduled_at: scheduledAt || undefined,
        config_antiban: antiban,
        origem: origemParam || modoDestinatario,  // preserva 'inteligencia'|'manual'|'grupos' no campo origem
        origem_grupo_nome: grupoNomeParam || undefined,
        tipo_destinatario: tipoDestinatarioDB,
        // Recorrência (apenas para grupos)
        ...(isRecurring && modoDestinatario === 'grupos' ? {
          is_recurring: true,
          recurrence_type: 'daily',
          recurrence_time: recurrenceTime,
          recurrence_active: true,
        } : {}),
      });
      if (error) throw new Error(error);

      const campanhaId = json!.campanha_id;

      // Se não for agendada, iniciar disparo imediatamente
      if (!scheduledAt) {
        const { error: errIniciar } = await api.post(`/api/v2/campanhas/${campanhaId}/iniciar`, {});
        if (errIniciar) {
          console.warn('[NOVA_CAMPANHA] Erro ao iniciar disparo:', errIniciar);
        }
      }

      // Redirecionar para a página de detalhe (onde o disparo é orquestrado)
      router.push(`/campanhas/${campanhaId}`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar campanha');
    } finally {
      setEnviando(false);
    }
  };

  // ─── Validações por step ───────────────────────────────────────────────────

  const totalContatos = modoDestinatario === 'grupos'
    ? gruposSelecionados.length
    : (contatos.length || totalParam);

  const podeProsseguir = (() => {
    if (step === 0) {
      if (!nomeCampanha.trim()) return false;
      if (modoDestinatario === 'grupos') return gruposSelecionados.length > 0;
      if (modoDestinatario === 'manual') return contatos.length > 0;
      if (modoDestinatario === 'toda_base') return contatos.length > 0;
      return contatos.length > 0 || totalParam > 0; // inteligencia
    }
    if (step === 1) return blocos.length > 0;
    return true;
  })();

  const eta = calcEta(
    modoDestinatario === 'grupos'
      ? gruposSelecionados.reduce((s, g) => s + (g.participantes || 1), 0)
      : (contatos.length || totalParam),
    antiban
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => router.back()} className="p-2 rounded-lg hover:bg-surface-100 text-txt-secondary transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-bold text-txt-primary">Nova Campanha</h1>
          {origemParam === 'inteligencia' && filtroDescricao && (
            <p className="text-xs text-crm-primary mt-0.5">✨ Segmento: {filtroDescricao}</p>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="overflow-x-auto pb-1">
        <StepIndicator current={step} />
      </div>

      {/* ── Step 0: Destinatários ── */}
      {step === 0 && (
        <div className="space-y-4">
          <Card>
            <div className="p-5 space-y-4">
              <h2 className="text-base font-semibold text-txt-primary">Informações básicas</h2>
              <div>
                <label className="text-sm text-txt-secondary mb-1 block">Nome da campanha *</label>
                <Input
                  placeholder="Ex: Reativação Julho 2025"
                  value={nomeCampanha}
                  onChange={e => setNomeCampanha(e.target.value)}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-5 space-y-4">
              <h2 className="text-base font-semibold text-txt-primary">Destinatários</h2>

              {/* Seletor de modo */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([
                  { modo: 'inteligencia' as ModoDestinatario, icon: <Zap size={15} />, label: 'Inteligência' },
                  { modo: 'toda_base' as ModoDestinatario, icon: <Database size={15} />, label: 'Toda a Base' },
                  { modo: 'manual' as ModoDestinatario, icon: <Users size={15} />, label: 'Manual' },
                  { modo: 'grupos' as ModoDestinatario, icon: <UsersRound size={15} />, label: 'Grupos WA' },
                ]).map(({ modo, icon, label }) => (
                  <button
                    key={modo}
                    onClick={() => setModoDestinatario(modo)}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      modoDestinatario === modo
                        ? 'border-crm-primary bg-crm-primary/5 text-crm-primary'
                        : 'border-surface-200 text-txt-secondary hover:border-crm-primary/40'
                    }`}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>

              {/* Modo: Inteligência */}
              {modoDestinatario === 'inteligencia' && (
                <>
                  {carregandoDistribuicao ? (
                    <div className="flex items-center gap-2 text-sm text-txt-secondary py-2">
                      <Loader2 size={14} className="animate-spin" /> Carregando segmentos...
                    </div>
                  ) : (
                    <SeletorSegmentoInteligencia
                      segmentoAtivo={segmentoRFM}
                      totalContatos={contatos.length}
                      carregando={carregandoContatos}
                      onSelecionar={selecionarSegmento}
                      distribuicao={distribuicaoRFM}
                    />
                  )}
                </>
              )}

              {/* Modo: Manual */}
              {modoDestinatario === 'manual' && (
                <SeletorContatosManual
                  selecionados={contatos}
                  onToggle={toggleContato}
                />
              )}

              {/* Modo: Toda a Base */}
              {modoDestinatario === 'toda_base' && (
                <SeletorTodaBase
                  selecionados={contatos}
                  onSetSelecionados={setContatos}
                />
              )}

              {/* Modo: Grupos */}
              {modoDestinatario === 'grupos' && (
                <SeletorGrupos
                  selecionados={gruposSelecionados}
                  onToggle={toggleGrupo}
                />
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Step 1: Criativo ── */}
      {step === 1 && (
        <div className="space-y-4">
          <Card>
            <div className="p-5 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h2 className="text-base font-semibold text-txt-primary">Blocos de conteúdo</h2>
                <div className="flex items-center flex-wrap gap-2">
                  {([
                    { tipo: 'imagem' as TipoBloco, icon: <ImageIcon size={12} />, label: 'Imagem' },
                    { tipo: 'video' as TipoBloco, icon: <Video size={12} />, label: 'Vídeo' },
                    { tipo: 'audio' as TipoBloco, icon: <Mic size={12} />, label: 'Áudio' },
                    { tipo: 'texto' as TipoBloco, icon: <Type size={12} />, label: 'Texto' },
                    { tipo: 'cta' as TipoBloco, icon: <Link2 size={12} />, label: 'CTA' },
                  ]).map(({ tipo, icon, label }) => (
                    <button
                      key={tipo}
                      onClick={() => adicionarBloco(tipo)}
                      className="text-xs px-3 py-1.5 border border-surface-300 rounded-lg flex items-center gap-1 hover:bg-surface-50 transition-colors"
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </div>

              {blocos.length === 0 && (
                <div className="text-center py-8 text-txt-secondary">
                  <Plus size={24} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Adicione blocos de conteúdo acima</p>
                </div>
              )}

              <div className="space-y-3">
                {blocos.map(b => (
                  <BlocoEditor
                    key={b.id}
                    bloco={b}
                    onChange={atualizarBloco}
                    onRemove={() => removerBloco(b.id)}
                    uploading={uploadingId === b.id}
                    onUpload={handleUpload}
                  />
                ))}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* ── Step 2: Agendamento + Anti-ban ── */}
      {step === 2 && (
        <div className="space-y-4">
          <Card>
            <div className="p-5 space-y-4">
              <h2 className="text-base font-semibold text-txt-primary">Agendamento</h2>
              <div>
                <label className="text-sm text-txt-secondary mb-1 flex items-center gap-1">
                  <Calendar size={13} /> Data e hora de início (deixe em branco para iniciar agora)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
                />
              </div>

              {/* ━━━ RECORRÊNCIA (apenas para grupos) ━━━ */}
              {modoDestinatario === 'grupos' && (
                <div className="mt-4 p-4 bg-surface-50 rounded-xl border border-surface-200 space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div className={`w-10 h-5 rounded-full relative transition-colors ${isRecurring ? 'bg-crm-primary' : 'bg-surface-300'}`}>
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${isRecurring ? 'left-5' : 'left-0.5'}`} />
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-txt-primary">Agendar Recorrência</span>
                      <p className="text-xs text-txt-muted">Disparar automaticamente todos os dias</p>
                    </div>
                  </label>

                  {isRecurring && (
                    <div className="space-y-3 pt-2">
                      <div>
                        <label className="text-xs text-txt-secondary mb-1 block">Horário diário</label>
                        <input
                          type="time"
                          value={recurrenceTime}
                          onChange={e => setRecurrenceTime(e.target.value)}
                          className="w-40 px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
                        />
                      </div>
                      <div className="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg border border-blue-200">
                        <Calendar size={13} className="text-blue-600 shrink-0" />
                        <p className="text-xs text-blue-700">
                          A mensagem será enviada todos os dias às <strong>{recurrenceTime}</strong> para os {gruposSelecionados.length} grupo(s) selecionado(s).
                          Você pode pausar ou cancelar a qualquer momento.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-5 space-y-3">
              <button
                onClick={() => setMostrarAntiban(!mostrarAntiban)}
                className="flex items-center justify-between w-full"
              >
                <div className="flex items-center gap-2">
                  <Zap size={16} className="text-crm-primary" />
                  <h2 className="text-base font-semibold text-txt-primary">Configurações Anti-ban</h2>
                </div>
                {mostrarAntiban ? <ChevronUp size={16} className="text-txt-muted" /> : <ChevronDown size={16} className="text-txt-muted" />}
              </button>

              <div className="text-xs text-txt-secondary bg-green-50 rounded-lg px-3 py-2">
                ✅ <strong>Regra da Carol</strong> ativa — mínimo 15s entre envios, pausa de 60s a cada 10 msgs, máx {LIMITE_DIARIO}/dia
              </div>

              {mostrarAntiban && (
                <div className="grid grid-cols-2 gap-4 pt-2">
                  {(
                    [
                      { label: 'Delay mín. (ms)',       key: 'delay_min_ms'           },
                      { label: 'Delay máx. (ms)',        key: 'delay_max_ms'           },
                      { label: 'Cooloff a cada N msgs',  key: 'cooloff_a_cada'         },
                      { label: 'Duração cooloff (ms)',   key: 'cooloff_duracao_ms'     },
                      { label: 'Janela início (hora)',   key: 'janela_horaria_inicio'  },
                      { label: 'Janela fim (hora)',      key: 'janela_horaria_fim'     },
                    ] as const satisfies readonly { label: string; key: keyof AntibanConfig }[]
                  ).map(({ label, key }) => {
                    // Regra da Carol: mínimos hardcoded
                    const MIN_MAP: Partial<Record<keyof AntibanConfig, number>> = {
                      delay_min_ms: 15_000,
                      delay_max_ms: 16_000,
                      cooloff_duracao_ms: 60_000,
                      janela_horaria_inicio: 8,
                    };
                    const MAX_MAP: Partial<Record<keyof AntibanConfig, number>> = {
                      cooloff_a_cada: 10,
                      janela_horaria_fim: 20,
                    };
                    return (
                    <div key={key}>
                      <label className="text-xs text-txt-secondary mb-1 block">{label}</label>
                      <input
                        type="number"
                        value={antiban[key]}
                        min={MIN_MAP[key]}
                        max={MAX_MAP[key]}
                        onChange={e => {
                          let val = Number(e.target.value);
                          if (MIN_MAP[key]) val = Math.max(val, MIN_MAP[key]!);
                          if (MAX_MAP[key]) val = Math.min(val, MAX_MAP[key]!);
                          setAntiban(prev => ({ ...prev, [key]: val }));
                        }}
                        className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
                      />
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* ── Step 3: Confirmação ── */}
      {step === 3 && (
        <Card>
          <div className="p-6 space-y-5">
            <h2 className="text-base font-semibold text-txt-primary">Resumo da campanha</h2>

            <div className="space-y-3">
              {[
                { label: 'Nome', value: nomeCampanha },
                {
                  label: 'Destinatários',
                  value: modoDestinatario === 'grupos'
                    ? `${gruposSelecionados.length} grupo${gruposSelecionados.length !== 1 ? 's' : ''} WhatsApp`
                    : `${totalContatos.toLocaleString('pt-BR')} contatos`,
                },
                { label: 'Blocos', value: `${blocos.length} (${blocos.map(b => b.tipo).join(', ')})` },
                { label: 'Agendamento', value: scheduledAt ? new Date(scheduledAt).toLocaleString('pt-BR') : 'Imediato' },
                { label: 'ETA estimado', value: eta },
                ...(modoDestinatario === 'grupos'
                  ? [{ label: 'Grupos', value: gruposSelecionados.map(g => g.nome).join(', ') }]
                  : modoDestinatario === 'inteligencia' && segmentoRFM
                    ? [{ label: 'Segmento', value: `${SEGMENTOS_RFM.find(s => s.nome === segmentoRFM)?.label ?? segmentoRFM} — ${filtroDescricao || segmentoRFM}` }]
                    : []
                ),
              ].map(({ label, value }) => (
                <div key={label} className="flex items-start justify-between py-2 border-b border-surface-100 last:border-0">
                  <span className="text-sm text-txt-secondary">{label}</span>
                  <span className="text-sm font-medium text-txt-primary text-right max-w-[60%]">{value}</span>
                </div>
              ))}
            </div>

            {erro && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
                <AlertCircle size={16} /> {erro}
              </div>
            )}

            {/* ━━━ REGRA DA CAROL: Alerta de risco de banimento ━━━ */}
            {volumeCheck && (
              <div className={`rounded-xl border p-4 space-y-2 ${
                volumeCheck.risco === 'danger'
                  ? 'bg-red-50 border-red-300'
                  : volumeCheck.risco === 'warning'
                    ? 'bg-amber-50 border-amber-300'
                    : 'bg-green-50 border-green-200'
              }`}>
                <div className="flex items-center gap-2">
                  <Zap size={14} className={
                    volumeCheck.risco === 'danger' ? 'text-red-600' :
                    volumeCheck.risco === 'warning' ? 'text-amber-600' : 'text-green-600'
                  } />
                  <span className={`text-sm font-semibold ${
                    volumeCheck.risco === 'danger' ? 'text-red-700' :
                    volumeCheck.risco === 'warning' ? 'text-amber-700' : 'text-green-700'
                  }`}>
                    Regra da Carol — Anti-Ban
                  </span>
                </div>
                <p className="text-xs text-gray-600">
                  Enviados hoje: <strong>{volumeCheck.enviados_hoje}</strong> / {volumeCheck.limite_diario} · 
                  Restantes: <strong>{volumeCheck.restantes}</strong>
                </p>
                <div className="w-full h-2 bg-white rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      volumeCheck.risco === 'danger' ? 'bg-red-500' :
                      volumeCheck.risco === 'warning' ? 'bg-amber-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, volumeCheck.percentual)}%` }}
                  />
                </div>

                {/* Alerta de risco + totalContatos > restantes */}
                {totalContatos > volumeCheck.restantes && (
                  <div className="mt-2 p-3 bg-red-100 rounded-lg border border-red-300">
                    <p className="text-xs font-bold text-red-800 mb-1">
                      ⚠️ RISCO DE BANIMENTO: Você quer enviar {totalContatos} mensagens mas só pode enviar mais {volumeCheck.restantes} hoje.
                    </p>
                    <p className="text-xs text-red-700 mb-2">
                      Enviar acima do limite de {LIMITE_DIARIO}/24h pode resultar em banimento do número pelo WhatsApp.
                    </p>
                    <label className="flex items-center gap-2 text-xs text-red-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={confirmaRisco}
                        onChange={e => setConfirmaRisco(e.target.checked)}
                        className="rounded border-red-400"
                      />
                      <span>Estou ciente do risco e desejo prosseguir mesmo assim</span>
                    </label>
                  </div>
                )}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* Navegação */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="ghost"
          onClick={() => step === 0 ? router.back() : setStep(s => s - 1)}
        >
          <ArrowLeft size={15} /> {step === 0 ? 'Voltar' : 'Anterior'}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button variant="primary" onClick={() => setStep(s => s + 1)} disabled={!podeProsseguir}>
            Próximo <ArrowRight size={15} />
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={enviando || !nomeCampanha.trim() || (
              volumeCheck != null && totalContatos > volumeCheck.restantes && !confirmaRisco
            )}
          >
            {enviando ? <><Loader2 size={15} className="animate-spin" /> Criando...</> : <><Send size={15} /> Criar Campanha</>}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Export com Suspense (useSearchParams exige) ──────────────────────────────

export default function NovaCampanhaPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="animate-spin text-crm-primary" />
      </div>
    }>
      <NovaCampanhaInner />
    </Suspense>
  );
}
