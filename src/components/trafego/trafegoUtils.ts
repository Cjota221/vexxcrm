'use client';

import { useAuthStore } from '@/store/auth';

export function authFetch(url: string, options?: RequestInit): Promise<Response> {
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

export function brl(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function brl2(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
}

export function n0(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

export function pct(v: number): string {
  return v.toFixed(1) + '%';
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  if (isToday) return `hoje às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
  return formatDate(iso);
}

export function formatAudienceSize(lower?: number, upper?: number): string {
  if (!lower && !upper) return 'Tamanho desconhecido';
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  if (lower && upper) return `~${fmt(lower)} – ${fmt(upper)} pessoas`;
  return `~${fmt(lower || upper || 0)} pessoas`;
}

export function formatTamanhoEstimado(min?: number, max?: number, texto?: string): string {
  if (texto && texto !== 'Estimativa indisponível' && texto !== 'Calculando...') return texto;
  if (!min && !max) return 'Calculando...';
  const fmt = (n: number) => n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n);
  if (min && max) return `~${fmt(min)} – ${fmt(max)} pessoas`;
  return `~${fmt(min || max || 0)} pessoas`;
}

export function getSazonalidade(): { status: string; recomendacao: string; proximaData: string; dica: string } {
  const mes = new Date().getMonth() + 1; // 1-12
  if (mes >= 10 || mes <= 3) {
    return {
      status: '🔥 ALTA — Temporada de verão para rasteirinhas',
      recomendacao: 'Aumentar verba 20-30% nas campanhas de atacado',
      proximaData: mes >= 11 ? 'Black Friday (novembro) — começar campanha agora' :
                   mes === 12 ? 'Natal (25 dez) — últimas peças do ano' :
                   mes <= 2   ? 'Carnaval (fevereiro) — produto em alta' :
                   'Dia das Mães (maio) — começar em 2 semanas',
      dica: 'Rasteirinhas coloridas e de tiras finas têm alta busca no verão',
    };
  }
  return {
    status: '❄️ BAIXA — Inverno, foco em branding',
    recomendacao: 'Reduzir verba em campanhas de volume, manter remarketing',
    proximaData: mes <= 5 ? 'Dia das Mães (maio) — oportunidade premium' :
                 'Dia dos Pais (agosto) — campanha de marca própria',
    dica: 'Período ideal para captar franqueadas C4 — elas planejam para o verão',
  };
}
