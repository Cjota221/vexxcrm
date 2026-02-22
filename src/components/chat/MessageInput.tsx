'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Paperclip, Smile, Mic, X, Image, FileText, Video, Loader2, Zap, Square, MapPin, Coins, User, ChevronUp, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { TemplatesFloatingPanel } from './TemplatesFloatingPanel';

/* ── Emoji picker data ── */
const EMOJI_CATEGORIES = [
  {
    label: '😀 Rostos',
    emojis: ['😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐','😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿'],
  },
  {
    label: '👋 Gestos',
    emojis: ['👋','🤚','🖐','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴','👀','👁','👅','👄'],
  },
  {
    label: '❤️ Amor',
    emojis: ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','💕','💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉','✡️','🛐','🔯','♈','♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','⛎','🆔','⚛️','🉑','☢️','☣️','📴','📳','🈶','🈚','🈸','🈺','🈷️','✴️','🆚','💮','🉐','㊙️','㊗️','🈴','🈵','🈹','🈲','🅰️','🅱️','🆎','🆑','🅾️','🆘','❌','⭕','🛑','⛔','📛','🚫','💯','💢','♨️','🚷','🚯','🚳','🚱','🔞','📵','🔕'],
  },
  {
    label: '🎉 Celebração',
    emojis: ['🎉','🎊','🎈','🎁','🎀','🎗️','🎟️','🎫','🎖️','🏆','🥇','🥈','🥉','🏅','🎗','🏵️','🎪','🤹','🎭','🎨','🖼','🎬','🎤','🎧','🎼','🎵','🎶','🎷','🎸','🎹','🎺','🎻','🪕','🥁','🪘','🎙️','📻','📺','📷','📸','📹','🎥','📽','🎞','📞','☎️','📟','📠','📡','🔋','🪫','🔌','💡','🔦','🕯️','🪔','💰','💴','💵','💶','💷','💸','💳','🪙','💹','✉️'],
  },
  {
    label: '🛍️ Compras',
    emojis: ['🛍️','🛒','💼','👜','👛','👝','🎒','🧳','👓','🕶️','🥽','🌂','☂️','🧵','🪡','🧶','🪢','👒','🎩','🪖','⛑️','👑','💍','💎','👗','👘','🥻','🩱','🩲','🩳','👙','👚','👛','👜','👝','🎒','🧳','👞','👟','🥾','🥿','👠','👡','🩰','👢','🧤','🧣','🎓','⛷️','🏋️','🤸','🏊','🚴','🏇','🧘'],
  },
  {
    label: '📦 E-commerce',
    emojis: ['📦','📫','📬','📭','📮','📯','📰','🗞️','📄','📃','📑','📊','📈','📉','📋','📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗄️','🗑️','🔒','🔓','🔏','🔐','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🔫','🪃','🛡️','🪚','🔧','🪛','🔩','⚙️','🗜️','⚖️','🦯','🔗','⛓️','🪝','🧲','🪜','💊','💉','🩸','🩹','🩺','🩻','🚪','🛗','🪞','🪟','🛏️','🛋️','🪑','🚽','🪠','🚿','🛁'],
  },
] as const;

interface MessageInputProps {
  onSend: (content: string) => void;
  onSendMedia?: (file: File, caption: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  /** Telefone do destinatário — necessário para envio de templates multi-bubble */
  recipientPhone?: string;
  /** Nome do cliente — usado na mensagem Pix */
  recipientName?: string;
  /** ID do cliente — passado ao enviar Pix para salvar na conversa correta */
  clientId?: string;
}

const ACCEPTED_TYPES: Record<string, string> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/ogg': 'audio',
  'audio/wav': 'audio',
  'application/pdf': 'document',
  'application/msword': 'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
};

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB

/**
 * Input de mensagem com auto-resize estilo WhatsApp + envio de mídia.
 */
