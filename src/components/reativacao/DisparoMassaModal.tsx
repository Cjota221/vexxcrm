'use client';

import { useState, useRef, useCallback } from 'react';
import { X, Send, AlertTriangle, CheckCircle2, Loader2, Users, Image as ImageIcon, Video, Paperclip, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { REGRA_DA_CAROL } from '@/lib/services/campaign-dispatcher';
import { supabase } from '@/lib/supabase';
import type { Client } from '@/types';

interface DisparoMassaModalProps {
  leads: Client[];
  onClose: () => void;
}

type DispatchStatus = 'idle' | 'uploading' | 'running' | 'done' | 'error';

interface MediaAttachment {
  file: File;
  previewUrl: string;
  type: 'image' | 'video';
}

interface Progress {
  sent: number;
  failed: number;
  total: number;
  currentName: string;
}

function humanDelay(min: number, max: number): number {
  const r1 = Math.random();
  const r2 = Math.random();
  const media = (min + max) / 2;
  const desvio = (max - min) / 6;
  const normal = ((r1 + r2) / 2) * desvio * 2 - desvio + media;
  return Math.max(min, Math.min(max, Math.round(normal)));
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/3gpp,video/quicktime';
const MAX_SIZE_MB = 15;

export function DisparoMassaModal({ leads, onClose }: DisparoMassaModalProps) {
  const [message, setMessage] = useState('');
  const [media, setMedia] = useState<MediaAttachment | null>(null);
  const [status, setStatus] = useState<DispatchStatus>('idle');
  const [progress, setProgress] = useState<Progress>({ sent: 0, failed: 0, total: leads.length, currentName: '' });
  const [errorMsg, setErrorMsg] = useState('');
  const abortRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ─── Seleção de arquivo ───────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`Arquivo muito grande. Máximo ${MAX_SIZE_MB}MB.`);
      return;
    }

    const type = file.type.startsWith('video/') ? 'video' : 'image';
    const previewUrl = URL.createObjectURL(file);
    setMedia({ file, previewUrl, type });
    // reset input para permitir selecionar o mesmo arquivo novamente
    e.target.value = '';
  }

  function removeMedia() {
    if (media) URL.revokeObjectURL(media.previewUrl);
    setMedia(null);
  }

  // ─── Upload para Supabase Storage ────────────────────────────────────────
  async function uploadMedia(file: File): Promise<string> {
    const ext = file.name.split('.').pop() ?? 'bin';
    const path = `reativacao/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error } = await supabase.storage
      .from('media')
      .upload(path, file, { contentType: file.type, cacheControl: '31536000' });

    if (error) throw new Error(`Upload falhou: ${error.message}`);

    const { data } = supabase.storage.from('media').getPublicUrl(path);
    return data.publicUrl;
  }

  // ─── Disparo ─────────────────────────────────────────────────────────────
  const handleConfirm = useCallback(async () => {
    if (!message.trim() && !media) return;
    if (leads.length === 0) return;

    abortRef.current = false;

    // Upload da mídia primeiro
    let mediaUrl: string | null = null;
    if (media) {
      setStatus('uploading');
      try {
        mediaUrl = await uploadMedia(media.file);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'Erro no upload da mídia');
        setStatus('error');
        return;
      }
    }

    setStatus('running');
    let sent = 0;
    let failed = 0;

    for (let i = 0; i < leads.length; i++) {
      if (abortRef.current) break;

      const lead = leads[i];
      setProgress({ sent, failed, total: leads.length, currentName: lead.name || lead.phone });

      try {
        const body: Record<string, unknown> = {
          to: lead.phone_normalized || lead.phone,
        };

        if (mediaUrl) {
          body.type = media!.type;
          body.mediaUrl = mediaUrl;
          body.caption = message.trim() || undefined;
        } else {
          body.type = 'text';
          body.content = message.trim();
        }

        const res = await fetch('/api/whatsapp/send', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (res.ok) sent++;
        else failed++;
      } catch {
        failed++;
      }

      setProgress({ sent, failed, total: leads.length, currentName: lead.name || lead.phone });

      if (i < leads.length - 1) {
        if ((i + 1) % REGRA_DA_CAROL.COOLOFF_A_CADA === 0) {
          await sleep(REGRA_DA_CAROL.COOLOFF_DURACAO_MS);
        } else {
          await sleep(humanDelay(REGRA_DA_CAROL.DELAY_MIN_MS, 45_000));
        }
      }
    }

    setProgress(prev => ({ ...prev, sent, failed, currentName: '' }));
    setStatus('done');
  }, [leads, message, media]);

  const pct = progress.total > 0
    ? Math.round(((progress.sent + progress.failed) / progress.total) * 100)
    : 0;

  const canSend = (message.trim().length > 0 || media !== null) && leads.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1e3a5f] flex items-center justify-center">
              <Send size={15} className="text-white" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Disparo em massa</h2>
              <p className="text-xs text-gray-400">{leads.length} contato{leads.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          {status !== 'running' && status !== 'uploading' && (
            <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors">
              <X size={16} className="text-gray-500" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-4">
          {/* Regra da Carol */}
          <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <AlertTriangle size={14} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              <strong>Regra da Carol:</strong> 15s entre contatos · pausa 60s a cada 10 envios.
            </p>
          </div>

          {/* Resumo tempo estimado */}
          <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
            <Users size={14} className="text-gray-500" />
            <span className="text-sm text-gray-700">
              Tempo estimado:{' '}
              <strong>~{Math.ceil((leads.length * 20 + Math.floor(leads.length / 10) * 60) / 60)} min</strong>
            </span>
          </div>

          {status === 'idle' && (
            <>
              {/* Mensagem */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">
                  Mensagem {media ? '(legenda opcional)' : ''}
                </label>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  placeholder={media ? 'Adicione uma legenda (opcional)...' : 'Ex: Oi {{nome}}, temos uma oferta exclusiva para você! 🎁'}
                  rows={3}
                  className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-[#1e3a5f]/30 focus:border-[#1e3a5f] transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1">{message.length} caracteres</p>
              </div>

              {/* Mídia */}
              {media ? (
                <div className="relative rounded-xl overflow-hidden border border-gray-200">
                  {media.type === 'image' ? (
                    <img src={media.previewUrl} alt="preview" className="w-full max-h-48 object-cover" />
                  ) : (
                    <video src={media.previewUrl} className="w-full max-h-48 object-cover" controls />
                  )}
                  <button
                    onClick={removeMedia}
                    className="absolute top-2 right-2 w-7 h-7 bg-black/60 hover:bg-black/80 rounded-full flex items-center justify-center transition-colors"
                  >
                    <Trash2 size={13} className="text-white" />
                  </button>
                  <div className="absolute bottom-2 left-2 flex items-center gap-1 bg-black/60 text-white text-[11px] px-2 py-0.5 rounded-full">
                    {media.type === 'image' ? <ImageIcon size={10} /> : <Video size={10} />}
                    {media.type === 'image' ? 'Imagem' : 'Vídeo'}
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-500 hover:border-[#1e3a5f]/40 hover:text-[#1e3a5f] hover:bg-[#1e3a5f]/5 transition-all"
                >
                  <Paperclip size={15} />
                  Anexar imagem ou vídeo
                  <span className="text-xs text-gray-400">(máx. {MAX_SIZE_MB}MB)</span>
                </button>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED}
                className="hidden"
                onChange={handleFileChange}
              />
            </>
          )}

          {/* Upload em progresso */}
          {status === 'uploading' && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4">
              <Loader2 size={18} className="animate-spin text-blue-600 shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800">Fazendo upload da mídia...</p>
                <p className="text-xs text-blue-600">Aguarde antes de iniciar o disparo</p>
              </div>
            </div>
          )}

          {/* Progresso do disparo */}
          {(status === 'running' || status === 'done') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>
                  {status === 'running' ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 size={12} className="animate-spin" />
                      Enviando para {progress.currentName}...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-emerald-600">
                      <CheckCircle2 size={12} />
                      Disparo concluído
                    </span>
                  )}
                </span>
                <span className="font-medium">{pct}%</span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div
                  className={cn('h-2 rounded-full transition-all duration-300', status === 'done' ? 'bg-emerald-500' : 'bg-[#1e3a5f]')}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex gap-4 text-xs">
                <span className="text-emerald-600 font-medium">{progress.sent} enviados</span>
                {progress.failed > 0 && <span className="text-red-500 font-medium">{progress.failed} falhas</span>}
                <span className="text-gray-400 ml-auto">{progress.sent + progress.failed}/{progress.total}</span>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-5">
          {status === 'idle' && (
            <>
              <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={!canSend}
                className="flex-1 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:bg-[#162d4a] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <Send size={14} />
                Confirmar disparo
              </button>
            </>
          )}
          {(status === 'running' || status === 'uploading') && (
            <button
              onClick={() => { abortRef.current = true; setStatus('done'); }}
              disabled={status === 'uploading'}
              className="flex-1 py-2.5 border border-red-200 text-red-600 rounded-xl text-sm font-medium hover:bg-red-50 disabled:opacity-40 transition-colors"
            >
              Interromper
            </button>
          )}
          {(status === 'done' || status === 'error') && (
            <button onClick={onClose} className="flex-1 py-2.5 bg-[#1e3a5f] text-white rounded-xl text-sm font-semibold hover:bg-[#162d4a] transition-colors">
              Fechar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
