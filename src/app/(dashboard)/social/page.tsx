'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '@/store/auth';
import {
  Share2, Image as ImageIcon, Video, FileText, BarChart2,
  MessageCircle, RefreshCw, Plus, Clock, CheckCircle, XCircle,
  AlertTriangle, ChevronDown, Loader2, Eye, Heart, Send,
  Instagram, Facebook, Settings2, CalendarDays, Zap, X,
  Upload, Play, Megaphone, Building2, Globe, Phone, Edit2,
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
type Tab = 'feed' | 'agendar' | 'metricas' | 'instagram' | 'videos' | 'configuracoes';

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

interface MetaVideo {
  id: string;
  title?: string;
  description?: string;
  length?: number;
  created_time?: string;
  thumbnails?: { data: Array<{ uri: string; width: number; height: number }> };
}

interface PageSettings {
  id?: string;
  name?: string;
  about?: string;
  description?: string;
  website?: string;
  phone?: string;
  emails?: string[];
  category?: string;
  fan_count?: number;
  followers_count?: number;
  cover?: { source?: string };
  picture?: { data?: { url?: string } };
}

interface PageOption {
  id: string;
  name: string;
  fan_count?: number;
  picture?: { data?: { url?: string } };
  instagram_business_account?: { id: string; username?: string };
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

/* ─── Componente: Modal Promover Post ─────────────────────────────────────── */

function PromoverModal({ postId, onClose }: { postId: string; onClose: () => void }) {
  const [nome, setNome] = useState('Promover post');
  const [orcamento, setOrcamento] = useState('30');
  const [dataInicio, setDataInicio] = useState('');
  const [dataFim, setDataFim] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  async function handlePromover() {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/social/promote', {
        method: 'POST',
        body: JSON.stringify({
          post_id: postId,
          nome_campanha: nome,
          orcamento_diario: parseFloat(orcamento) || 30,
          data_inicio: dataInicio || new Date().toISOString(),
          data_fim: dataFim || undefined,
          paises: ['BR'],
        }),
      });
      const json = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (json.ok) {
        setFeedback({ ok: true, msg: json.message || 'Post promovido com sucesso!' });
        setTimeout(onClose, 2000);
      } else {
        setFeedback({ ok: false, msg: json.error || 'Erro ao promover' });
      }
    } catch (e) {
      setFeedback({ ok: false, msg: String(e) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <Megaphone size={18} className="text-crm-primary" /> Promover post como anúncio
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500"><X size={16} /></button>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nome da campanha</label>
          <input type="text" value={nome} onChange={e => setNome(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Orçamento diário (R$)</label>
          <input type="number" min={5} value={orcamento} onChange={e => setOrcamento(e.target.value)}
            className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data início</label>
            <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Data fim</label>
            <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)}
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
          </div>
        </div>
        <div className="bg-blue-50 rounded-xl px-3 py-2 text-xs text-blue-800">
          A campanha será criada <strong>pausada</strong> para revisão antes de ativar. Público padrão: Brasil, 18-65 anos.
        </div>
        {feedback && (
          <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
            feedback.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
            {feedback.ok ? <CheckCircle size={15} /> : <XCircle size={15} />} {feedback.msg}
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancelar</button>
          <button onClick={handlePromover} disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading && <Loader2 size={13} className="animate-spin" />}
            <Megaphone size={13} /> Promover
          </button>
        </div>
      </div>
    </div>
  );
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
  const [showPromover, setShowPromover] = useState(false);
  return (
    <>
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
          <div className="flex items-center gap-2 mt-3">
            {post.permalink_url && (
              <a
                href={post.permalink_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-crm-primary hover:underline"
              >
                <Eye size={11} /> Ver no Facebook
              </a>
            )}
            <button
              onClick={() => setShowPromover(true)}
              className="ml-auto flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-crm-primary/10 text-crm-primary hover:bg-crm-primary/20 font-medium transition-colors"
            >
              <Megaphone size={11} /> Promover
            </button>
          </div>
        </div>
      </div>
      {showPromover && <PromoverModal postId={post.id} onClose={() => setShowPromover(false)} />}
    </>
  );
}

/* ─── Componente: Aba Vídeos ───────────────────────────────────────────────── */

function VideoLibraryTab() {
  const [adVideos, setAdVideos] = useState<MetaVideo[]>([]);
  const [pageVideos, setPageVideos] = useState<MetaVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [videoTitulo, setVideoTitulo] = useState('');
  const [videoDesc, setVideoDesc] = useState('');
  const [publicarReel, setPublicarReel] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadFb, setUploadFb] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    authFetch('/api/social/videos')
      .then(r => r.json())
      .then((d: { videos?: MetaVideo[]; pageVideos?: MetaVideo[] }) => {
        setAdVideos(d.videos || []);
        setPageVideos(d.pageVideos || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleUpload() {
    if (!videoUrl.trim() || !videoTitulo.trim()) return;
    setUploading(true);
    setUploadFb(null);
    try {
      const res = await authFetch('/api/social/videos', {
        method: 'POST',
        body: JSON.stringify({ video_url: videoUrl, titulo: videoTitulo, descricao: videoDesc, publicar_reel: publicarReel }),
      });
      const json = await res.json() as { ok?: boolean; error?: string; reelId?: string; adVideoId?: string };
      if (json.ok) {
        setUploadFb({ ok: true, msg: `Vídeo enviado!${json.reelId ? ' Reel publicado.' : ''}${json.adVideoId ? ' Adicionado à biblioteca de anúncios.' : ''}` });
        setVideoUrl(''); setVideoTitulo(''); setVideoDesc('');
      } else {
        setUploadFb({ ok: false, msg: json.error || 'Erro ao enviar vídeo' });
      }
    } catch (e) {
      setUploadFb({ ok: false, msg: String(e) });
    } finally {
      setUploading(false);
    }
  }

  function formatDuration(s?: number) {
    if (!s) return '';
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  }

  const allVideos = [...pageVideos, ...adVideos.filter(v => !pageVideos.some(pv => pv.id === v.id))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Biblioteca de Vídeos</h2>
        <button
          onClick={() => setShowUpload(v => !v)}
          className="flex items-center gap-1.5 px-4 py-2 bg-crm-primary text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <Upload size={14} /> Enviar vídeo
        </button>
      </div>

      {showUpload && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-5 space-y-4">
          <h3 className="font-semibold text-purple-900 text-sm flex items-center gap-2">
            <Upload size={15} /> Enviar novo vídeo
          </h3>
          <div>
            <label className="block text-xs font-medium text-purple-800 mb-1">URL pública do vídeo *</label>
            <input type="url" value={videoUrl} onChange={e => setVideoUrl(e.target.value)}
              placeholder="https://... (link público, ex: Dropbox, Drive, etc)"
              className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          <div>
            <label className="block text-xs font-medium text-purple-800 mb-1">Título *</label>
            <input type="text" value={videoTitulo} onChange={e => setVideoTitulo(e.target.value)}
              placeholder="Ex: Rasteirinhas verão 2025"
              className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300" />
          </div>
          <div>
            <label className="block text-xs font-medium text-purple-800 mb-1">Descrição (opcional)</label>
            <textarea rows={2} value={videoDesc} onChange={e => setVideoDesc(e.target.value)}
              className="w-full border border-purple-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-300 resize-none" />
          </div>
          <label className="flex items-center gap-2 text-sm text-purple-900 cursor-pointer">
            <input type="checkbox" checked={publicarReel} onChange={e => setPublicarReel(e.target.checked)}
              className="w-4 h-4 accent-crm-primary" />
            Publicar como Reel na página
          </label>
          {uploadFb && (
            <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
              uploadFb.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
              {uploadFb.ok ? <CheckCircle size={14} /> : <XCircle size={14} />} {uploadFb.msg}
            </div>
          )}
          <button onClick={handleUpload} disabled={uploading || !videoUrl.trim() || !videoTitulo.trim()}
            className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2">
            {uploading && <Loader2 size={13} className="animate-spin" />}
            <Upload size={13} /> Enviar
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="bg-gray-100 rounded-xl aspect-video animate-pulse" />)}
        </div>
      ) : allVideos.length === 0 ? (
        <div className="text-center py-12">
          <Video size={40} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 text-sm">Nenhum vídeo na biblioteca</p>
          <p className="text-gray-400 text-xs mt-1">Clique em "Enviar vídeo" para adicionar um Reel ou vídeo de anúncio</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {allVideos.map(v => {
            const thumb = v.thumbnails?.data?.[0]?.uri;
            return (
              <div key={v.id} className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                {thumb ? (
                  <div className="relative">
                    <img src={thumb} alt={v.title || 'Vídeo'} className="w-full aspect-video object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                      <div className="w-8 h-8 rounded-full bg-white/80 flex items-center justify-center">
                        <Play size={14} className="text-gray-800 ml-0.5" />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-video bg-gray-100 flex items-center justify-center">
                    <Play size={24} className="text-gray-300" />
                  </div>
                )}
                <div className="p-3">
                  <div className="text-xs font-medium text-gray-700 truncate">{v.title || `Vídeo ${v.id.substring(0, 8)}`}</div>
                  {v.length && <div className="text-xs text-gray-400 mt-0.5">{formatDuration(v.length)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const [granted, setGranted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authFetch('/api/social/permissions')
      .then(r => r.json())
      .then((d: { granted?: string[] }) => setGranted(d.granted || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const REQUIRED = [
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
  ];

  const missing = REQUIRED.filter(p => !granted.includes(p.perm));
  const allOk = !loading && missing.length === 0;

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="flex items-center justify-center py-8 text-gray-400 text-sm gap-2">
          <Loader2 size={16} className="animate-spin" /> Verificando permissões...
        </div>
      ) : allOk ? (
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3">
          <CheckCircle size={20} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-green-900">Instagram Direct configurado</div>
            <div className="text-sm text-green-700 mt-1">
              As permissões <span className="font-mono text-xs bg-green-200 px-1 rounded">instagram_basic</span> e{' '}
              <span className="font-mono text-xs bg-green-200 px-1 rounded">instagram_manage_messages</span> estão ativas.
              A Anne pode receber e responder DMs do Instagram.
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-amber-900">
                {missing.length} permiss{missing.length === 1 ? 'ão faltando' : 'ões faltando'} para Instagram Direct
              </div>
              <div className="text-sm text-amber-700 mt-1">
                Para receber e responder DMs do Instagram via Anne, adicione estas permissões ao seu app Meta:
              </div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {missing.map(p => (
                  <span key={p.perm} className="px-2.5 py-1 rounded-full bg-amber-200 text-amber-900 text-xs font-mono font-semibold">
                    {p.perm}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {REQUIRED.map(({ perm, label, items }) => {
          const ok = granted.includes(perm);
          return (
            <div key={perm} className={cn('bg-white rounded-xl border p-4', ok ? 'border-green-200' : 'border-orange-200')}>
              <div className="flex items-center gap-2 mb-2">
                <span className={cn('px-2 py-0.5 rounded-full text-xs font-mono font-semibold',
                  ok ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                )}>{perm}</span>
                {!loading && (
                  <span className={cn('text-xs font-medium', ok ? 'text-green-600' : 'text-orange-600')}>
                    {ok ? 'configurada' : 'faltando'}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-700 font-medium mb-2">{label}</p>
              <ul className="space-y-1">
                {items.map(item => (
                  <li key={item} className="text-xs text-gray-500 flex items-start gap-1.5">
                    <span className={cn('mt-0.5', ok ? 'text-green-400' : 'text-orange-400')}>•</span> {item}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {!allOk && !loading && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-600">
          <strong>Como adicionar:</strong> Acesse{' '}
          <span className="font-mono text-xs bg-gray-200 px-1 rounded">developers.facebook.com</span>
          {' '}→ Seu App → Permissões e Recursos → busque{' '}
          <span className="font-mono text-xs bg-gray-200 px-1 rounded">instagram_manage_messages</span>
          {' '}e{' '}
          <span className="font-mono text-xs bg-gray-200 px-1 rounded">instagram_basic</span>
          {' '}→ Solicitar acesso.
        </div>
      )}
    </div>
  );
}

/* ─── Componente: Aba Configurações da Página ─────────────────────────────── */

function PageSettingsTab() {
  const [data, setData] = useState<PageSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [about, setAbout] = useState('');
  const [website, setWebsite] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    authFetch('/api/social/page-settings')
      .then(r => r.json())
      .then((d: { connected?: boolean; page?: PageSettings }) => {
        if (d.connected && d.page) {
          setData(d.page);
          setAbout(d.page.about || '');
          setWebsite(d.page.website || '');
          setPhone(d.page.phone || '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setFeedback(null);
    try {
      const res = await authFetch('/api/social/page-settings', {
        method: 'PATCH',
        body: JSON.stringify({ about, website, phone }),
      });
      const json = await res.json() as { ok?: boolean; error?: string };
      if (json.ok) {
        setFeedback({ ok: true, msg: 'Informações atualizadas com sucesso!' });
        setEditing(false);
      } else {
        setFeedback({ ok: false, msg: json.error || 'Erro ao salvar' });
      }
    } catch (e) {
      setFeedback({ ok: false, msg: String(e) });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return (
    <div className="py-12 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
      <Loader2 size={16} className="animate-spin" /> Carregando configurações...
    </div>
  );

  if (!data) return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-sm text-amber-800">
      Página não conectada — clique em "Detectar página" para conectar.
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page overview */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <div className="flex items-start gap-4">
          {data.picture?.data?.url && (
            <img src={data.picture.data.url} alt={data.name} className="w-16 h-16 rounded-xl object-cover" />
          )}
          {data.cover?.source && (
            <img src={data.cover.source} alt="Capa" className="hidden sm:block w-32 h-16 rounded-xl object-cover" />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-lg">{data.name}</h3>
            {data.category && <p className="text-sm text-gray-500">{data.category}</p>}
            <div className="flex gap-4 mt-1 text-xs text-gray-400">
              {data.fan_count !== undefined && <span>{n(data.fan_count)} curtidas</span>}
              {data.followers_count !== undefined && <span>{n(data.followers_count)} seguidores</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Editable fields */}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Informações da página</h3>
          {!editing && (
            <button onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
              <Edit2 size={13} /> Editar
            </button>
          )}
        </div>

        {feedback && (
          <div className={cn('flex items-center gap-2 px-4 py-3 rounded-xl text-sm',
            feedback.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800')}>
            {feedback.ok ? <CheckCircle size={14} /> : <XCircle size={14} />} {feedback.msg}
          </div>
        )}

        {editing ? (
          <div className="space-y-4">
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                <Building2 size={12} /> Sobre a página
              </label>
              <textarea rows={3} value={about} onChange={e => setAbout(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30 resize-none" />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                <Globe size={12} /> Site
              </label>
              <input type="url" value={website} onChange={e => setWebsite(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
            </div>
            <div>
              <label className="flex items-center gap-1 text-xs font-medium text-gray-700 mb-1">
                <Phone size={12} /> Telefone
              </label>
              <input type="tel" value={phone} onChange={e => setPhone(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-crm-primary/30" />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(false)}
                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 px-3 py-2 rounded-xl bg-crm-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">
                {saving && <Loader2 size={13} className="animate-spin" />} Salvar
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {[
              { icon: <Building2 size={14} />, label: 'Sobre', value: data.about },
              { icon: <Globe size={14} />, label: 'Site', value: data.website },
              { icon: <Phone size={14} />, label: 'Telefone', value: data.phone },
              { icon: <MessageCircle size={14} />, label: 'Email', value: data.emails?.[0] },
            ].filter(f => f.value).map(({ icon, label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="text-gray-400 mt-0.5 shrink-0">{icon}</span>
                <div>
                  <div className="text-xs text-gray-400">{label}</div>
                  <div className="text-sm text-gray-700">{value}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Componente: Configurar Página ────────────────────────────────────────── */

function ConfigurarPagina({ onConfigured }: { onConfigured: () => void }) {
  const [step, setStep] = useState<'initial' | 'selecting' | 'done'>('initial');
  const [loading, setLoading] = useState(false);
  const [pages, setPages] = useState<PageOption[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
  const [savedPageName, setSavedPageName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleListPages() {
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/social/config');
      const json = await res.json() as { pages?: PageOption[]; currentPageId?: string; error?: string };
      if (!res.ok || json.error) {
        setError(json.error || 'Erro ao listar páginas');
        return;
      }
      setPages(json.pages || []);
      if (json.currentPageId) setSelectedPage(json.currentPageId);
      setStep('selecting');
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePage() {
    if (!selectedPage) return;
    setLoading(true);
    setError(null);
    try {
      const res = await authFetch('/api/social/config', {
        method: 'POST',
        body: JSON.stringify({ page_id: selectedPage }),
      });
      const json = await res.json() as { ok?: boolean; pageName?: string; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || 'Erro ao salvar página');
        return;
      }
      setSavedPageName(json.pageName || selectedPage);
      setStep('done');
      setTimeout(onConfigured, 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  if (step === 'done') {
    return (
      <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-3">
        <CheckCircle size={20} className="text-green-600 shrink-0" />
        <div>
          <div className="font-semibold text-green-900">Página conectada!</div>
          <div className="text-sm text-green-700">{savedPageName}</div>
        </div>
      </div>
    );
  }

  if (step === 'selecting') {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Settings2 size={18} className="text-blue-600" />
          <span className="font-semibold text-blue-900">Escolha a página do Facebook</span>
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}
        <div className="space-y-2">
          {pages.map(page => (
            <button
              key={page.id}
              onClick={() => setSelectedPage(page.id)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all',
                selectedPage === page.id
                  ? 'border-blue-500 bg-white'
                  : 'border-gray-200 bg-white hover:border-blue-300'
              )}
            >
              {page.picture?.data?.url ? (
                <img src={page.picture.data.url} alt={page.name} className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <Facebook size={18} className="text-blue-600" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-gray-900">{page.name}</div>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {page.fan_count !== undefined && (
                    <span className="text-xs text-gray-400">{(page.fan_count || 0).toLocaleString('pt-BR')} curtidas</span>
                  )}
                  {page.instagram_business_account?.username && (
                    <span className="text-xs text-pink-500">@{page.instagram_business_account.username}</span>
                  )}
                </div>
              </div>
              <div className={cn(
                'w-4 h-4 rounded-full border-2 shrink-0 transition-all',
                selectedPage === page.id ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
              )} />
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setStep('initial')}
            className="px-4 py-2 rounded-xl border border-gray-200 text-gray-700 text-sm font-medium hover:bg-gray-50">
            Voltar
          </button>
          <button
            onClick={handleSavePage}
            disabled={!selectedPage || loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
            Conectar esta página
          </button>
        </div>
      </div>
    );
  }

  // step === 'initial'
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <Settings2 size={20} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-blue-900">Conectar Página do Facebook</div>
          <div className="text-sm text-blue-700 mt-0.5">
            Clique para ver todas as páginas vinculadas ao seu token Meta e escolher qual conectar.
          </div>
          {error && <div className="text-sm text-red-700 mt-1">{error}</div>}
        </div>
      </div>
      <button
        onClick={handleListPages}
        disabled={loading}
        className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-60 flex items-center gap-2 whitespace-nowrap"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        Ver minhas páginas
      </button>
    </div>
  );
}

/* ─── Página Principal ─────────────────────────────────────────────────────── */

export default function SocialPage() {
  const [tab, setTab] = useState<Tab>('feed');
  const [connected, setConnected] = useState(false);
  const [pageId, setPageId] = useState<string | null>(null);
  const [pageName, setPageName] = useState<string | null>(null);
  const [pagePhoto, setPagePhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [localPosts, setLocalPosts] = useState<LocalPost[]>([]);
  const [pagePosts, setPagePosts] = useState<MetaPost[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showPageSelector, setShowPageSelector] = useState(false);

  const loadData = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await authFetch('/api/social/posts');
      if (res.ok) {
        const json = await res.json() as {
          connected: boolean; pageId?: string; pageName?: string; pagePhoto?: string;
          posts: LocalPost[]; pagePosts: MetaPost[];
        };
        setConnected(json.connected);
        setPageId(json.pageId || null);
        setPageName(json.pageName || null);
        setPagePhoto(json.pagePhoto || null);
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
            <div className="flex items-center gap-3">
              {connected && pagePhoto && (
                <img src={pagePhoto} alt="" className="w-10 h-10 rounded-xl object-cover" />
              )}
              <div>
                <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <Share2 size={22} className="text-crm-primary" />
                  Social Mídia
                </h1>
                {connected && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {pageName || pageId}
                    <button
                      onClick={() => setShowPageSelector(true)}
                      className="ml-2 text-xs text-crm-primary hover:underline"
                    >
                      Trocar página
                    </button>
                  </p>
                )}
                <div className="flex gap-4 mt-1 text-xs text-gray-400 flex-wrap">
                  {agendados.length > 0 && <span className="flex items-center gap-1"><Clock size={11} /> {agendados.length} agendado{agendados.length > 1 ? 's' : ''}</span>}
                  {rascunhos.length > 0 && <span className="flex items-center gap-1"><FileText size={11} /> {rascunhos.length} rascunho{rascunhos.length > 1 ? 's' : ''}</span>}
                  {publicados.length > 0 && <span className="flex items-center gap-1"><CheckCircle size={11} /> {publicados.length} publicado{publicados.length > 1 ? 's' : ''}</span>}
                </div>
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

        {/* Configurar página se não conectado ou trocando */}
        {!loading && (!connected || showPageSelector) && (
          <ConfigurarPagina onConfigured={() => { setShowPageSelector(false); loadData(); }} />
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