export function MessageInput({ onSend, onSendMedia, isLoading, disabled, recipientPhone, recipientName, clientId }: MessageInputProps) {
  const [text, setText] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [emojiCategory, setEmojiCategory] = useState(0);
  const [pixModalOpen, setPixModalOpen] = useState(false);
  const [pixKey, setPixKey] = useState('');
  const [pixKeyType, setPixKeyType] = useState<'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'>('aleatoria');
  const [pixAmount, setPixAmount] = useState('');
  const [pixName, setPixName] = useState('');
  const [pixIsSending, setPixIsSending] = useState(false);
  const [pixSendResult, setPixSendResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [copyCodeOpen, setCopyCodeOpen] = useState(false);
  const [copyCodeValue, setCopyCodeValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileDocInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

  // ── Audio recording state ──
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto resize
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  // Cleanup file preview URL
  useEffect(() => {
    return () => {
      if (filePreview) URL.revokeObjectURL(filePreview);
    };
  }, [filePreview]);

  // Ao abrir o modal Pix: pré-preencher com a chave salva nas configurações do tenant
  useEffect(() => {
    if (!pixModalOpen) return;
    setPixSendResult(null);
    api.get<{ pix?: { key?: string; keyType?: string; holderName?: string } }>('/api/tenants/config')
      .then(({ data }) => {
        const pix = data?.pix;
        if (pix?.key) {
          setPixKey(pix.key);
          setPixKeyType((pix.keyType as 'email' | 'cnpj' | 'cpf' | 'telefone' | 'aleatoria') || 'aleatoria');
          setPixName(pix.holderName || recipientName || '');
        }
      })
      .catch(() => {/* silent — usuário pode preencher manualmente */});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pixModalOpen]);

  // Fechar menu de anexos ao clicar fora
  useEffect(() => {
    if (!attachMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target as Node)) {
        setAttachMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [attachMenuOpen]);

  // Fechar emoji picker ao clicar fora
  useEffect(() => {
    if (!emojiOpen) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setEmojiOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [emojiOpen]);

  // Inserir emoji na posição do cursor no textarea
  const insertEmoji = useCallback((emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText(prev => prev + emoji);
      return;
    }
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const newText = text.slice(0, start) + emoji + text.slice(end);
    setText(newText);
    // Reposicionar cursor após o emoji
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = start + emoji.length;
      textarea.setSelectionRange(pos, pos);
    });
  }, [text]);

  // Escuta evento vexx:open-chat para focar o input e opcionalmente preencher texto
  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent<{ suggestedText?: string }>;
      // Pequeno delay para garantir que o chat já esteja selecionado
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          if (evt.detail?.suggestedText) {
            setText(evt.detail.suggestedText);
          }
        }
      }, 100);
    };
    window.addEventListener('vexx:open-chat', handler);
    return () => window.removeEventListener('vexx:open-chat', handler);
  }, []);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [text, onSend, isLoading, disabled]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_FILE_SIZE) {
      alert('Arquivo muito grande. Máximo 16MB.');
      return;
    }

    const mediaType = ACCEPTED_TYPES[file.type];
    if (!mediaType) {
      alert('Tipo de arquivo não suportado. Envie imagens, vídeos, áudios ou documentos.');
      return;
    }

    setSelectedFile(file);
    setCaption('');

    // Gerar preview para imagens
    if (mediaType === 'image') {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview(null);
    }

    // Limpar input
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, []);

  const handleSendMedia = useCallback(() => {
    if (!selectedFile || isLoading || disabled) return;
    if (onSendMedia) {
      onSendMedia(selectedFile, caption);
    }
    setSelectedFile(null);
    setFilePreview(null);
    setCaption('');
  }, [selectedFile, caption, onSendMedia, isLoading, disabled]);

  const handleCancelFile = useCallback(() => {
    setSelectedFile(null);
    setFilePreview(null);
    setCaption('');
  }, []);

  // Enviar localização atual via texto formatado
  const handleSendLocation = useCallback(() => {
    setAttachMenuOpen(false);
    if (!navigator.geolocation) {
      alert('Seu navegador não suporta geolocalização.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const mapsUrl = `https://maps.google.com/?q=${latitude},${longitude}`;
        onSend(`📍 *Localização compartilhada*\n${mapsUrl}`);
      },
      () => {
        alert('Não foi possível obter sua localização. Verifique as permissões do navegador.');
      }
    );
  }, [onSend]);

  // Envia Pix como card de contato vCard — WhatsApp renderiza com botão "Copiar chave Pix"
  const handleSendPix = useCallback(async () => {
    if (!pixKey.trim() || !recipientPhone) return;
    setPixIsSending(true);
    setPixSendResult(null);
    try {
      const { data, error } = await api.post('/api/whatsapp/send', {
        to: recipientPhone,
        type: 'pix',
        content: `Chave Pix: ${pixKey.trim()}`,   // fallback para histórico
        pixKey: pixKey.trim(),
        pixKeyType,
        holderName: pixName.trim() || undefined,
        pixOrganization: pixName.trim() || undefined,
        clientId: clientId || undefined,
      });
      if (error) throw new Error(error);
      setPixSendResult({ ok: true, msg: '✅ Chave Pix enviada com sucesso!' });
      // Fechar modal após 1.5s
      setTimeout(() => {
        setPixModalOpen(false);
        setPixKey('');
        setPixAmount('');
        setPixName('');
        setPixSendResult(null);
      }, 1500);
    } catch (err) {
      setPixSendResult({ ok: false, msg: `❌ ${err instanceof Error ? err.message : 'Erro ao enviar'}` });
    } finally {
      setPixIsSending(false);
    }
  }, [pixKey, pixKeyType, pixName, pixAmount, recipientPhone, clientId]);

  // Envia botão copy_code via Evolution API /message/sendButtons
  const handleSendCopyCode = useCallback(async () => {
    if (!copyCodeValue.trim() || !recipientPhone) return;
    try {
      const { error } = await api.post('/api/whatsapp/send', {
        to: recipientPhone,
        type: 'copy_code',
        content: text.trim() || '📋 Toque para copiar seu código:',
        copyCode: copyCodeValue.trim(),
        clientId: clientId || undefined,
      });
      if (error) throw new Error(error);
      setCopyCodeOpen(false);
      setCopyCodeValue('');
      setText('');
    } catch (err) {
      alert(`Erro ao enviar: ${err instanceof Error ? err.message : 'tente novamente'}`);
    }
  }, [copyCodeValue, recipientPhone, text, clientId]);

  // ── Audio recording handlers ──
  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/ogg; codecs=opus')
          ? 'audio/ogg; codecs=opus'
          : MediaRecorder.isTypeSupported('audio/webm; codecs=opus')
            ? 'audio/webm; codecs=opus'
            : 'audio/webm',
      });

      audioChunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder.mimeType || 'audio/ogg';
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        // Normalizar MIME — remover parâmetros como "; codecs=opus"
        const baseMime = mimeType.split(';')[0].trim();
        const ext = baseMime.includes('ogg') ? 'ogg' : baseMime.includes('mp4') ? 'm4a' : 'webm';
        const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: baseMime });

        // Parar todas as tracks do stream
        stream.getTracks().forEach(track => track.stop());

        if (file.size > 0 && onSendMedia) {
          onSendMedia(file, '');
        }
      };

      mediaRecorder.start(250); // coleta a cada 250ms
      setIsRecording(true);
      setRecordingTime(0);

      // Timer para mostrar duração
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error('[MessageInput] Erro ao acessar microfone:', err);
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  }, [onSendMedia]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  const cancelRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Remove o handler antes de parar para evitar envio
      mediaRecorderRef.current.onstop = () => {
        mediaRecorderRef.current?.stream?.getTracks().forEach(track => track.stop());
      };
      mediaRecorderRef.current.stop();
    }
    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream?.getTracks().forEach(track => track.stop());
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const formatRecordingTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // "/" no início do campo abre painel de templates
    if (e.key === '/' && !text && !e.shiftKey && recipientPhone) {
      e.preventDefault();
      setTemplatesOpen(true);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (selectedFile) {
        handleSendMedia();
      } else {
        handleSend();
      }
    }
  };

  // File attachment preview mode
  if (selectedFile) {
    const mediaType = ACCEPTED_TYPES[selectedFile.type] || 'document';
    const TypeIcon = mediaType === 'image' ? Image : mediaType === 'video' ? Video : FileText;

    return (
      <div className="bg-wa-bg-panel border-t border-wa-border px-4 py-3 space-y-3">
        {/* Preview */}
        <div className="flex items-start gap-3 bg-wa-bg-input rounded-xl p-3">
          {filePreview ? (
            <img
              src={filePreview}
              alt="Preview"
              className="w-20 h-20 rounded-lg object-cover shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-lg bg-wa-bg-hover flex items-center justify-center shrink-0">
              <TypeIcon size={24} className="text-wa-text-secondary" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-wa-text-primary font-medium truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-wa-text-secondary">
              {(selectedFile.size / 1024).toFixed(0)} KB · {mediaType}
            </p>
          </div>
          <button
            onClick={handleCancelFile}
            className="p-1.5 text-wa-text-secondary hover:text-red-500 transition-colors rounded-full hover:bg-wa-bg-hover shrink-0"
          >
            <X size={18} />
          </button>
        </div>

        {/* Caption + Send */}
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-wa-bg-input rounded-xl px-4 py-2">
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Adicione uma legenda..."
              className="w-full bg-transparent text-sm text-wa-text-primary placeholder:text-wa-text-secondary outline-none"
              autoFocus
            />
          </div>
          <button
            onClick={handleSendMedia}
            disabled={isLoading || disabled}
            className={cn(
              'p-2.5 rounded-full transition-colors',
              'bg-wa-accent-green text-white hover:opacity-90',
              (isLoading || disabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Send size={20} />}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative bg-wa-bg-panel border-t border-wa-border px-2 py-2 md:px-4 md:py-3">
      {/* ── Templates Floating Panel ── */}
      {templatesOpen && recipientPhone && (
        <TemplatesFloatingPanel
          recipientPhone={recipientPhone}
          onClose={() => setTemplatesOpen(false)}
        />
      )}

      {/* ── Modal Pix ── */}
      {pixModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-50 backdrop-blur-sm"
            onClick={() => setPixModalOpen(false)}
          />
          <div className="fixed inset-0 z-51 flex items-end sm:items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
              <div className="px-5 py-4 bg-linear-to-r from-crm-primary to-[#0a2540] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins size={18} className="text-white" />
                  <h3 className="text-sm font-bold text-white">Compartilhar Chave Pix</h3>
                </div>
                <button onClick={() => setPixModalOpen(false)} className="p-1 hover:bg-white/20 rounded-lg">
                  <X size={16} className="text-white" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                {/* Tipo de chave */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Tipo de chave</label>
                  <select
                    value={pixKeyType}
                    onChange={e => setPixKeyType(e.target.value as typeof pixKeyType)}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  >
                    <option value="cpf">CPF</option>
                    <option value="cnpj">CNPJ</option>
                    <option value="email">E-mail</option>
                    <option value="telefone">Telefone</option>
                    <option value="aleatoria">Chave aleatória</option>
                  </select>
                </div>
                {/* Chave */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Chave Pix</label>
                  <input
                    type="text"
                    value={pixKey}
                    onChange={e => setPixKey(e.target.value)}
                    placeholder={
                      pixKeyType === 'cpf' ? '000.000.000-00' :
                      pixKeyType === 'cnpj' ? '00.000.000/0000-00' :
                      pixKeyType === 'email' ? 'email@exemplo.com' :
                      pixKeyType === 'telefone' ? '+55 (11) 99999-9999' :
                      'Cole a chave aleatória aqui'
                    }
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                    autoFocus
                  />
                </div>
                {/* Titular (opcional) */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Titular <span className="text-gray-300">(opcional)</span></label>
                  <input
                    type="text"
                    value={pixName}
                    onChange={e => setPixName(e.target.value)}
                    placeholder={recipientName || 'Nome do recebedor'}
                    className="w-full text-sm border border-gray-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-crm-primary/30"
                  />
                </div>
                {/* Valor (opcional) */}
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Valor <span className="text-gray-300">(opcional)</span></label>
                  <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-crm-primary/30">
                    <span className="px-3 text-sm text-gray-400 bg-gray-50 border-r border-gray-200 py-2">R$</span>
                    <input
                      type="text"
                      value={pixAmount}
                      onChange={e => setPixAmount(e.target.value.replace(/[^0-9,.]/g, ''))}
                      placeholder="0,00"
                      className="flex-1 text-sm px-3 py-2 focus:outline-none bg-transparent"
                    />
                  </div>
                </div>

                {/* Aviso: envio como card nativo */}
                <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-xl">
                  <Coins size={13} className="text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-700">
                    Enviado como <strong>card de contato</strong> — o WhatsApp exibe o botão nativo "Copiar chave Pix".
                  </p>
                </div>

                {/* Resultado do envio */}
                {pixSendResult && (
                  <div className={`p-3 rounded-xl text-sm font-medium ${pixSendResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {pixSendResult.msg}
                  </div>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={() => setPixModalOpen(false)}
                    className="flex-1 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleSendPix}
                    disabled={!pixKey.trim() || pixIsSending || pixSendResult?.ok}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold text-white bg-crm-primary rounded-xl hover:bg-[#163058] disabled:opacity-40"
                  >
                    {pixIsSending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    {pixIsSending ? 'Enviando...' : 'Enviar Pix'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <div className="flex items-end gap-2">
        {/* ── Emoji Picker ── */}
        <div ref={emojiPickerRef} className="relative">
          <button
            onClick={() => setEmojiOpen(v => !v)}
            className={cn(
              'p-1.5 md:p-2 transition-colors rounded-full',
              emojiOpen
                ? 'text-amber-500 bg-amber-50'
                : 'text-wa-text-secondary hover:text-wa-text-primary hover:bg-wa-bg-hover'
            )}
            title="Emojis"
          >
            <Smile size={20} />
          </button>

          {emojiOpen && (
            <div className="absolute bottom-12 left-0 z-50 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-in slide-in-from-bottom-2 duration-150">
              {/* Abas de categoria */}
              <div className="flex border-b border-gray-100 overflow-x-auto scrollbar-none">
                {EMOJI_CATEGORIES.map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => setEmojiCategory(i)}
                    className={cn(
                      'px-3 py-2 text-sm shrink-0 transition-colors',
                      emojiCategory === i
                        ? 'border-b-2 border-amber-500 text-amber-600'
                        : 'text-gray-400 hover:text-gray-600'
                    )}
                  >
                    {cat.label.split(' ')[0]}
                  </button>
                ))}
              </div>
              {/* Grid de emojis */}
              <div className="grid grid-cols-8 gap-0.5 p-2 max-h-48 overflow-y-auto">
                {EMOJI_CATEGORIES[emojiCategory].emojis.map((emoji, i) => (
                  <button
                    key={i}
                    onClick={() => insertEmoji(emoji)}
                    className="w-8 h-8 flex items-center justify-center text-lg rounded-lg hover:bg-gray-100 transition-colors"
                    title={emoji}
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Menu de Anexos ── */}
        <div ref={attachMenuRef} className="relative">
          <button
            onClick={() => setAttachMenuOpen(v => !v)}
            className={cn(
              'p-1.5 md:p-2 transition-colors rounded-full',
              attachMenuOpen
                ? 'text-crm-primary bg-blue-50'
                : 'text-wa-text-secondary hover:text-wa-text-primary hover:bg-wa-bg-hover'
            )}
            title="Anexar"
          >
            <Paperclip size={20} />
          </button>

          {/* Popup do menu */}
          {attachMenuOpen && (
            <div className="absolute bottom-12 left-0 z-40 flex flex-col gap-1 bg-white rounded-2xl shadow-2xl border border-gray-100 p-2 w-52 animate-in slide-in-from-bottom-2 duration-150">
              {/* Imagem / Vídeo */}
              <button
                onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left w-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center shrink-0">
                  <Image size={16} className="text-purple-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Fotos e Vídeos</p>
                  <p className="text-[10px] text-gray-400">JPG, PNG, MP4...</p>
                </div>
              </button>

              {/* Documento */}
              <button
                onClick={() => { setAttachMenuOpen(false); fileDocInputRef.current?.click(); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left w-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
                  <FileText size={16} className="text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Documento</p>
                  <p className="text-[10px] text-gray-400">PDF, Word, Excel...</p>
                </div>
              </button>

              {/* Localização */}
              <button
                onClick={handleSendLocation}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left w-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <MapPin size={16} className="text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Localização</p>
                  <p className="text-[10px] text-gray-400">Enviar minha localização</p>
                </div>
              </button>

              {/* Chave Pix */}
              <button
                onClick={() => { setAttachMenuOpen(false); setPixName(recipientName || ''); setPixModalOpen(true); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left w-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                  <Coins size={16} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Chave Pix</p>
                  <p className="text-[10px] text-gray-400">Compartilhar dados de pagamento</p>
                </div>
              </button>

              {/* Botão Copiar Código */}
              <button
                onClick={() => { setAttachMenuOpen(false); setCopyCodeOpen(v => !v); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 text-left w-full transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center shrink-0">
                  <Copy size={16} className="text-teal-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">Copiar Código</p>
                  <p className="text-[10px] text-gray-400">Cupom, código de rastreio...</p>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Input files ocultos */}
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          accept="image/*,video/*"
          className="hidden"
        />
        <input
          ref={fileDocInputRef}
          type="file"
          onChange={handleFileSelect}
          accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar"
          className="hidden"
        />

        {/* Templates ⚡ */}
        {recipientPhone && (
          <button
            onClick={() => setTemplatesOpen(v => !v)}
            title="Respostas rápidas (/)"
            className={cn(
              'p-1.5 md:p-2 transition-colors rounded-full',
              templatesOpen
                ? 'text-amber-500 bg-amber-50'
                : 'text-wa-text-secondary hover:text-amber-500 hover:bg-wa-bg-hover'
            )}
          >
            <Zap size={20} />
          </button>
        )}

        {/* Input */}
        <div className="flex-1 bg-wa-bg-input rounded-xl px-3 py-1.5 md:px-4 md:py-2">
          {/* Painel inline copy_code */}
          {copyCodeOpen && (
            <div className="flex items-center gap-2 mb-1.5 pb-1.5 border-b border-wa-border">
              <Copy size={13} className="text-teal-600 shrink-0" />
              <input
                type="text"
                value={copyCodeValue}
                onChange={e => setCopyCodeValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSendCopyCode(); } if (e.key === 'Escape') { setCopyCodeOpen(false); setCopyCodeValue(''); } }}
                placeholder="Código (ex: VEXX20)"
                className="flex-1 bg-transparent text-sm font-mono text-wa-text-primary placeholder:text-wa-text-secondary outline-none"
                autoFocus
              />
              {copyCodeValue.trim() && (
                <button
                  onClick={handleSendCopyCode}
                  className="p-1 rounded-full bg-teal-600 hover:bg-teal-700 transition-colors"
                  title="Enviar código"
                >
                  <Send size={12} className="text-white" />
                </button>
              )}
              <button
                onClick={() => { setCopyCodeOpen(false); setCopyCodeValue(''); }}
                className="p-1 text-wa-text-secondary hover:text-red-400 rounded-full transition-colors"
                title="Cancelar"
              >
                <X size={13} />
              </button>
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={copyCodeOpen ? 'Texto da mensagem (opcional)' : 'Digite uma mensagem'}
            rows={1}
            disabled={disabled}
            className="w-full bg-transparent text-sm text-wa-text-primary placeholder:text-wa-text-secondary outline-none resize-none max-h-24 md:max-h-28"
          />
        </div>

        {/* Send / Mic */}
        {text.trim() ? (
          <button
            onClick={handleSend}
            disabled={isLoading || disabled}
            className={cn(
              'p-2.5 rounded-full transition-colors',
              'bg-wa-accent-green text-white hover:opacity-90',
              (isLoading || disabled) && 'opacity-50 cursor-not-allowed'
            )}
          >
            <Send size={20} />
          </button>
        ) : isRecording ? (
          /* ── Modo gravação ── */
          <div className="flex items-center gap-2">
            <span className="text-xs text-red-500 font-medium animate-pulse flex items-center gap-1">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              {formatRecordingTime(recordingTime)}
            </span>
            <button
              onClick={cancelRecording}
              className="p-2 text-red-400 hover:text-red-600 transition-colors rounded-full hover:bg-red-50"
              title="Cancelar gravação"
            >
              <X size={18} />
            </button>
            <button
              onClick={stopRecording}
              className="p-2.5 rounded-full bg-wa-accent-green text-white hover:opacity-90 transition-colors"
              title="Enviar áudio"
            >
              <Send size={20} />
            </button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            disabled={disabled || !onSendMedia}
            className={cn(
              'p-2 text-wa-text-secondary hover:text-wa-text-primary transition-colors rounded-full hover:bg-wa-bg-hover',
              (disabled || !onSendMedia) && 'opacity-50 cursor-not-allowed'
            )}
            title="Gravar áudio"
          >
            <Mic size={22} />
          </button>
        )}
      </div>
    </div>
  );
}
