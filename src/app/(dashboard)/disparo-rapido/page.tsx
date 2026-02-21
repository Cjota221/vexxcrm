'use client';

/**
 * Disparo Rápido — tela única para criar e disparar campanhas sem wizard.
 *
 * Fluxo:
 *  1. Escolher público  (cards de atalho + filtros simples)
 *  2. Escrever mensagem (texto + variáveis)
 *  3. Confirmar preview → Disparar
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Zap, Users, UserCheck, UserX, MapPin, ShoppingBag, Globe,
  MessageSquare, Send, Loader2, AlertCircle, CheckCircle2,
  ChevronDown, RefreshCw, ArrowRight, Sparkles,
} from 'lucide-react';
import { api } from '@/lib/api';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { VariablePicker, BASIC_VARIABLES } from '@/components/ui/VariablePicker';

/* ────────────────────────────────────────────────────────────── tipos */

interface PublicoConfig {
  has_orders?: boolean;       // undefined = todos, true = com pedidos, false = sem pedidos
  has_name?: boolean;         // undefined = todos, true = com nome, false = sem nome
  source?: string;            // '' = todos
  address_state?: string;     // '' = todos
}

interface ContatoPreview {
  id: string;
  phone: string;
  name?: string;
  address_state?: string;
}

interface CountResult {
  total: number;
  contatos: ContatoPreview[];
}

/* ────────────────────────────────────────────────────────────── atalhos rápidos */

const ATALHOS = [
  {
    id: 'toda_base',
    label: 'Toda a base',
    desc: 'Todos os contatos cadastrados',
    icon: <Globe size={20} className="text-crm-primary" />,
    bg: 'bg-blue-50 border-blue-100',
    config: {} as PublicoConfig,
  },
  {
    id: 'com_nome',
    label: 'Com nome',
    desc: 'Apenas quem tem nome cadastrado',
    icon: <UserCheck size={20} className="text-green-600" />,
    bg: 'bg-green-50 border-green-100',
    config: { has_name: true } as PublicoConfig,
  },
  {
    id: 'sem_pedidos',
    label: 'Sem pedidos',
    desc: 'Contatos que nunca compraram',
    icon: <ShoppingBag size={20} className="text-orange-500" />,
    bg: 'bg-orange-50 border-orange-100',
    config: { has_orders: false } as PublicoConfig,
  },
  {
    id: 'sem_nome_sem_pedido',
    label: 'Sem nome + sem pedidos',
    desc: 'Contatos para qualificar',
    icon: <UserX size={20} className="text-red-500" />,
    bg: 'bg-red-50 border-red-100',
    config: { has_name: false, has_orders: false } as PublicoConfig,
  },
  {
    id: 'com_pedidos',
    label: 'Já compraram',
    desc: 'Clientes com ao menos 1 pedido',
    icon: <CheckCircle2 size={20} className="text-emerald-600" />,
    bg: 'bg-emerald-50 border-emerald-100',
    config: { has_orders: true } as PublicoConfig,
  },
];

const ESTADOS_BR = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA',
  'MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN',
  'RO','RR','RS','SC','SE','SP','TO',
];

/* ────────────────────────────────────────────────────────────── componente */

