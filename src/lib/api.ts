import { supabase } from './supabase';
import type { ApiResponse } from '@/types';

/**
 * Base URL da API interna do Next.js.
 * Usa string vazia para rotas relativas (mesma origem).
 */
const API_BASE_URL = '';

/**
 * Classe helper para requisições à API.
 * Adiciona automaticamente headers e trata erros.
 */
class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Faz uma requisição fetch com headers padrão.
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    // Buscar token da sessão ativa do Supabase
    let accessToken: string | null = null;
    if (typeof window !== 'undefined') {
      try {
        // Tentar getSession primeiro (rápido, usa cache)
        const { data: { session } } = await supabase.auth.getSession();
        accessToken = session?.access_token || null;

        // Se session veio null, pode ser que o token ainda não foi hidratado.
        // Tentar refreshSession para forçar a leitura do storage.
        if (!accessToken) {
          const { data: refreshed } = await supabase.auth.refreshSession();
          accessToken = refreshed?.session?.access_token || null;
        }
      } catch (err) {
        console.error('❌ Erro ao obter sessão do Supabase:', err);
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    // Adicionar Authorization header se tiver token
    if (accessToken) {
      headers['Authorization'] = `Bearer ${accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Verificar se a resposta é JSON antes de parsear
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        const text = await response.text();
        console.error('❌ API retornou não-JSON:', response.status, text.substring(0, 200));
        return {
          data: null as T,
          error: `Erro ${response.status}: servidor retornou resposta inesperada`,
        };
      }

      const json = await response.json();

      if (!response.ok) {
        return {
          data: null as T,
          error: json.error || `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      // Se a resposta tem estrutura paginada, retornar o JSON inteiro para que os hooks
      // possam acessar o envelope completo (pagination, total, page, etc.).
      // Suporta dois formatos:
      //   - { data, pagination }  → usado por /api/chats e /api/messages
      //   - { data, total, page } → usado por outras rotas legadas
      if (
        json &&
        typeof json === 'object' &&
        'data' in json &&
        ('pagination' in json || ('total' in json && 'page' in json))
      ) {
        return { data: json as T };
      }

      return { data: json.data ?? json };
    } catch (error) {
      return {
        data: null as T,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  /** GET request */
  async get<T>(endpoint: string, params?: Record<string, string>): Promise<ApiResponse<T>> {
    const searchParams = params ? `?${new URLSearchParams(params)}` : '';
    return this.request<T>(`${endpoint}${searchParams}`, { method: 'GET' });
  }

  /** POST request */
  async post<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /** PUT request */
  async put<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /** PATCH request */
  async patch<T>(endpoint: string, body?: unknown): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  /** DELETE request */
  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

/** Instância singleton do API Client */
export const api = new ApiClient(API_BASE_URL);
