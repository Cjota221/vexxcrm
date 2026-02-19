'use client';

/**
 * StatusPanel — Módulo de Status (Stories) do WhatsApp
 * 
 * Permite postar e visualizar status/stories diretamente do VEXX.
 * Integrado como aba lateral na Central de Atendimento.
 */

import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X, Plus, Image as ImageIcon, Video, Type,
  Loader2, Send, Eye, Clock, Upload,
} from 'lucide-react';
import { api } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/* ─── Tipos ─────────────────────────────────────────────────── */

interface StatusItem {
  id: string;
  sender_jid: string;
  sender_name: string;
  type: 'text' | 'image' | 'video';
  content: string;
  caption?: string;
  thumbnail_url?: string;
  timestamp: string;
  background_color?: string;
}

/* ─── Cores de fundo para status de texto ─────────────────── */

const BG_COLORS = [
  '#1e3a5f', '#059669', '#7c3aed', '#dc2626',
  '#0891b2', '#d97706', '#6366f1', '#ec4899',
];

/* ─── Props ─────────────────────────────────────────────────── */

interface StatusPanelProps {
  open: boolean;
  onClose: () => void;
}

export function StatusPanel({ open, onClose }: StatusPanelProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'list' | 'compose'>('list');
  const [composeType, setComposeType] = useState<'text' | 'image' | 'video'>('text');
  const [textContent, setTextContent] = useState('');
  const [bgColor, setBgColor] = useState(BG_COLORS[0]);
  const [mediaUrl, setMediaUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ── Buscar status recentes ─────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ['whatsapp-stories'],
    queryFn: async () => {
      const res = await api.get<{ status_list: StatusItem[]; aviso?: string }>('/api/whatsapp/stories');
      return res.data;
    },
    staleTime: 60_000,
    enabled: open,
  });

  // ── Postar status ──────────────────────────────────────────
  const postMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post('/api/whatsapp/stories', payload);
      if (res.error) throw new Error(res.error);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-stories'] });
      setView('list');
      setTextContent('');
      setMediaUrl('');
      setCaption('');
    },
  });

  // ── Upload de mídia ────────────────────────────────────────
  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const { data: { session } } = await supabase.auth.getSession();
      const headers: HeadersInit = session?.access_token
        ? { Authorization: `Bearer ${session.access_token}` }
        : {};
      const res = await fetch('/api/upload', { method: 'POST', body: form, headers });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Erro no upload');
      setMediaUrl(json.url);
    } catch (err) {
      console.error('Upload erro:', err);
    } finally {
      setUploading(false);
    }
  };

  // ── Enviar status ──────────────────────────────────────────
  const handlePost = () => {
    if (composeType === 'text') {
      if (!textContent.trim()) return;
      postMutation.mutate({
        type: 'text',
        content: textContent.trim(),
        background_color: bgColor,
      });
    } else {
      if (!mediaUrl) return;
      postMutation.mutate({
        type: composeType,
        media_url: mediaUrl,
        caption: caption.trim() || undefined,
      });
    }
  };

  if (!open) return null;

  const statusList = data?.status_list ?? [];

  // Agrupar por sender
  const grouped = statusList.reduce<Record<string, StatusItem[]>>((acc, s) => {
    const key = s.sender_name || s.sender_jid;
    if (!acc[key]) acc[key] = [];
    acc[key].push(s);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center">
              <Eye size={14} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Status / Stories</h2>
              <p className="text-[10px] text-gray-400">Poste e veja os status dos contatos</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view === 'list' && (
              <button
                onClick={() => setView('compose')}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-crm-primary text-white text-xs font-semibold rounded-lg hover:bg-crm-primary/90 transition-colors"
              >
                <Plus size={12} /> Novo Status
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {view === 'compose' ? (
            /* ── Composer ── */
            <div className="p-5 space-y-4">
              <button
                onClick={() => setView('list')}
                className="text-xs text-crm-primary hover:underline"
              >
                ← Voltar para a lista
              </button>

              {/* Tipo seletor */}
              <div className="grid grid-cols-3 gap-2">
                {([
                  { t: 'text' as const, icon: <Type size={14} />, label: 'Texto' },
                  { t: 'image' as const, icon: <ImageIcon size={14} />, label: 'Imagem' },
                  { t: 'video' as const, icon: <Video size={14} />, label: 'Vídeo' },
                ]).map(({ t, icon, label }) => (
                  <button
                    key={t}
                    onClick={() => { setComposeType(t); setMediaUrl(''); }}
                    className={cn(
                      'flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-medium transition-all',
                      composeType === t
                        ? 'border-crm-primary bg-crm-primary/5 text-crm-primary'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    )}
                  >
                    {icon} {label}
                  </button>
                ))}
              </div>

              {/* Texto */}
              {composeType === 'text' && (
                <div className="space-y-3">
                  <div
                    className="rounded-xl p-6 min-h-[160px] flex items-center justify-center"
                    style={{ backgroundColor: bgColor }}
                  >
                    <textarea
                      value={textContent}
                      onChange={e => setTextContent(e.target.value)}
                      placeholder="Digite seu status..."
                      maxLength={700}
                      className="w-full bg-transparent text-white text-center text-lg font-medium resize-none outline-none placeholder:text-white/50"
                      rows={4}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">Cor:</span>
                    {BG_COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => setBgColor(c)}
                        className={cn(
                          'w-6 h-6 rounded-full border-2 transition-all',
                          bgColor === c ? 'border-gray-800 scale-110' : 'border-transparent'
                        )}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Imagem / Vídeo */}
              {(composeType === 'image' || composeType === 'video') && (
                <div className="space-y-3">
                  {mediaUrl ? (
                    <div className="relative rounded-xl overflow-hidden bg-gray-50 border">
                      {composeType === 'image' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mediaUrl} alt="Status" className="w-full max-h-64 object-contain" />
                      ) : (
                        <video src={mediaUrl} controls className="w-full max-h-64" />
                      )}
                      <button
                        onClick={() => setMediaUrl('')}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                      className="w-full border-2 border-dashed border-gray-300 rounded-xl py-10 flex flex-col items-center gap-2 text-gray-400 hover:border-crm-primary hover:text-crm-primary transition-colors"
                    >
                      {uploading
                        ? <Loader2 size={24} className="animate-spin" />
                        : <Upload size={24} />
                      }
                      <span className="text-sm">{uploading ? 'Enviando...' : `Selecionar ${composeType === 'image' ? 'imagem' : 'vídeo'}`}</span>
                    </button>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={composeType === 'image' ? 'image/*' : 'video/mp4,video/webm'}
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (file) handleUpload(file);
                      e.target.value = '';
                    }}
                  />
                  <input
                    type="text"
                    value={caption}
                    onChange={e => setCaption(e.target.value)}
                    placeholder="Legenda (opcional)"
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-crm-primary/40"
                  />
                </div>
              )}

              {/* Botão enviar */}
              <button
                onClick={handlePost}
                disabled={postMutation.isPending || (composeType === 'text' ? !textContent.trim() : !mediaUrl)}
                className="w-full flex items-center justify-center gap-2 py-3 bg-crm-primary text-white font-semibold rounded-xl hover:bg-crm-primary/90 disabled:opacity-50 transition-colors"
              >
                {postMutation.isPending
                  ? <><Loader2 size={15} className="animate-spin" /> Postando...</>
                  : <><Send size={15} /> Postar Status</>
                }
              </button>

              {postMutation.isError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
                  {(postMutation.error as Error).message}
                </p>
              )}
            </div>
          ) : (
            /* ── Lista de status ── */
            <div className="p-4 space-y-3">
              {isLoading && (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 size={18} className="animate-spin" />
                </div>
              )}

              {data?.aviso && (
                <div className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-200">
                  ⚠️ {data.aviso}
                </div>
              )}

              {!isLoading && statusList.length === 0 && (
                <div className="text-center py-10 text-gray-400">
                  <Eye size={32} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Nenhum status recente</p>
                  <p className="text-xs mt-1">Poste seu primeiro status!</p>
                </div>
              )}

              {Object.entries(grouped).map(([senderName, items]) => (
                <div key={senderName} className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center text-white text-[10px] font-bold">
                      {senderName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-900">{senderName}</p>
                      <p className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Clock size={9} />
                        {new Date(items[0].timestamp).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-1.5 pl-10">
                    {items.slice(0, 6).map(s => (
                      <div
                        key={s.id}
                        className={cn(
                          'rounded-lg overflow-hidden aspect-square flex items-center justify-center border border-gray-100',
                          s.type === 'text' ? 'p-2' : ''
                        )}
                        style={s.type === 'text' ? { backgroundColor: s.background_color || '#1e3a5f' } : undefined}
                      >
                        {s.type === 'text' && (
                          <p className="text-white text-[9px] text-center leading-tight line-clamp-4 font-medium">
                            {s.content}
                          </p>
                        )}
                        {s.type === 'image' && s.thumbnail_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
                        )}
                        {s.type === 'image' && !s.thumbnail_url && (
                          <ImageIcon size={16} className="text-gray-300" />
                        )}
                        {s.type === 'video' && (
                          <div className="bg-gray-100 w-full h-full flex items-center justify-center">
                            {s.thumbnail_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={s.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <Video size={16} className="text-gray-300" />
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
