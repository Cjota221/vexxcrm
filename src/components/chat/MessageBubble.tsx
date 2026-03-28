'use client';

import { useState, useCallback, memo, useRef } from 'react';
import { cn } from '@/lib/utils';
import { formatTime } from '@/lib/utils';
import { Check, CheckCheck, Mic, Eye, AlertCircle, Clock, Copy, RotateCcw, Trash2, Pencil, MapPin, Smile, X } from 'lucide-react';
import { api } from '@/lib/api';
import { parseMessageContent } from '@/lib/message-parser';
import { AudioMessage } from './AudioMessage';
import { MediaMessage, DocumentMessage } from './MediaMessage';
import { LinkPreview, extractFirstUrl } from './LinkPreview';
import type { Message } from '@/types';

// Emojis mais usados no WhatsApp
const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '👏', '🔥'];

interface MessageBubbleProps {
  message: Message;
  /** Callback chamado quando a transcrição é atualizada (para invalidar query) */
  onTranscriptionUpdate?: (messageId: string, transcription: string) => void;
  /** Callback para reenviar mensagem que falhou */
  onRetry?: (message: Message) => void;
}

/**
 * Bolha de mensagem estilo WhatsApp.
 * Suporta texto, mídia, transcrição de áudio e descrição de imagem (IA).
 * Trata mídias com URL expirada (403) e oferece re-download.
 * Wrapped em React.memo para evitar re-renders desnecessários quando outras mensagens mudam.
 */