export default function DisparoRapidoPage() {
  const router = useRouter();

  /* ── Passo atual ──────────────────────────── */
  const [passo, setPasso] = useState<1 | 2 | 3>(1);

  /* ── Público ─────────────────────────────── */
  const [atalhoSelecionado, setAtalhoSelecionado] = useState<string | null>(null);
  const [publico, setPublico] = useState<PublicoConfig>({});
  const [estado, setEstado] = useState('');
  const [contagem, setContagem] = useState<CountResult | null>(null);
  const [loadingCount, setLoadingCount] = useState(false);

  /* ── Mensagem ────────────────────────────── */
  const [mensagem, setMensagem] = useState('');
  const msgRef = useRef<HTMLTextAreaElement>(null);

  /* ── Disparo ─────────────────────────────── */
  const [nomeCampanha, setNomeCampanha] = useState('');
  const [disparando, setDisparando] = useState(false);
  const [resultado, setResultado] = useState<{ campanha_id: string; total_jobs: number; eta_minutes: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  /* ── Contar contatos ─────────────────────── */
  const contarContatos = useCallback(async (cfg: PublicoConfig, uf: string) => {
    setLoadingCount(true);
    setContagem(null);
    try {
      const params: Record<string, string> = { per_page: '5', page: '1' };
      if (cfg.has_orders !== undefined) params.has_orders = String(cfg.has_orders);
      if (cfg.has_name !== undefined) params.has_name = String(cfg.has_name);
      if (cfg.source) params.source = cfg.source;
      if (uf) params.address_state = uf;

      const res = await api.get<{ data: ContatoPreview[]; total: number }>('/api/clients', params);
      if (res.error) throw new Error(res.error);
      const raw = res.data as any;
      setContagem({ total: raw.total ?? 0, contatos: raw.data ?? [] });
    } catch {
      setContagem({ total: 0, contatos: [] });
    } finally {
      setLoadingCount(false);
    }
  }, []);

  /* re-count quando público muda */
  useEffect(() => {
    contarContatos(publico, estado);
  }, [publico, estado, contarContatos]);

  const selecionarAtalho = (atalho: typeof ATALHOS[0]) => {
    setAtalhoSelecionado(atalho.id);
    setPublico(atalho.config);
    setEstado('');
  };

  /* ── Disparar ────────────────────────────── */
  const handleDisparar = async () => {
    if (!mensagem.trim() || !contagem || contagem.total === 0) return;
    setDisparando(true);
    setErro(null);

    try {
      // Buscar todos os contatos (sem paginação, limite 2000)
      const params: Record<string, string> = { per_page: '2000', page: '1' };
      if (publico.has_orders !== undefined) params.has_orders = String(publico.has_orders);
      if (publico.has_name !== undefined) params.has_name = String(publico.has_name);
      if (publico.source) params.source = publico.source;
      if (estado) params.address_state = estado;

      const res = await api.get<{ data: ContatoPreview[]; total: number }>('/api/clients', params);
      if (res.error) throw new Error(res.error);
      const todosContatos = (res.data as any).data as ContatoPreview[];

      const destinatarios = todosContatos
        .filter(c => c.phone)
        .map(c => ({
          id: c.id,
          telefone: c.phone,
          nome: c.name || '',
          cidade: '',
          estado: c.address_state || '',
        }));

      if (destinatarios.length === 0) throw new Error('Nenhum contato com telefone encontrado');

      const nome = nomeCampanha.trim() ||
        `Disparo Rápido ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`;

      const payload = {
        nome,
        blocos: [{ id: crypto.randomUUID().slice(0, 8), ordem: 0, tipo: 'texto', conteudo: { texto_raw: mensagem.trim() } }],
        destinatarios,
        tipo_destinatario: 'contatos',
        config_antiban: {
          delay_min_ms: 15000,
          delay_max_ms: 45000,
          cooloff_a_cada: 10,
          cooloff_duracao_ms: 60000,
        },
      };

      const resp = await api.post<{ campanha_id: string; total_jobs: number; eta_minutes: number }>(
        '/api/v2/campanhas', payload
      );
      if (resp.error) throw new Error(resp.error);

      // Iniciar campanha automaticamente
      await api.post(`/api/v2/campanhas/${(resp.data as any).campanha_id}/iniciar`, {});

      setResultado(resp.data as any);
      setPasso(3);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao disparar');
    } finally {
      setDisparando(false);
    }
  };

  /* ────────────────────────────────────────── render */
  return (
    <div className="space-y-6 max-w-3xl mx-auto">

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-crm-primary/10 flex items-center justify-center">
          <Zap size={20} className="text-crm-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-txt-primary">Disparo Rápido</h1>
          <p className="text-sm text-txt-secondary">Escolha o público, escreva a mensagem e dispare — sem complicação.</p>
        </div>
      </div>

      {/* ── PASSO 3: Resultado ─────────────────────── */}
      {passo === 3 && resultado && (
        <Card>
          <div className="p-8 text-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-green-600" />
            </div>
            <h2 className="text-xl font-bold text-txt-primary">Disparo iniciado! 🚀</h2>
            <p className="text-txt-secondary">
              <span className="font-bold text-txt-primary">{resultado.total_jobs}</span> mensagens enfileiradas.<br />
              Tempo estimado: <span className="font-bold text-txt-primary">~{resultado.eta_minutes} min</span>
            </p>
            <p className="text-xs text-txt-secondary bg-amber-50 border border-amber-100 rounded-xl px-4 py-2 inline-block">
              ⏱ Pausas anti-ban ativas: 15–45s entre mensagens, pausa de 60s a cada 10 envios
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <Button
                variant="ghost"
                onClick={() => router.push(`/campanhas/${resultado.campanha_id}`)}
              >
                Ver progresso
              </Button>
              <Button
                onClick={() => { setPasso(1); setResultado(null); setMensagem(''); setAtalhoSelecionado(null); setPublico({}); setEstado(''); setNomeCampanha(''); }}
              >
                <Zap size={16} /> Novo disparo
              </Button>
            </div>
          </div>
        </Card>
      )}

      {passo !== 3 && (
        <>
          {/* ── PASSO 1: Público ──────────────────────── */}
          <Card>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-crm-primary text-white text-xs font-bold flex items-center justify-center">1</span>
                <h2 className="font-semibold text-txt-primary">Quem vai receber?</h2>
                {contagem && !loadingCount && (
                  <span className="ml-auto text-sm font-bold text-crm-primary bg-crm-primary/10 px-3 py-1 rounded-full">
                    {contagem.total.toLocaleString('pt-BR')} contatos
                  </span>
                )}
                {loadingCount && <Loader2 size={14} className="ml-auto animate-spin text-txt-secondary" />}
              </div>

              {/* Atalhos */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {ATALHOS.map(a => (
                  <button
                    key={a.id}
                    onClick={() => selecionarAtalho(a)}
                    className={`text-left p-3 rounded-xl border transition-all ${
                      atalhoSelecionado === a.id
                        ? 'ring-2 ring-crm-primary border-crm-primary bg-crm-primary/5'
                        : `${a.bg} hover:opacity-80`
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      {a.icon}
                      <span className="text-xs font-bold text-txt-primary">{a.label}</span>
                    </div>
                    <p className="text-[10px] text-txt-secondary leading-tight">{a.desc}</p>
                  </button>
                ))}
              </div>

              {/* Filtro por estado */}
              <div className="flex items-center gap-3 pt-1 border-t border-surface-100">
                <MapPin size={14} className="text-txt-secondary shrink-0" />
                <span className="text-xs text-txt-secondary">Filtrar por estado (opcional):</span>
                <select
                  value={estado}
                  onChange={e => setEstado(e.target.value)}
                  className="input text-sm py-1.5 px-3 flex-1 max-w-35"
                >
                  <option value="">Todos</option>
                  {ESTADOS_BR.map(uf => (
                    <option key={uf} value={uf}>{uf}</option>
                  ))}
                </select>
                <button
                  onClick={() => contarContatos(publico, estado)}
                  className="flex items-center gap-1 text-xs text-crm-primary hover:underline"
                >
                  <RefreshCw size={12} /> Atualizar
                </button>
              </div>

              {/* Preview dos primeiros contatos */}
              {contagem && contagem.contatos.length > 0 && (
                <div className="space-y-1 pt-1">
                  <p className="text-[10px] text-txt-secondary font-medium uppercase tracking-wider">Preview dos primeiros:</p>
                  <div className="flex flex-wrap gap-2">
                    {contagem.contatos.map(c => (
                      <span key={c.id} className="text-[10px] bg-surface-100 px-2 py-0.5 rounded-lg text-txt-secondary">
                        {c.name || c.phone}
                      </span>
                    ))}
                    {contagem.total > 5 && (
                      <span className="text-[10px] text-txt-secondary px-2 py-0.5">
                        +{(contagem.total - 5).toLocaleString('pt-BR')} mais...
                      </span>
                    )}
                  </div>
                </div>
              )}

              {contagem?.total === 0 && !loadingCount && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700">Nenhum contato encontrado com esses filtros.</p>
                </div>
              )}
            </div>
          </Card>

          {/* ── PASSO 2: Mensagem ─────────────────────── */}
          <Card>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-crm-primary text-white text-xs font-bold flex items-center justify-center">2</span>
                <h2 className="font-semibold text-txt-primary">Qual é a mensagem?</h2>
              </div>

              {/* Sugestões rápidas */}
              <div className="flex flex-wrap gap-2">
                {[
                  { label: '📦 Promoção de estoque', texto: 'Olá, {{nome}}! 👋 Temos uma novidade imperdível no estoque. Quer saber mais?' },
                  { label: '🏙️ Oferta regional', texto: 'Oi, {{nome}}! Tem uma oferta especial para clientes de {{estado}} hoje. Posso te contar mais?' },
                  { label: '🔁 Reativação', texto: 'Olá, {{nome}}! Faz um tempo que a gente não se fala. Tem uma condição especial esperando por você. Quer ver?' },
                  { label: '🎁 Cupom exclusivo', texto: 'Oi, {{nome}}! Separei um cupom exclusivo para você. Posso enviar?' },
                ].map(s => (
                  <button
                    key={s.label}
                    onClick={() => setMensagem(s.texto)}
                    className="text-xs bg-surface-100 hover:bg-surface-200 px-3 py-1.5 rounded-lg text-txt-secondary transition-colors flex items-center gap-1"
                  >
                    <Sparkles size={10} /> {s.label}
                  </button>
                ))}
              </div>

              <textarea
                ref={msgRef}
                rows={5}
                placeholder="Digite sua mensagem aqui... Use {{nome}}, {{estado}}, {{cidade}} para personalizar."
                className="w-full text-sm border border-surface-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-crm-primary/20 placeholder:text-txt-secondary/50"
                value={mensagem}
                onChange={e => setMensagem(e.target.value)}
              />
              <VariablePicker
                textareaRef={msgRef}
                value={mensagem}
                onChange={setMensagem}
                variables={BASIC_VARIABLES}
              />

              <div className="flex items-center justify-between text-xs text-txt-secondary">
                <span>{mensagem.length} caracteres</span>
                {mensagem.includes('{{nome}}') && (
                  <span className="text-green-600 font-medium">✓ Personalização com nome ativa</span>
                )}
              </div>
            </div>
          </Card>

          {/* ── CONFIRMAR E DISPARAR ─────────────────── */}
          <Card>
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-crm-primary text-white text-xs font-bold flex items-center justify-center">3</span>
                <h2 className="font-semibold text-txt-primary">Confirmar e disparar</h2>
              </div>

              {/* Nome da campanha (opcional) */}
              <div>
                <label className="text-xs text-txt-secondary block mb-1">Nome da campanha (opcional)</label>
                <input
                  type="text"
                  placeholder="Ex: Promoção SP fevereiro"
                  value={nomeCampanha}
                  onChange={e => setNomeCampanha(e.target.value)}
                  className="w-full text-sm border border-surface-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/20"
                />
              </div>

              {/* Resumo */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-surface-50 rounded-xl p-3 text-center border border-surface-100">
                  <Users size={16} className="text-crm-primary mx-auto mb-1" />
                  <p className="text-lg font-bold text-txt-primary">
                    {loadingCount ? '...' : (contagem?.total ?? 0).toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] text-txt-secondary">contatos</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center border border-surface-100">
                  <MessageSquare size={16} className="text-green-600 mx-auto mb-1" />
                  <p className="text-lg font-bold text-txt-primary">{mensagem.length > 0 ? '1' : '0'}</p>
                  <p className="text-[10px] text-txt-secondary">bloco de texto</p>
                </div>
                <div className="bg-surface-50 rounded-xl p-3 text-center border border-surface-100">
                  <Zap size={16} className="text-amber-500 mx-auto mb-1" />
                  <p className="text-lg font-bold text-txt-primary">
                    {contagem ? `~${Math.ceil(contagem.total * 30 / 60)} min` : '—'}
                  </p>
                  <p className="text-[10px] text-txt-secondary">tempo estimado</p>
                </div>
              </div>

              {/* Anti-ban info */}
              <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <AlertCircle size={14} className="text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">
                  <strong>Anti-ban ativo:</strong> 15–45s entre mensagens · pausa de 60s a cada 10 envios · máx 200 contatos/dia recomendado.
                </p>
              </div>

              {erro && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                  <AlertCircle size={14} className="text-red-500 shrink-0" />
                  <p className="text-sm text-red-700">{erro}</p>
                </div>
              )}

              <button
                onClick={handleDisparar}
                disabled={
                  disparando ||
                  !mensagem.trim() ||
                  !contagem ||
                  contagem.total === 0 ||
                  loadingCount
                }
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-crm-primary text-white font-semibold text-sm hover:bg-crm-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {disparando
                  ? <><Loader2 size={16} className="animate-spin" /> Criando disparo...</>
                  : <><Send size={16} /> Disparar agora para {(contagem?.total ?? 0).toLocaleString('pt-BR')} contatos <ArrowRight size={16} /></>
                }
              </button>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
