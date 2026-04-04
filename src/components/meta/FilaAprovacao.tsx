'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  CheckCircle, XCircle, Edit2, Play,
  Clock, Loader2, ChevronDown, ChevronUp,
  Users, MessageCircle, TrendingUp, Zap,
} from 'lucide-react';

interface AdCreative {
  nome: string;
  url_preview: string | null;
  classificacao: Record<string, unknown> | null;
}

interface DraftCampanha {
  id: string;
  nome: string;
  tipo: 'frio' | 'quente' | 'whatsapp';
  status: string;
  orcamento_diario: number;
  copy_headline: string | null;
  copy_texto: string | null;
  copy_cta: string | null;
  meta_campaign_id: string | null;
  criativo_id: string | null;
  criativo_url_preview: string | null;
  created_at: string;
  // Supabase pode retornar como array ou objeto dependendo da relação
  ad_creatives: AdCreative | AdCreative[] | null;
}

const TIPO_CONFIG = {
  frio:     { label: 'Público Frio',   icon: Users,         badgeClass: 'bg-blue-50 text-blue-700' },
  quente:   { label: 'Público Quente', icon: TrendingUp,    badgeClass: 'bg-orange-50 text-orange-700' },
  whatsapp: { label: 'WhatsApp',       icon: MessageCircle, badgeClass: 'bg-green-50 text-green-700' },
} as const;

