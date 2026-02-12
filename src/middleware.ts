import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * Middleware Next.js — Proteção de rotas e validação de sessão.
 * 
 * Rotas protegidas:
 * - /dashboard/* — requer autenticação
 * - /api/* (exceto /api/auth, /api/webhooks) — requer autenticação
 * 
 * Rotas públicas:
 * - /login, /register, /forgot-password
 * - /api/auth/*
 * - /api/webhooks/*
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── ROTAS PÚBLICAS ───
  const isAuthPage = pathname.startsWith('/login') || 
                     pathname.startsWith('/register') || 
                     pathname.startsWith('/forgot-password');
  
  const isPublicApiRoute = pathname.startsWith('/api/auth') || 
                           pathname.startsWith('/api/webhooks');

  // ─── VERIFICAR SESSÃO ───
  const token = request.cookies.get('sb-access-token')?.value || 
                request.headers.get('Authorization')?.replace('Bearer ', '');

  let isAuthenticated = false;
  let tenantId: string | null = null;

  if (token) {
    try {
      const supabase = createServerSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (!error && user) {
        // Buscar tenant_id do profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('tenant_id')
          .eq('id', user.id)
          .single();

        if (profile) {
          isAuthenticated = true;
          tenantId = profile.tenant_id;
        }
      }
    } catch {
      // Token inválido ou erro de rede
      isAuthenticated = false;
    }
  }

  // ─── PROTEÇÃO DE ROTAS DO DASHBOARD ───
  if (pathname.startsWith('/dashboard') || pathname === '/') {
    if (!isAuthenticated) {
      // Redirecionar para login
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
    // Usuário autenticado — permitir acesso
    return NextResponse.next();
  }

  // ─── PROTEÇÃO DE ROTAS DA API ───
  if (pathname.startsWith('/api') && !isPublicApiRoute) {
    if (!isAuthenticated || !tenantId) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      );
    }

    // Injetar tenant_id no header para uso nas API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-tenant-id', tenantId);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  // ─── PÁGINAS DE AUTH (login, register) ───
  if (isAuthPage && isAuthenticated) {
    // Usuário já autenticado tentando acessar /login — redirecionar para dashboard
    return NextResponse.redirect(new URL('/', request.url));
  }

  // ─── ROTAS PÚBLICAS E NÃO PROTEGIDAS ───
  return NextResponse.next();
}

/**
 * Configuração de matcher — Define quais rotas o middleware deve processar.
 * Exclui _next/static, _next/image, favicon.ico, e arquivos estáticos.
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder (images, etc)
     */
    '/((?!_next/static|_next/image|favicon.ico|images/).*)',
  ],
};
