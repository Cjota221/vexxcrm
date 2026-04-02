'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

async function getAuthHeader(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token ? `Bearer ${session.access_token}` : '';
}

export interface AdCreativeClassificacao {
  tipo_conteudo: string;
  tom: string;
  tem_cta: boolean;
  cta_texto?: string;
  adequacao_publico_frio: number;
  adequacao_publico_quente: number;
  adequacao_whatsapp: number;
  palavras_chave: string[];
  resumo: string;
  recomendacao_uso: string;
}

export interface AdCreative {
  id: string;
  nome: string;
  tipo: 'video' | 'imagem';
  meta_video_id: string | null;
  meta_image_hash: string | null;
  url_preview: string | null;
  tamanho_bytes: number | null;
  duracao_segundos: number | null;
  judite_nota: number | null;
  judite_veredicto: string | null;
  judite_aprovado: boolean | null;
  status: 'processando' | 'pronto' | 'arquivado' | 'erro';
  em_uso_em: number;
  created_at: string;
  transcricao_status?: 'pendente' | 'processando' | 'concluida' | 'erro' | 'sem_audio';
  classificacao?: AdCreativeClassificacao | null;
  transcricao_erro?: string | null;
}

export function useAdCreatives() {
  const [criativos, setCriativos]         = useState<AdCreative[]>([]);
  const [loading, setLoading]             = useState(true);
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const auth = await getAuthHeader();
      const res = await fetch('/api/meta/upload', {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const data = await res.json() as AdCreative[];
        setCriativos(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  async function uploadArquivo(
    file: File,
    nome?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    setUploading(true);
    setUploadProgress(0);

    try {
      // Extrair duração do vídeo no browser antes de enviar
      let duracao: number | undefined;
      if (file.type.startsWith('video/')) {
        duracao = await extrairDuracaoVideo(file);
      }

      const form = new FormData();
      form.append('file', file);
      form.append('nome', nome || file.name);
      if (duracao) form.append('duracao', String(Math.round(duracao)));

      // XMLHttpRequest para barra de progresso real
      const auth = await getAuthHeader();
      const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
        const xhr = new XMLHttpRequest();

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            // 90% = upload concluído, 10% restantes = processamento no Meta
            setUploadProgress(Math.round((e.loaded / e.total) * 90));
          }
        };

        xhr.onload = () => {
          setUploadProgress(100);
          try {
            const data = JSON.parse(xhr.responseText) as { ok?: boolean; error?: string };
            resolve({ ok: data.ok ?? false, error: data.error });
          } catch {
            resolve({ ok: false, error: 'Erro ao processar resposta' });
          }
        };

        xhr.onerror = () => resolve({ ok: false, error: 'Erro de rede' });

        xhr.open('POST', '/api/meta/upload');
        xhr.setRequestHeader('Authorization', auth);
        xhr.send(form);
      });

      if (result.ok) await carregar();
      return result;
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function arquivar(id: string) {
    const auth = await getAuthHeader();
    await fetch(`/api/meta/upload/${id}`, {
      method: 'DELETE',
      headers: { Authorization: auth },
    });
    await carregar();
  }

  async function retranscrever(id: string) {
    const auth = await getAuthHeader();
    await fetch('/api/meta/transcricao', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ criativoId: id }),
    });

    // Polling por 30s para atualizar status
    let tentativas = 0;
    const intervalo = setInterval(async () => {
      tentativas++;
      await carregar();
      if (tentativas >= 10) clearInterval(intervalo);
    }, 3000);
  }

  return {
    criativos,
    loading,
    uploading,
    uploadProgress,
    uploadArquivo,
    arquivar,
    retranscrever,
    recarregar: carregar,
  };
}

function extrairDuracaoVideo(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(video.src);
      resolve(video.duration || 0);
    };
    video.onerror = () => resolve(0);
    video.src = URL.createObjectURL(file);
  });
}