export function FilaAprovacao() {
  const [drafts, setDrafts]           = useState<DraftCampanha[]>([]);
  const [loading, setLoading]         = useState(true);
  const [expandido, setExpandido]     = useState<string | null>(null);
  const [editando, setEditando]       = useState<string | null>(null);
  const [headline, setHeadline]       = useState('');
  const [bodyText, setBodyText]       = useState('');
  const [processando, setProcessando] = useState<string | null>(null);
  const [feedback, setFeedback]       = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  function authHeader(): HeadersInit {
    const token = useAuthStore.getState().accessToken;
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/meta/campanhas/fila', { headers: authHeader() });
      const data = await res.json() as DraftCampanha[];
      setDrafts(Array.isArray(data) ? data : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function agir(draftId: string, acao: 'aprovar' | 'rejeitar') {
    setProcessando(draftId);
    try {
      const res = await fetch('/api/meta/campanhas/aprovar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({
          draftId,
          acao,
          ...(editando === draftId && acao === 'aprovar'
            ? { novoHeadline: headline, novoBody: bodyText }
            : {}),
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };

      if (data.ok) {
        setFeedback({
          id: draftId,
          msg: acao === 'aprovar' ? '✅ Campanha ativada no Meta!' : '❌ Campanha rejeitada e arquivada',
          ok: acao === 'aprovar',
        });
        setTimeout(() => {
          setDrafts(prev => prev.filter(d => d.id !== draftId));
          setFeedback(null);
        }, 2000);
      } else {
        setFeedback({ id: draftId, msg: data.error ?? 'Erro ao processar', ok: false });
      }
    } finally {
      setProcessando(null);
      setEditando(null);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-12 text-gray-400 gap-2 text-sm">
      <Loader2 size={16} className="animate-spin" />
      Carregando fila...
    </div>
  );

  if (drafts.length === 0) return (
    <div className="text-center py-12">
      <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-3">
        <Zap size={20} className="text-gray-300" />
      </div>
      <p className="text-gray-500 text-sm font-medium">Nenhuma campanha aguardando aprovação</p>
      <p className="text-gray-400 text-xs mt-1">
        As campanhas criadas pelo agente aparecerão aqui para revisão
      </p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-amber-400 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-gray-700">
            {drafts.length} campanha{drafts.length > 1 ? 's' : ''} aguardando revisão
          </span>
        </div>
        <button onClick={carregar} className="text-xs text-gray-400 hover:text-gray-600">
          Atualizar
        </button>
      </div>

      {drafts.map(draft => {
        const cfg = TIPO_CONFIG[draft.tipo] ?? TIPO_CONFIG.frio;
        const Icon = cfg.icon;
        const isExpanded    = expandido === draft.id;
        const isEditando    = editando === draft.id;
        const isProcessando = processando === draft.id;
        const fb            = feedback?.id === draft.id ? feedback : null;

        const criativo = Array.isArray(draft.ad_creatives)
          ? draft.ad_creatives[0]
          : draft.ad_creatives;
        const thumbUrl = criativo?.url_preview ?? draft.criativo_url_preview;

        return (
          <div key={draft.id} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">

            {fb && (
              <div className={`px-4 py-2 text-sm font-medium ${
                fb.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}>
                {fb.msg}
              </div>
            )}

            <div className="p-4">
              <div className="flex items-start gap-3">

                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-xl bg-gray-100 overflow-hidden shrink-0">
                  {thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={criativo?.nome ?? draft.nome}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Icon size={20} className="text-gray-300" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900 text-sm truncate">{draft.nome}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cfg.badgeClass}`}>
                      {cfg.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                    <span>R${(draft.orcamento_diario / 100).toFixed(0)}/dia</span>
                    <span>·</span>
                    <span>{criativo?.nome ?? 'Criativo'}</span>
                    <span>·</span>
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      {new Date(draft.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  {draft.copy_headline && (
                    <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                      <p className="text-xs font-medium text-gray-700">{draft.copy_headline}</p>
                      {draft.copy_texto && (
                        <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{draft.copy_texto}</p>
                      )}
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setExpandido(isExpanded ? null : draft.id)}
                  className="shrink-0 p-1 text-gray-400 hover:text-gray-600"
                >
                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                </button>
              </div>

              {/* Expandido */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                  {isEditando ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-600">Editar copy:</p>
                      <input
                        type="text"
                        value={headline}
                        onChange={e => setHeadline(e.target.value)}
                        placeholder="Título do anúncio"
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30"
                      />
                      <textarea
                        value={bodyText}
                        onChange={e => setBodyText(e.target.value)}
                        placeholder="Texto principal do anúncio"
                        rows={3}
                        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 resize-none"
                      />
                      <button
                        onClick={() => setEditando(null)}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Cancelar edição
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditando(draft.id);
                        setHeadline(draft.copy_headline ?? '');
                        setBodyText(draft.copy_texto ?? '');
                      }}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                    >
                      <Edit2 size={12} />
                      Editar copy antes de aprovar
                    </button>
                  )}

                  {draft.criativo_id && thumbUrl && (
                    <div className="mt-3">
                      <p className="text-xs font-medium text-gray-500 mb-2">Criativo selecionado:</p>
                      <div className="relative rounded-xl overflow-hidden bg-gray-100 aspect-video max-w-xs">
                        <img
                          src={thumbUrl}
                          alt="Thumbnail do criativo"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow">
                            <Play size={14} className="text-gray-800 ml-0.5" fill="currentColor" />
                          </div>
                        </div>
                        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                          {criativo.nome}
                        </div>
                      </div>
                    </div>
                  )}

                  {draft.meta_campaign_id && (
                    <div className="text-xs text-gray-400 font-mono">
                      Campaign ID: {draft.meta_campaign_id}
                    </div>
                  )}
                </div>
              )}

              {/* Ações */}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => agir(draft.id, 'rejeitar')}
                  disabled={isProcessando}
                  className="flex items-center gap-1.5 px-3 py-2 border border-red-200 text-red-600 text-xs font-medium rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {isProcessando ? <Loader2 size={12} className="animate-spin" /> : <XCircle size={12} />}
                  Rejeitar
                </button>

                <button
                  onClick={() => agir(draft.id, 'aprovar')}
                  disabled={isProcessando}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-[#059669] text-white text-xs font-medium rounded-xl hover:bg-[#047857] disabled:opacity-50 transition-colors"
                >
                  {isProcessando
                    ? <Loader2 size={12} className="animate-spin" />
                    : <Play size={12} />
                  }
                  {isProcessando ? 'Ativando...' : 'Aprovar e ativar'}
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
