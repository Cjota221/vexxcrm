'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Share2, Image as ImageIcon, Video, FileText, BarChart2,
  MessageCircle, RefreshCw, Plus, Clock, CheckCircle, XCircle,
  AlertTriangle, ChevronDown, Loader2, Eye, Heart, Send,
  Instagram, Facebook, Settings2, CalendarDays, Zap,
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

type PostTipo = 'post' | 'reel' | 'story' | 'carrossel';
type PostStatus = 'rascunho' | 'agendado' | 'publicado' | 'falhou';
type Tab = 'feed' | 'agendar' | 'metricas' | 'instagram';

interface LocalPost {
  id: string;
  tipo: PostTipo;
  legenda: string;
  hashtags?: string;
  media_url?: string;
  status: PostStatus;
  agendado_para?: string;
  publicado_em?: string;
  created_at: string;
}

interface MetaPost {
  id: string;
  message?: string;
  story?: string;
  full_picture?: string;
  created_time: string;
  permalink_url?: string;
  likes?: { summary: { total_count: number } };
  comments?: { summary: { total_count: number } };
}

interface PageInsights {
  page_fans?: number;
  page_impressions?: number;
  page_impressions_unique?: number;
  page_post_engagements?: number;
  page_views_total?: number;
}

interface InstagramData {
  followers_count?: number;
  media_count?: number;
  username?: string;
  profile_picture_url?: string;
}

/* ─── Helpers ──────────────────────────────────────────────────────────────── */

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function n(v?: number) {
  return (v || 0).toLocaleString('pt-BR');
}

function statusBadge(status: PostStatus) {
  const map: Record<PostStatus, { label: string; cls: string; dot: string }> = {
    rascunho:  { label: 'Rascunho',  cls: 'bg-gray-100 text-gray-600',   dot: 'bg-gray-400' },
    agendado:  { label: 'Agendado',  cls: 'bg-blue-100 text-blue-700',   dot: 'bg-blue-500' },
    publicado: { label: 'Publicado', cls: 'bg-green-100 text-green-700', dot: 'bg-green-500' },
    falhou:    { label: 'Falhou',    cls: 'bg-red-100 text-red-700',     dot: 'bg-red-500' },
  };
  const { label, cls, dot } = map[status];
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold', cls)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', dot)} />
      {label}
    </span>
  );
}

function tipoIcon(tipo: PostTipo) {
  const map: Record<PostTipo, React.ReactNode> = {
    post:      <ImageIcon size={14} className="text-blue-500" />,
    reel:      <Video size={14} className="text-purple-500" />,
    story:     <Zap size={14} className="text-orange-500" />,
    carrossel: <Share2 size={14} className="text-green-500" />,
  };
  return map[tipo];
}

/* ─── Componente: Novo Post ─────────────────────────────────────────────────── */

