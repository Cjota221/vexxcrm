'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, Check, Upload, Trash2, GripVertical,
  Image as ImageIcon, Type, Link2, ChevronDown, ChevronUp,
  Plus, Calendar, Users, Zap, Send, Loader2, AlertCircle,
} from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

// ─── Tipos ────────────────────────────────────────────────────────────────────

type TipoBloco = 'imagem' | 'texto' | 'cta';

interface Bloco {
  id: string;
  ordem: number;
  tipo: TipoBloco;
  conteudo: {
    url?: string;
    storage_path?: string;
    texto_raw?: string;
    texto_botao?: string;
    url_destino?: string;
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
  delay_min_ms: 15_000,
  delay_max_ms: 45_000,
  cooloff_a_cada: 20,
  cooloff_duracao_ms: 120_000,
  janela_horaria_inicio: 8,
  janela_horaria_fim: 20,
};

const VARIAVEIS_DISPONIVEIS = ['{{nome}}', '{{cidade}}', '{{estado}}', '{{ultimo_pedido}}', '{{valor_ltv}}'];

function uuid8() {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

// ─── Compressor de imagem no client ──────────────────────────────────────────

async function comprimirImagem(file: File): Promise<File> {
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

  return (
    <div className="border border-surface-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-txt-primary">
          <GripVertical size={14} className="text-txt-muted cursor-grab" />
          {bloco.tipo === 'imagem' && <><ImageIcon size={14} className="text-blue-500" /> Imagem</>}
          {bloco.tipo === 'texto' && <><Type size={14} className="text-green-600" /> Texto</>}
          {bloco.tipo === 'cta' && <><Link2 size={14} className="text-purple-600" /> Botão CTA</>}
        </div>
        <button onClick={onRemove} className="p-1 rounded hover:bg-red-50 text-red-400 transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      {bloco.tipo === 'imagem' && (
        <div>
          {bloco.conteudo.url ? (
            <div className="relative group rounded-lg overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bloco.conteudo.url} alt="criativo" className="w-full max-h-48 object-cover" />
              <button
                onClick={() => set({ url: undefined, storage_path: undefined })}
                className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="w-full border-2 border-dashed border-surface-300 rounded-xl py-8 flex flex-col items-center gap-2 text-txt-secondary hover:border-crm-primary hover:text-crm-primary transition-colors"
            >
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              <span className="text-sm">{uploading ? 'Enviando...' : 'Clique para enviar imagem (máx 5MB)'}</span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={async e => {
              const file = e.target.files?.[0];
              if (file) await onUpload(file, bloco.id);
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

// ─── Page inner (precisa de useSearchParams) ──────────────────────────────────

function NovaCampanhaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const origemParam = searchParams.get('origem') ?? '';
  const grupoNomeParam = searchParams.get('grupo_nome') ?? '';
  const contatosIdsParam = searchParams.get('contatos_ids') ?? '';
  const totalParam = Number(searchParams.get('total') ?? '0');
  const filtroDescricao = searchParams.get('filtro_descricao') ?? '';

  const [step, setStep] = useState(0);
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [contatos, setContatos] = useState<Contato[]>([]);
  const [carregandoContatos, setCarregandoContatos] = useState(false);
  const [blocos, setBlocos] = useState<Bloco[]>([]);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [scheduledAt, setScheduledAt] = useState('');
  const [antiban, setAntiban] = useState<AntibanConfig>(ANTIBAN_PADRAO);
  const [mostrarAntiban, setMostrarAntiban] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  // Pré-carrega contatos se veio da Inteligência
  useEffect(() => {
    if (origemParam !== 'inteligencia' || !contatosIdsParam) return;
    setCarregandoContatos(true);
    const ids = contatosIdsParam.split(',').filter(Boolean);
    fetch(`/api/v1/clients?ids=${ids.join(',')}&limit=500`)
      .then(r => r.json())
      .then(json => {
        setContatos((json.clients ?? json.data ?? []).map((c: Record<string, unknown>) => ({
          id: c.id as string,
          telefone: c.phone as string || c.telefone as string,
          nome: c.name as string || c.nome as string,
          cidade: c.cidade as string,
          estado: c.estado as string,
          valor_ltv: c.ltv as number || c.valor_ltv as number,
        })));
      })
      .catch(() => {})
      .finally(() => setCarregandoContatos(false));
  }, [origemParam, contatosIdsParam]);

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
      const compressed = await comprimirImagem(file);
      const form = new FormData();
      form.append('file', compressed);
      const res = await fetch('/api/v2/upload/criativo', { method: 'POST', body: form });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro no upload');
      setBlocos(prev => prev.map(b =>
        b.id === blocoId
          ? { ...b, conteudo: { ...b.conteudo, url: json.url, storage_path: json.path } }
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
      const res = await fetch('/api/v2/campanhas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nome: nomeCampanha,
          blocos,
          destinatarios: contatos,
          scheduled_at: scheduledAt || undefined,
          config_antiban: antiban,
          origem: origemParam || undefined,
          origem_grupo_nome: grupoNomeParam || undefined,
          tipo_destinatario: origemParam === 'inteligencia' ? 'inteligencia' : 'manual',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro ao criar campanha');
      router.push(`/campanhas/${json.campanha_id}?criada=1`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao criar campanha');
    } finally {
      setEnviando(false);
    }
  };

  // ─── Validações por step ───────────────────────────────────────────────────

  const podeProsseguir = (() => {
    if (step === 0) return nomeCampanha.trim().length > 0 && (contatos.length > 0 || totalParam > 0);
    if (step === 1) return blocos.length > 0;
    return true;
  })();

  const totalContatos = contatos.length || totalParam;
  const eta = calcEta(totalContatos, antiban);

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
            <div className="p-5 space-y-3">
              <h2 className="text-base font-semibold text-txt-primary">Destinatários</h2>
              {carregandoContatos && (
                <div className="flex items-center gap-2 text-sm text-txt-secondary">
                  <Loader2 size={14} className="animate-spin" /> Carregando contatos...
                </div>
              )}
              {origemParam === 'inteligencia' && (
                <div className="flex items-center gap-3 p-3 bg-crm-primary/5 rounded-xl border border-crm-primary/20">
                  <Zap size={18} className="text-crm-primary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-crm-primary">Segmento de Inteligência</p>
                    <p className="text-xs text-txt-secondary">{filtroDescricao || `${totalContatos} contatos selecionados`}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-lg font-bold text-crm-primary">{totalContatos}</p>
                    <p className="text-xs text-txt-muted">contatos</p>
                  </div>
                </div>
              )}
              {contatos.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-txt-secondary">
                  <Users size={14} />
                  <span>{contatos.length.toLocaleString('pt-BR')} contatos carregados</span>
                </div>
              )}
              {origemParam !== 'inteligencia' && contatos.length === 0 && (
                <p className="text-sm text-txt-secondary">
                  Para selecionar contatos via segmentação, use a página de{' '}
                  <button
                    onClick={() => router.push('/intelligence')}
                    className="text-crm-primary underline hover:no-underline"
                  >
                    Inteligência
                  </button>
                  .
                </p>
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
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-txt-primary">Blocos de conteúdo</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => adicionarBloco('imagem')}
                    className="text-xs px-3 py-1.5 border border-surface-300 rounded-lg flex items-center gap-1 hover:bg-surface-50 transition-colors"
                  >
                    <ImageIcon size={12} /> Imagem
                  </button>
                  <button
                    onClick={() => adicionarBloco('texto')}
                    className="text-xs px-3 py-1.5 border border-surface-300 rounded-lg flex items-center gap-1 hover:bg-surface-50 transition-colors"
                  >
                    <Type size={12} /> Texto
                  </button>
                  <button
                    onClick={() => adicionarBloco('cta')}
                    className="text-xs px-3 py-1.5 border border-surface-300 rounded-lg flex items-center gap-1 hover:bg-surface-50 transition-colors"
                  >
                    <Link2 size={12} /> CTA
                  </button>
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
                <label className="text-sm text-txt-secondary mb-1 block flex items-center gap-1">
                  <Calendar size={13} /> Data e hora de início (deixe em branco para iniciar agora)
                </label>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={e => setScheduledAt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
                />
              </div>
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
                ✅ Padrões recomendados já aplicados — {antiban.delay_min_ms / 1000}–{antiban.delay_max_ms / 1000}s entre envios, cooloff a cada {antiban.cooloff_a_cada} msgs
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
                  ).map(({ label, key }) => (
                    <div key={key}>
                      <label className="text-xs text-txt-secondary mb-1 block">{label}</label>
                      <input
                        type="number"
                        value={antiban[key]}
                        onChange={e => setAntiban(prev => ({ ...prev, [key]: Number(e.target.value) }))}
                        className="w-full px-3 py-2 text-sm border border-surface-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
                      />
                    </div>
                  ))}
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
                { label: 'Destinatários', value: totalContatos.toLocaleString('pt-BR') },
                { label: 'Blocos', value: `${blocos.length} (${blocos.map(b => b.tipo).join(', ')})` },
                { label: 'Agendamento', value: scheduledAt ? new Date(scheduledAt).toLocaleString('pt-BR') : 'Imediato' },
                { label: 'ETA estimado', value: eta },
                ...(origemParam === 'inteligencia' ? [{ label: 'Origem', value: `Inteligência — ${filtroDescricao}` }] : []),
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
            disabled={enviando || !nomeCampanha.trim()}
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
