'use client';

/**
 * AudioMessage.tsx
 * Player de áudio inline estilo WhatsApp Business.
 * Waveform simulada animada, play/pause, progresso em tempo real.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioMessageProps {
  url: string;
  duration?: number;
  isFromMe?: boolean;
}

// Alturas fixas da waveform (simuladas — aspecto visual idêntico ao WA)
const WAVE_HEIGHTS = [
  12, 20, 16, 24, 18, 28, 14, 22, 30, 18, 14, 26, 20, 16, 24,
  18, 12, 28, 22, 16,
];

function formatTime(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = Math.floor(s % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function AudioMessage({ url, duration, isFromMe = false }: AudioMessageProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration ?? 0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;

  const togglePlay = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || error) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      setIsLoading(true);
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setError(true);
      } finally {
        setIsLoading(false);
      }
    }
  }, [isPlaying, error]);

  const handleSeek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !totalDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * totalDuration;
    setCurrentTime(audio.currentTime);
  }, [totalDuration]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTime = () => setCurrentTime(audio.currentTime);
    const onMeta = () => setTotalDuration(audio.duration || 0);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onError = () => setError(true);

    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, []);

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-full px-3 py-2 select-none',
        'border',
        isFromMe
          ? 'bg-white/15 border-white/10'
          : 'bg-white border-gray-100 shadow-sm',
      )}
      style={{ minWidth: 210, maxWidth: 260 }}
    >
      {/* Botão play/pause */}
      <button
        onClick={togglePlay}
        disabled={error}
        aria-label={isPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          'transition-colors',
          error
            ? 'bg-gray-300 cursor-not-allowed'
            : isFromMe
              ? 'bg-white/30 hover:bg-white/50 text-white'
              : 'bg-[#25D366] hover:bg-[#1db954] text-white',
        )}
      >
        {isLoading ? (
          <span className="w-3 h-3 border-2 border-white/60 border-t-white rounded-full animate-spin" />
        ) : isPlaying ? (
          <Pause size={14} strokeWidth={2.5} />
        ) : (
          <Play size={14} strokeWidth={2.5} className="ml-0.5" />
        )}
      </button>

      {/* Waveform + seek */}
      <div
        className="flex-1 flex items-center gap-[2px] h-7 cursor-pointer"
        onClick={handleSeek}
        role="slider"
        aria-label="Progresso do áudio"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {WAVE_HEIGHTS.map((h, i) => {
          const barProgress = i / WAVE_HEIGHTS.length;
          const active = barProgress <= progress;
          return (
            <div
              key={i}
              className={cn(
                'flex-1 rounded-full transition-colors duration-75',
                active
                  ? isFromMe ? 'bg-white/80' : 'bg-[#25D366]'
                  : isFromMe ? 'bg-white/30' : 'bg-gray-300',
              )}
              style={{ height: h }}
            />
          );
        })}
      </div>

      {/* Duração */}
      <span
        className={cn(
          'text-[11px] flex-shrink-0 w-9 text-right tabular-nums',
          isFromMe ? 'text-white/70' : 'text-gray-500',
        )}
      >
        {error ? 'Erro' : formatTime(isPlaying ? currentTime : totalDuration)}
      </span>

      <audio ref={audioRef} src={url} preload="metadata" />
    </div>
  );
}