function NovoPostForm({ onSaved }: { onSaved: () => void }) {
  const [tipo, setTipo] = useState<PostTipo>('post');
  const [legenda, setLegenda] = useState('');
  const [hashtags, setHashtags] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [agendarPara, setAgendarPara] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  const TIPOS: { value: PostTipo; label: string; icon: React.ReactNode }[] = [
    { value: 'post',      label: 'Post',      icon: <ImageIcon size={14} /> },
    { value: 'reel',      label: 'Reel',      icon: <Video size={14} /> },
    { value: 'story',     label: 'Story',     icon: <Zap size={14} /> },
    { value: 'carrossel', label: 'Carrossel', icon: <Share2 size={14} /> },
  ];

  async function handleSave(publicarAgora: boolean) {
    if (!legenda.trim()) return;
    setSaving(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/social/posts', {
        method: 'POST',
        body: JSON.stringify({
          tipo, legenda, hashtags, media_url: mediaUrl || undefined,
          agendado_para: agendarPara || undefined,
          publicar_agora: publicarAgora,
        }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setFeedback({ ok: true, msg: publicarAgora ? 'Publicado com sucesso!' : agendarPara ? 'Agendado com sucesso!' : 'Salvo como rascunho.' });
        setLegenda(''); setHashtags(''); setMediaUrl(''); setAgendarPara('');
        onSaved();
      } else {
        setFeedback({ ok: false, msg: json.error || 'Erro ao salvar' });
      }
    } catch (e) {
      setFeedback({ ok: false, msg: String(e) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
      <h3 className="font-bold text-gray-900 flex items-center gap-2">
        <Plus size={16} className="text-crm-primary" />
        Criar conteúdo
      </h3>

      {/* Tipo */}
      <div className="flex gap-2 flex-wrap">
        {TIPOS.map(({ value, label, icon }) => (
          <button
            key={value}
            onClick={() => setTipo(value)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium border transition-all',
              tipo === value
                ? 'bg-crm-primary text-white border-crm-primary'
                : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
            )}
          >
            {icon} {label}
          </button>
        ))}
      </div>

      {/* Legenda */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Legenda / Texto</label>
        <textarea
          rows={4}
          maxLength={2200}
          value={legenda}
          onChange={e => setLegenda(e.target.value)}
          placeholder="Escreva a legenda do post aqui... (o Cláudio pode ajudar!)"
          className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30 resize-none"
        />
        <div className="text-right text-xs text-gray-400 mt-0.5">{legenda.length}/2200</div>
      </div>

      {/* Hashtags */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block">Hashtags</label>
        <input
          type="text"
          value={hashtags}
          onChange={e => setHashtags(e.target.value)}
          placeholder="#rasteirinhas #moda #atacado #revenda #calçados"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
        />
      </div>

      {/* URL da mídia */}
      {(tipo === 'post' || tipo === 'carrossel') && (
        <div>
          <label className="text-xs font-medium text-gray-500 mb-1 block">URL da imagem (opcional)</label>
          <input
            type="url"
            value={mediaUrl}
            onChange={e => setMediaUrl(e.target.value)}
            placeholder="https://..."
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
          />
        </div>
      )}

      {tipo === 'reel' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl px-4 py-3 text-sm text-purple-800">
          <strong>Reels:</strong> o upload de vídeo é feito direto no Meta — cole aqui a URL pública do vídeo após subir.
        </div>
      )}

      {/* Agendar */}
      <div>
        <label className="text-xs font-medium text-gray-500 mb-1 block flex items-center gap-1">
          <CalendarDays size={12} /> Agendar para (opcional — deixe em branco para salvar como rascunho)
        </label>
        <input
          type="datetime-local"
          value={agendarPara}
          onChange={e => setAgendarPara(e.target.value)}
          className="border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
        />
      </div>

      {/* Feedback */}
      {feedback && (
        <div className={cn(
          'flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
          feedback.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        )}>
          {feedback.ok ? <CheckCircle size={15} /> : <XCircle size={15} />}
          {feedback.msg}
        </div>
      )}

      {/* Botões */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => handleSave(false)}
          disabled={saving || !legenda.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
          {agendarPara ? 'Agendar' : 'Salvar rascunho'}
        </button>
        <button
          onClick={() => handleSave(true)}
          disabled={saving || !legenda.trim()}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Publicar agora
        </button>
      </div>
    </div>
  );
}

/* ─── Componente: Card de post local ───────────────────────────────────────── */

function LocalPostCard({ post }: { post: LocalPost }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          {tipoIcon(post.tipo)}
          <span className="text-xs font-medium text-gray-500 capitalize">{post.tipo}</span>
        </div>
        {statusBadge(post.status)}
      </div>
      <p className="text-sm text-gray-800 line-clamp-2">{post.legenda}</p>
      {post.hashtags && (
        <p className="text-xs text-blue-500 mt-1 line-clamp-1">{post.hashtags}</p>
      )}
      <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
        {post.agendado_para && (
          <span className="flex items-center gap-1"><Clock size={11} /> {formatDate(post.agendado_para)}</span>
        )}
        {post.publicado_em && (
          <span className="flex items-center gap-1"><CheckCircle size={11} /> {formatDate(post.publicado_em)}</span>
        )}
        {!post.agendado_para && !post.publicado_em && (
          <span>{formatDate(post.created_at)}</span>
        )}
      </div>
    </div>
  );
}

/* ─── Componente: Card de post Meta ────────────────────────────────────────── */

function MetaPostCard({ post }: { post: MetaPost }) {
  const likes = post.likes?.summary?.total_count || 0;
  const comments = post.comments?.summary?.total_count || 0;
  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      {post.full_picture && (
        <img src={post.full_picture} alt="Post" className="w-full aspect-video object-cover" />
      )}
      <div className="p-4">
        <p className="text-sm text-gray-800 line-clamp-3">{post.message || post.story || '(sem legenda)'}</p>
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
          <span className="flex items-center gap-1"><Heart size={11} /> {n(likes)}</span>
          <span className="flex items-center gap-1"><MessageCircle size={11} /> {n(comments)}</span>
          <span className="ml-auto">{formatDate(post.created_time)}</span>
        </div>
        {post.permalink_url && (
          <a
            href={post.permalink_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-crm-primary mt-2 hover:underline"
          >
            <Eye size={11} /> Ver no Facebook
          </a>
        )}
      </div>
    </div>
  );
}

/* ─── Componente: Aba Métricas ─────────────────────────────────────────────── */

function MetricasTab() {
  const [data, setData] = useState<{ pageInsights: PageInsights; instagram: InstagramData } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/social/insights')
      .then(r => r.json())
      .then(d => setData(d as typeof data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Carregando métricas...</div>;

  const ins = data?.pageInsights || {};
  const ig = data?.instagram || {};

  return (
    <div className="space-y-6">
      {/* Página Facebook */}
      <div>
        <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
          <Facebook size={16} className="text-blue-600" /> Página Facebook — últimos 7 dias
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { label: 'Seguidores', value: n(ins.page_fans), sub: 'total acumulado' },
            { label: 'Impressões', value: n(ins.page_impressions), sub: 'exibições do período' },
            { label: 'Alcance único', value: n(ins.page_impressions_unique), sub: 'pessoas alcançadas' },
            { label: 'Engajamentos', value: n(ins.page_post_engagements), sub: 'curtidas + comentários' },
            { label: 'Visitas à página', value: n(ins.page_views_total), sub: 'visualizações de perfil' },
          ].map(({ label, value, sub }) => (
            <div key={label} className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-2xl font-bold text-gray-900">{value}</div>
              <div className="text-sm text-gray-600 mt-0.5">{label}</div>
              <div className="text-xs text-gray-400">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Instagram */}
      {ig.username ? (
        <div>
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Instagram size={16} className="text-pink-500" /> Instagram @{ig.username as string}
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-2xl font-bold text-gray-900">{n(ig.followers_count as number)}</div>
              <div className="text-sm text-gray-600 mt-0.5">Seguidores</div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 p-4">
              <div className="text-2xl font-bold text-gray-900">{n(ig.media_count as number)}</div>
              <div className="text-sm text-gray-600 mt-0.5">Posts publicados</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-4 text-sm text-pink-800">
          <strong>Instagram não vinculado</strong> — Configure a Conta Instagram Business na aba Configurações.
        </div>
      )}
    </div>
  );
}

/* ─── Componente: Instagram Direct placeholder ─────────────────────────────── */

function InstagramDirectTab() {
  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-900">2 permissões faltando para Instagram Direct</div>
            <div className="text-sm text-amber-700 mt-1">
              Para receber e responder DMs do Instagram via Anne, adicione estas permissões ao seu app Meta:
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              <span className="px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 text-xs font-mono font-semibold">instagram_basic</span>
              <span className="px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 text-xs font-mono font-semibold">instagram_manage_messages</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {[
          {
            perm: 'instagram_basic',
            label: 'Necessária para conectar conta Instagram',
            items: ['Ver perfil e informações básicas', 'Identificar quem mandou mensagem', 'Vincular conta ao app'],
          },
          {
            perm: 'instagram_manage_messages',
            label: 'Receber e enviar mensagens no Direct',
            items: ['Receber DMs do Instagram em tempo real', 'Responder Direct via API (Anne)', 'Webhook de mensagens Instagram'],
          },
        ].map(({ perm, label, items }) => (
          <div key={perm} className="bg-white rounded-xl border border-orange-200 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-mono font-semibold">{perm}</span>
              <span className="text-xs text-orange-600 font-medium">faltando</span>
            </div>
            <p className="text-sm text-gray-700 font-medium mb-2">{label}</p>
            <ul className="space-y-1">
              {items.map(item => (
                <li key={item} className="text-xs text-gray-500 flex items-start gap-1.5">
                  <span className="text-orange-400 mt-0.5">•</span> {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
        <strong>Como adicionar:</strong> Acesse{' '}
        <span className="font-mono text-xs bg-gray-200 px-1 rounded">developers.facebook.com</span>
        {' '}→ Seu App → Permissões e Recursos → busque{' '}
        <span className="font-mono text-xs bg-gray-200 px-1 rounded">instagram_manage_messages</span>
        {' '}e{' '}
        <span className="font-mono text-xs bg-gray-200 px-1 rounded">instagram_basic</span>
        {' '}→ Solicitar acesso.
      </div>
    </div>
  );
}

/* ─── Componente: Configurar Página ────────────────────────────────────────── */

function ConfigurarPagina({ onConfigured }: { onConfigured: () => void }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ pageName?: string; error?: string } | null>(null);

  async function handleDiscover() {
    setLoading(true);
    setResult(null);
    try {
      const res = await authFetch('/api/social/config', { method: 'POST' });
      const json = await res.json() as { ok?: boolean; pageName?: string; error?: string };
      setResult(json);
      if (json.ok) { setTimeout(onConfigured, 1500); }
    } catch (e) {
      setResult({ error: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <Settings2 size={20} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-blue-900">Conectar Página do Facebook</div>
          <div className="text-sm text-blue-700 mt-0.5">
            Clique para detectar automaticamente a página vinculada ao seu token Meta.
          </div>
          {result?.pageName && (
            <div className="text-sm text-green-700 mt-1 font-medium flex items-center gap-1">
              <CheckCircle size={13} /> Conectado: {result.pageName}
            </div>
          )}
          {result?.error && (
            <div className="text-sm text-red-700 mt-1">{result.error}</div>
          )}
        </div>
      </div>
      <button
        onClick={handleDiscover}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        Detectar página
      </button>
    </div>
  );
}

/* ─── Página Principal ─────────────────────────────────────────────────────── */

export default function SocialPage() {
  const [tab, setTab] = useState<Tab>('feed');
  const [connected, setConnected] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localPosts, setLocalPosts] = useState<LocalPost[]>([]);
  const [pagePosts, setPagePosts] = useState<MetaPost[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await authFetch('/api/social/posts');
      if (res.ok) {
        const json = await res.json() as {
          connected: boolean; pageId?: string;
          posts: LocalPost[]; pagePosts: MetaPost[];
        };
        setConnected(json.connected);
        setPageId(json.pageId || null);
        setLocalPosts(json.posts || []);
        setPagePosts(json.pagePosts || []);
      }
    } catch { /* silencioso */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'feed',       label: 'Feed',            icon: <ImageIcon size={14} /> },
    { key: 'agendar',    label: 'Criar / Agendar', icon: <Plus size={14} /> },
    { key: 'metricas',   label: 'Métricas',        icon: <BarChart2 size={14} /> },
    { key: 'instagram',  label: 'Instagram Direct', icon: <MessageCircle size={14} /> },
  ];

  const agendados = localPosts.filter(p => p.status === 'agendado');
  const rascunhos = localPosts.filter(p => p.status === 'rascunho');
  const publicados = localPosts.filter(p => p.status === 'publicado');

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Share2 size={22} className="text-crm-primary" />
                Social Mídia
              </h1>
              {connected && pageId && (
                <p className="text-sm text-gray-500 mt-0.5">
                  Página conectada · <span className="font-medium text-gray-700">{pageId}</span>
                </p>
              )}
              <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                {agendados.length > 0 && <span className="flex items-center gap-1"><Clock size={11} /> {agendados.length} agendado{agendados.length > 1 ? 's' : ''}</span>}
                {rascunhos.length > 0 && <span className="flex items-center gap-1"><FileText size={11} /> {rascunhos.length} rascunho{rascunhos.length > 1 ? 's' : ''}</span>}
                {publicados.length > 0 && <span className="flex items-center gap-1"><CheckCircle size={11} /> {publicados.length} publicado{publicados.length > 1 ? 's' : ''}</span>}
              </div>
            </div>
            <button
              onClick={loadData}
              disabled={refreshing}
              className="p-2 rounded-xl bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors disabled:opacity-50"
              title="Atualizar"
            >
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Configurar página se não conectado */}
        {!loading && !connected && (
          <ConfigurarPagina onConfigured={loadData} />
        )}

        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            {TABS.map(({ key, label, icon }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-4 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors',
                  tab === key
                    ? 'border-crm-primary text-crm-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                )}
              >
                {icon} {label}
                {key === 'instagram' && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs font-semibold">2</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-5">

            {/* ── FEED ── */}
            {tab === 'feed' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-gray-900">Posts publicados na sua página</h2>
                </div>

                {loading && (
                  <div className="text-center py-12 text-gray-400 text-sm flex items-center justify-center gap-2">
                    <Loader2 size={16} className="animate-spin" /> Carregando feed...
                  </div>
                )}

                {!loading && pagePosts.length === 0 && (
                  <div className="text-center py-12">
                    <ImageIcon size={40} className="text-gray-200 mx-auto mb-3" />
                    <p className="text-gray-500 text-sm">
                      {connected ? 'Nenhum post encontrado na página' : 'Conecte sua página para ver o feed'}
                    </p>
                  </div>
                )}

                {!loading && pagePosts.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pagePosts.map(post => (
                      <MetaPostCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── AGENDAR ── */}
            {tab === 'agendar' && (
              <div className="space-y-5">
                <NovoPostForm onSaved={loadData} />

                {localPosts.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Seus conteúdos</h3>
                    <div className="space-y-3">
                      {localPosts.map(post => (
                        <LocalPostCard key={post.id} post={post} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── MÉTRICAS ── */}
            {tab === 'metricas' && <MetricasTab />}

            {/* ── INSTAGRAM DIRECT ── */}
            {tab === 'instagram' && <InstagramDirectTab />}

          </div>
        </div>

        {/* Permissões disponíveis — informativo */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-4">
            <CheckCircle size={16} className="text-green-500" />
            O que você pode fazer com o token atual
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { perm: 'ads_read + ads_management', label: 'Ver e editar campanhas, métricas, ROAS, CPL, CTR', ok: true },
              { perm: 'pages_messaging', label: 'Receber e responder mensagens no Messenger (Anne)', ok: true },
              { perm: 'leads_retrieval', label: 'Capturar leads de formulários → Kanban automático', ok: true },
              { perm: 'publish_video', label: 'Subir vídeos para usar em Reels e anúncios', ok: true },
              { perm: 'pages_read_engagement', label: 'Ver curtidas, comentários, alcance dos posts', ok: true },
              { perm: 'instagram_manage_messages', label: 'Instagram Direct (DMs) — falta adicionar ao app', ok: false },
            ].map(({ perm, label, ok }) => (
              <div key={perm} className={cn('rounded-xl p-3 border', ok ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50')}>
                <div className="flex items-center gap-1.5 mb-1">
                  {ok
                    ? <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
                    : <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" />}
                  <span className="text-xs font-mono font-semibold text-gray-700">{perm}</span>
                </div>
                <p className="text-xs text-gray-600">{label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