function MessageBubbleComponent({ message, onTranscriptionUpdate, onRetry }: MessageBubbleProps) {
  const isFromMe = message.from_me;
  const metadata = message.metadata as Record<string, unknown> | undefined;
  const transcription = metadata?.transcription as string | undefined;
  const aiDescription = metadata?.ai_description as string | undefined;
  const aiProcessed = metadata?.ai_processed as boolean | undefined;
  const copyCode = metadata?.copy_code as string | undefined;
  const [isRedownloading, setIsRedownloading] = useState(false);
  const [fixedUrl, setFixedUrl] = useState<string | null>(null);
  const [mediaExpired, setMediaExpired] = useState(false);
  const [localTranscription, setLocalTranscription] = useState<string | null>(null);
  // Menu de contexto
  const [showMenu, setShowMenu] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  // Edição inline
  const [editMode, setEditMode] = useState(false);
  const [editText, setEditText] = useState(message.content || '');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  // Deleção
  const [isDeleting, setIsDeleting] = useState(false);
  // Reactions locais (otimístico)
  const [localReactions, setLocalReactions] = useState<Array<{ emoji: string; from_me: boolean; reactor_phone: string }> | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentMediaUrl = fixedUrl || message.media_url;
  const displayTranscription = localTranscription ?? transcription;
  // Reactions: local (otimístico) ou do servidor
  const reactions = localReactions ?? (metadata?.reactions as Array<{ emoji: string; from_me: boolean; reactor_phone: string }> | undefined);

  const handleRedownload = useCallback(async () => {
    if (isRedownloading || mediaExpired) return;
    setIsRedownloading(true);
    try {
      const response = await api.post<{ data: { media_url: string } }>('/api/media/redownload', {
        messageId: message.id,
      });
      if (response.error) {
        console.warn('[MessageBubble] Re-download falhou:', response.error);
        setMediaExpired(true); // Não tentar mais — mídia apagada do WhatsApp
        return;
      }
      const newUrl = (response.data as any)?.data?.media_url || (response.data as any)?.media_url;
      if (newUrl) setFixedUrl(newUrl);
      else setMediaExpired(true);
    } catch (err) {
      console.warn('[MessageBubble] Erro no re-download:', err);
      setMediaExpired(true);
    } finally {
      setIsRedownloading(false);
    }
  }, [message.id, isRedownloading, mediaExpired]);

  const handleTranscribe = useCallback(async () => {
    try {
      const res = await api.post<{ transcription: string }>('/api/whatsapp/transcribe-audio', {
        messageId: message.id,
      });
      const text = res.data?.transcription;
      if (!text) throw new Error('Falha na transcrição');
      setLocalTranscription(text);
      onTranscriptionUpdate?.(message.id, text);
    } catch (err) {
      console.warn('[MessageBubble] Transcrição falhou:', err);
      // Não re-lança — AudioMessage permanece no estado "não transcrito" visualmente
    }
  }, [message.id, onTranscriptionUpdate]);

  const handleDelete = useCallback(async () => {
    if (isDeleting) return;
    if (!confirm('Apagar esta mensagem para todos?')) return;
    setIsDeleting(true);
    setShowMenu(false);
    try {
      const res = await api.delete(`/api/messages/${message.id}/delete`);
      if (res.error) throw new Error(res.error);
    } catch (err) {
      console.warn('[MessageBubble] Erro ao apagar:', err);
    } finally {
      setIsDeleting(false);
    }
  }, [message.id, isDeleting]);

  const handleSaveEdit = useCallback(async () => {
    if (!editText.trim() || isSavingEdit) return;
    setIsSavingEdit(true);
    try {
      const res = await api.patch(`/api/messages/${message.id}/edit`, { content: editText.trim() });
      if (res.error) throw new Error(res.error);
      setEditMode(false);
    } catch (err) {
      console.warn('[MessageBubble] Erro ao editar:', err);
    } finally {
      setIsSavingEdit(false);
    }
  }, [message.id, editText, isSavingEdit]);

  const handleReact = useCallback(async (emoji: string) => {
    setShowEmojiPicker(false);
    setShowMenu(false);
    // Otimístico: adicionar reaction local imediatamente
    setLocalReactions(prev => {
      const base = prev ?? (metadata?.reactions as typeof prev) ?? [];
      const filtered = (base || []).filter(r => !r.from_me);
      return emoji ? [...filtered, { emoji, from_me: true, reactor_phone: 'me' }] : filtered;
    });
    try {
      await api.post(`/api/messages/${message.id}/react`, { emoji });
    } catch (err) {
      console.warn('[MessageBubble] Erro ao reagir:', err);
      setLocalReactions(null); // rollback
    }
  }, [message.id, metadata]);

  const statusIcon = () => {
    if (!isFromMe) return null;
    switch (message.status) {
      case 'pending':
        return <Clock size={12} className="text-[#111b21]/30" />;
      case 'sent':
        return <Check size={14} className="text-[#111b21]/50" />;
      case 'delivered':
        return <CheckCheck size={14} className="text-[#111b21]/50" />;
      case 'read':
        return <CheckCheck size={14} className="text-[#00a884]" />;
      case 'failed':
        return <AlertCircle size={13} className="text-red-500" />;
      default:
        return <Clock size={12} className="text-[#111b21]/30" />;
    }
  };

  // Mensagem apagada — exibe placeholder igual ao WhatsApp
  if (message.deleted) {
    return (
      <div className={cn('flex mb-1', isFromMe ? 'justify-end' : 'justify-start')}>
        <div className={cn(
          'max-w-[65%] px-3 py-2 rounded-bubble relative flex items-center gap-2 opacity-70 italic',
          isFromMe
            ? 'bg-wa-bubble-out text-wa-text-bubble rounded-tr-sm'
            : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-sm'
        )}>
          <Trash2 size={13} className="shrink-0" />
          <span className="text-sm">
            {isFromMe ? 'Você apagou esta mensagem' : 'Esta mensagem foi apagada'}
          </span>
          <span className="text-[11px] opacity-60 ml-1 whitespace-nowrap">
            {formatTime(message.timestamp ?? message.created_at)}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex mb-1 group/msg',
        isFromMe ? 'justify-end' : 'justify-start'
      )}
      onMouseLeave={() => { setShowMenu(false); setShowEmojiPicker(false); }}
    >
      {/* Barra de ações — aparece ao hover */}
      {!message.deleted && (
        <div className={cn(
          'flex items-center gap-0.5 self-center opacity-0 group-hover/msg:opacity-100 transition-opacity',
          isFromMe ? 'order-first mr-1' : 'order-last ml-1'
        )}>
          {/* Reagir */}
          <div className="relative">
            <button
              onClick={() => { setShowEmojiPicker(p => !p); setShowMenu(false); }}
              className="p-1 rounded-full hover:bg-black/10 text-gray-500 hover:text-gray-700"
              title="Reagir"
            >
              <Smile size={15} />
            </button>
            {showEmojiPicker && (
              <div className={cn(
                'absolute bottom-8 z-50 bg-white rounded-xl shadow-lg border border-gray-100 p-1.5 flex gap-0.5',
                isFromMe ? 'right-0' : 'left-0'
              )}>
                {QUICK_REACTIONS.map(e => (
                  <button
                    key={e}
                    onClick={() => handleReact(e)}
                    className="text-lg hover:scale-125 transition-transform px-0.5"
                    title={e}
                  >{e}</button>
                ))}
              </div>
            )}
          </div>
          {/* Mais opções */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => { setShowMenu(p => !p); setShowEmojiPicker(false); }}
              className="p-1 rounded-full hover:bg-black/10 text-gray-500 hover:text-gray-700 text-[11px] font-bold leading-none"
              title="Mais opções"
            >
              ···
            </button>
            {showMenu && (
              <div className={cn(
                'absolute bottom-8 z-50 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-36',
                isFromMe ? 'right-0' : 'left-0'
              )}>
                {isFromMe && message.type === 'text' && (
                  <button
                    onClick={() => { setEditMode(true); setEditText(message.content || ''); setShowMenu(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
                  >
                    <Pencil size={13} /> Editar
                  </button>
                )}
                {isFromMe && (
                  <button
                    onClick={handleDelete}
                    disabled={isDeleting}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 text-red-600 disabled:opacity-50"
                  >
                    <Trash2 size={13} /> {isDeleting ? 'Apagando...' : 'Apagar'}
                  </button>
                )}
                <button
                  onClick={() => { navigator.clipboard.writeText(message.content || ''); setShowMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 text-gray-700"
                >
                  <Copy size={13} /> Copiar texto
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        className={cn(
          'max-w-[65%] px-3 py-2 rounded-bubble relative',
          isFromMe
            ? 'bg-wa-bubble-out text-wa-text-bubble rounded-tr-sm'
            : 'bg-wa-bubble-in text-wa-text-primary rounded-tl-sm'
        )}
      >
      {/* Media content — Imagem */}
        {message.type === 'image' && (
          <div className="mb-1 -mx-1">
            <MediaMessage
              url={currentMediaUrl || ''}
              type="image"
              caption={message.content}
              isFromMe={isFromMe}
              onRedownload={handleRedownload}
              isRedownloading={isRedownloading}
              mediaExpired={mediaExpired}
            />
            {/* Descrição IA da imagem */}
            {aiDescription && (
              <div className={cn(
                'mt-1.5 p-2 rounded-lg text-[11px] leading-relaxed',
                isFromMe
                  ? 'bg-black/5 text-[#111b21]/80'
                  : 'bg-black/5 text-wa-text-secondary'
              )}>
                <div className="flex items-center gap-1 mb-0.5 opacity-70">
                  <Eye size={10} />
                  <span className="text-[9px] font-medium uppercase tracking-wide">Visão IA</span>
                </div>
                <p>{aiDescription}</p>
              </div>
            )}
          </div>
        )}

        {/* Media content — Áudio + Transcrição */}
        {message.type === 'audio' && (
          <div className="mb-1">
            {!currentMediaUrl ? (
              <p className="text-xs opacity-50 py-1">Áudio indisponível</p>
            ) : (
              <AudioMessage
                url={currentMediaUrl}
                duration={(message.metadata as any)?.duration}
                isFromMe={isFromMe}
                onTranscribe={!displayTranscription && !isFromMe ? handleTranscribe : undefined}
              />
            )}
            {/* Transcrição do áudio (IA ou manual) */}
            {displayTranscription && (
              <div className={cn(
                'mt-1.5 p-2 rounded-lg text-[11px] leading-relaxed',
                isFromMe
                  ? 'bg-black/5 text-[#111b21]/80'
                  : 'bg-black/5 text-wa-text-secondary'
              )}>
                <div className="flex items-center gap-1 mb-0.5 opacity-70">
                  <Mic size={10} />
                  <span className="text-[9px] font-medium uppercase tracking-wide">Transcrição</span>
                </div>
                <p>{displayTranscription}</p>
              </div>
            )}
          </div>
        )}

        {/* Media content — Vídeo */}
        {message.type === 'video' && (
          <div className="mb-1 -mx-1">
            <MediaMessage
              url={currentMediaUrl || ''}
              type="video"
              caption={message.content}
              isFromMe={isFromMe}
              onRedownload={handleRedownload}
              isRedownloading={isRedownloading}
              mediaExpired={mediaExpired}
            />
          </div>
        )}

        {/* Media content — Documento */}
        {message.type === 'document' && (
          <div className="mb-1">
            <DocumentMessage
              url={currentMediaUrl || ''}
              fileName={(message.metadata as any)?.fileName || message.content || 'Documento'}
              mimeType={(message.metadata as any)?.mimeType || 'application/octet-stream'}
              isFromMe={isFromMe}
            />
          </div>
        )}

        {/* Media content — Sticker (WebP animado ou estático) */}
        {message.type === 'sticker' && currentMediaUrl && (
          <div className="mb-1">
            <MediaMessage
              url={currentMediaUrl}
              type="image"
              isFromMe={isFromMe}
              onRedownload={handleRedownload}
              isRedownloading={isRedownloading}
              mediaExpired={mediaExpired}
            />
          </div>
        )}

        {/* Media content — Localização */}
        {message.type === 'location' && (
          <div className="mb-1">
            {(() => {
              const lat = (message.metadata as any)?.latitude as number | undefined;
              const lng = (message.metadata as any)?.longitude as number | undefined;
              const locName = (message.metadata as any)?.location_name as string | undefined;
              const locAddr = (message.metadata as any)?.location_address as string | undefined;
              const mapsUrl = lat && lng
                ? `https://www.google.com/maps?q=${lat},${lng}`
                : null;
              return (
                <a
                  href={mapsUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    'flex items-start gap-2.5 rounded-xl px-3 py-2.5 max-w-65 transition-colors',
                    isFromMe
                      ? 'bg-black/5 hover:bg-black/10'
                      : 'bg-white border border-gray-100 shadow-sm hover:bg-gray-50',
                  )}
                >
                  <MapPin size={20} className={cn('mt-0.5 shrink-0', isFromMe ? 'text-green-600' : 'text-green-500')} />
                  <div className="min-w-0">
                    {locName && (
                      <p className={cn('text-[13px] font-medium truncate', isFromMe ? 'text-[#111b21]' : 'text-[#111B21]')}>
                        {locName}
                      </p>
                    )}
                    {locAddr && (
                      <p className={cn('text-[11px] truncate', isFromMe ? 'text-[#667781]' : 'text-gray-400')}>
                        {locAddr}
                      </p>
                    )}
                    {!locName && !locAddr && lat && lng && (
                      <p className={cn('text-[13px] font-medium', isFromMe ? 'text-[#111b21]' : 'text-[#111B21]')}>
                        {lat.toFixed(4)}, {lng.toFixed(4)}
                      </p>
                    )}
                    <p className={cn('text-[11px] mt-0.5', isFromMe ? 'text-[#667781]' : 'text-gray-400')}>
                      Toque para abrir no mapa
                    </p>
                  </div>
                </a>
              );
            })()}
          </div>
        )}

        {/* Text content */}
        {message.content && message.type !== 'image' && message.type !== 'video' && message.type !== 'sticker' && message.type !== 'location' && (
          <>
            <p className="text-sm wrap-break-word leading-relaxed">
              {parseMessageContent(message.content)}
            </p>
            {/* Link preview — renderiza card OG para a primeira URL encontrada no texto */}
            {(() => {
              const url = extractFirstUrl(message.content);
              return url ? <LinkPreview url={url} isFromMe={isFromMe} /> : null;
            })()}
          </>
        )}

        {/* Modo de edição inline */}
        {editMode && (
          <div className="mt-1">
            <textarea
              value={editText}
              onChange={e => setEditText(e.target.value)}
              autoFocus
              rows={2}
              className="w-full text-sm rounded-lg border border-gray-300 px-2 py-1 resize-none bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-400"
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(); }
                if (e.key === 'Escape') setEditMode(false);
              }}
            />
            <div className="flex gap-1 mt-1 justify-end">
              <button onClick={() => setEditMode(false)} className="text-[11px] px-2 py-0.5 rounded bg-gray-200 text-gray-600 hover:bg-gray-300">
                <X size={10} className="inline mr-0.5" />Cancelar
              </button>
              <button onClick={handleSaveEdit} disabled={isSavingEdit} className="text-[11px] px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50">
                {isSavingEdit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        )}

        {/* Reactions — exibe emojis abaixo da mensagem */}
        {reactions && reactions.length > 0 && (
          <div className="flex flex-wrap gap-0.5 mt-1">
            {Object.entries(
              reactions.reduce((acc, r) => {
                acc[r.emoji] = (acc[r.emoji] || 0) + 1;
                return acc;
              }, {} as Record<string, number>)
            ).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => handleReact(emoji)}
                className={cn(
                  'flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors',
                  reactions.some(r => r.from_me && r.emoji === emoji)
                    ? 'bg-blue-50 border-blue-300'
                    : 'bg-white/70 border-gray-200 hover:bg-gray-100'
                )}
              >
                <span>{emoji}</span>
                {count > 1 && <span className="text-[10px] text-gray-600">{count}</span>}
              </button>
            ))}
          </div>
        )}

        {/* Botão copy_code — renderizado para mensagens com metadata.copy_code */}
        {copyCode && (
          <div className={cn(
            'mt-2 pt-2 border-t',
            isFromMe ? 'border-black/10' : 'border-black/8'
          )}>
            <button
              onClick={() => { navigator.clipboard.writeText(copyCode).catch(() => {}); }}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-1.5 text-sm font-medium rounded-lg transition-colors',
                isFromMe
                  ? 'text-blue-600 hover:bg-black/5'
                  : 'text-blue-600 hover:bg-blue-50'
              )}
              title="Toque para copiar"
            >
              <Copy size={13} />
              <span className="font-mono text-xs">{copyCode}</span>
            </button>
          </div>
        )}

        {/* Timestamp + edited badge + status */}
        <div className={cn(
          'flex items-center gap-1 mt-1',
          isFromMe ? 'justify-end' : 'justify-end'
        )}>
          {message.edited && (
            <span className={cn(
              'flex items-center gap-0.5 text-[10px] opacity-60',
              isFromMe ? 'text-wa-text-time' : 'text-wa-text-secondary'
            )}>
              <Pencil size={9} />
              <span>editada</span>
            </span>
          )}
          <span className={cn(
            'text-[11px]',
            isFromMe ? 'text-wa-text-time' : 'text-wa-text-secondary'
          )}>
            {formatTime(message.timestamp ?? message.created_at)}
          </span>
          {statusIcon()}
        </div>

        {/* Botão de reenvio quando falhou */}
        {message.status === 'failed' && isFromMe && (
          <button
            onClick={() => onRetry?.(message)}
            className="mt-1 w-full flex items-center justify-center gap-1.5 text-[11px] text-red-500 hover:text-red-600 transition-colors"
            title="Toque para reenviar"
          >
            <RotateCcw size={11} />
            <span>Falhou · Toque para reenviar</span>
          </button>
        )}
      </div>
    </div>
  );
}

export const MessageBubble = memo(MessageBubbleComponent, (prev, next) => (
  prev.message.id === next.message.id &&
  prev.message.status === next.message.status &&
  prev.message.content === next.message.content &&
  prev.message.media_url === next.message.media_url &&
  prev.message.deleted === next.message.deleted &&
  prev.message.edited === next.message.edited &&
  (prev.message.metadata as any)?.transcription === (next.message.metadata as any)?.transcription &&
  JSON.stringify((prev.message.metadata as any)?.reactions) === JSON.stringify((next.message.metadata as any)?.reactions)
));
