import type { ApiResponse } from '@/types';

/**
 * Base URL da API interna do Next.js.
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || '';

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

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const json = await response.json();

      if (!response.ok) {
        return {
          data: null as T,
          error: json.error || `HTTP ${response.status}: ${response.statusText}`,
        };
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
