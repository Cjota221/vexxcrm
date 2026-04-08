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
  is_pinned: boolean;
  status: 'processando' | 'pronto' | 'arquivado' | 'erro';
  em_uso_em: number;
  created_at: string;
  transcricao_status?: 'pendente' | 'processando' | 'concluida' | 'erro' | 'sem_audio';
  classificacao?: AdCreativeClassificacao | null;
  transcricao_erro?: string | null;
}

const PAGE_SIZE = 20;

export function useAdCreatives() {
  const [criativos, setCriativos]         = useState<AdCreative[]>([]);
  const [total, setTotal]                 = useState(0);
  const [page, setPage]                   = useState(1);
  const [loading, setLoading]             = useState(true);
  const [loadingMore, setLoadingMore]     = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const carregar = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const auth = await getAuthHeader();
      const res = await fetch(`/api/meta/upload?page=1&limit=${PAGE_SIZE}`, {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const { data, total: t } = await res.json() as { data: AdCreative[]; total: number };
        setCriativos(data);
        setTotal(t);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const carregarMais = useCallback(async () => {
    setLoadingMore(true);
    try {
      const nextPage = page + 1;
      const auth = await getAuthHeader();
      const res = await fetch(`/api/meta/upload?page=${nextPage}&limit=${PAGE_SIZE}`, {
        headers: { Authorization: auth },
      });
      if (res.ok) {
        const { data, total: t } = await res.json() as { data: AdCreative[]; total: number };
        setCriativos(prev => [...prev, ...data]);
        setTotal(t);
        setPage(nextPage);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  useEffect(() => { carregar(); }, [carregar]);

  async function uploadArquivo(
    file: File,
    nome?: string,
  ): Promise<{ ok: boolean; error?: string }> {
    setUploading(true);
    setUploadProgress(0);
    const nomeArquivo = nome || file.name;
    const isVideo = file.type.startsWith('video/');

    try {
      let duracao: number | undefined;
      if (isVideo) duracao = await extrairDuracaoVideo(file);

      const auth = await getAuthHeader();

      if (isVideo) {
        // Vídeos: upload direto browser → Meta (evita limite 6MB do Netlify)
        const cfgRes = await fetch('/api/meta/upload/config', {
          headers: { Authorization: auth },
        });
        if (!cfgRes.ok) {
          const e = await cfgRes.json() as { error?: string };
          return { ok: false, error: e.error ?? 'Erro ao obter credenciais' };
        }
        const { token, adAccountId } = await cfgRes.json() as { token: string; adAccountId: string };

        const META_BASE = 'https://graph.facebook.com/v21.0';

        // Upload do vídeo direto para o Meta com barra de progresso
        const { videoId, error: uploadError } = await new Promise<{ videoId?: string; error?: string }>((resolve) => {
          const form = new FormData();
          form.append('source', file, nomeArquivo);
          form.append('title', nomeArquivo);
          form.append('access_token', token);

          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 90));
          };
          xhr.onload = () => {
            try {
              const data = JSON.parse(xhr.responseText) as { id?: string; error?: { message: string } };
              if (data.id) resolve({ videoId: data.id });
              else resolve({ error: data.error?.message ?? `HTTP ${xhr.status}` });
            } catch {
              resolve({ error: 'Resposta inválida do Meta' });
            }
          };
          xhr.onerror = () => resolve({ error: 'Erro de rede' });
          xhr.open('POST', `${META_BASE}/${adAccountId}/advideos`);
          xhr.send(form);
        });

        if (!videoId) return { ok: false, error: uploadError };

        // Buscar thumbnail
        setUploadProgress(95);
        let thumbUrl: string | undefined;
        try {
          const thumbRes = await fetch(
            `${META_BASE}/${videoId}?fields=thumbnails&access_token=${token}`
          );
          if (thumbRes.ok) {
            const t = await thumbRes.json() as { thumbnails?: { data: Array<{ uri: string; is_preferred?: boolean }> } };
            const pref = t.thumbnails?.data?.find(x => x.is_preferred);
            thumbUrl = pref?.uri ?? t.thumbnails?.data?.[0]?.uri;
          }
        } catch { /* thumbnail é opcional */ }

        // Salvar no banco
        const saveRes = await fetch('/api/meta/upload/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({
            nome: nomeArquivo,
            tipo: 'video',
            metaVideoId: videoId,
            thumbUrl,
            tamanhoBytes: file.size,
            duracaoSegundos: duracao ? Math.round(duracao) : undefined,
          }),
        });

        setUploadProgress(100);
        const saveData = await saveRes.json() as { ok?: boolean; error?: string };
        if (saveData.ok) { await carregar(); return { ok: true }; }
        return { ok: false, error: saveData.error };

      } else {
        // Imagens: continua via servidor (< 6MB)
        const form = new FormData();
        form.append('file', file);
        form.append('nome', nomeArquivo);

        const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 90));
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
      }
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

  async function fixar(id: string) {
    const auth = await getAuthHeader();
    const res = await fetch(`/api/meta/criativos/${id}/pin`, {
      method: 'PATCH',
      headers: { Authorization: auth },
    });
    if (res.ok) {
      const { is_pinned } = await res.json() as { is_pinned: boolean };
      // Atualiza estado local sem recarregar tudo: desafixar todos, fixar o alvo
      setCriativos(prev => prev.map(c => ({
        ...c,
        is_pinned: c.id === id ? is_pinned : (is_pinned ? false : c.is_pinned),
      })));
    }
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
    total,
    hasMore: criativos.length < total,
    loading,
    loadingMore,
    uploading,
    uploadProgress,
    uploadArquivo,
    arquivar,
    fixar,
    retranscrever,
    recarregar: carregar,
    carregarMais,
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
