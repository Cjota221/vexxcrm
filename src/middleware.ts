import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * Middleware Next.js — Proteção de rotas e validação de sessão.
 * 
 * IMPORTANTE: Como o Supabase armazena tokens no localStorage (client-side),
 * o middleware não consegue validar sessões server-side de forma confiável.
 * 
 * Estratégia adotada:
 * - Middleware NÃO bloqueia rotas de dashboard (proteção no client-side)
 * - Middleware SÓ protege rotas de API que precisam de tenant_id
 * - Páginas verificam autenticação via useAuth hook
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── ROTAS PÚBLICAS ───
  const isAuthPage = pathname.startsWith('/login') ||
                     pathname.startsWith('/forgot-password');
  
  const isPublicApiRoute = pathname.startsWith('/api/auth') ||
                           pathname.startsWith('/api/webhooks') ||
                           pathname.startsWith('/api/sse') ||
                           pathname.startsWith('/api/debug') ||
                           pathname.startsWith('/api/og') ||
                           pathname.startsWith('/api/import') ||
                           pathname.startsWith('/api/meta/leads') ||
                           pathname.startsWith('/api/catalogo/config') ||   // catálogo público — sem login
                           pathname.startsWith('/api/catalogo/produtos');   // catálogo público — sem login

  // ─── PROTEÇÃO APENAS DE ROTAS DE API (não rotas de página) ───
  if (pathname.startsWith('/api') && !isPublicApiRoute) {
    // SSE usa query param ?token= pois EventSource não suporta headers customizados
    const token =
      request.headers.get('Authorization')?.replace('Bearer ', '') ||
      request.nextUrl.searchParams.get('token') ||
      '';

    if (!token) {
      return NextResponse.json(
        { error: 'Token não fornecido' },
        { status: 401 }
      );
    }

    try {
      const supabase = createServerSupabaseClient();
      const { data: { user }, error } = await supabase.auth.getUser(token);

      if (error || !user) {
        return NextResponse.json(
          { error: 'Token inválido ou expirado' },
          { status: 401 }
        );
      }

      // Buscar tenant_id do profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .single();

      if (!profile?.tenant_id) {
        return NextResponse.json(
          { error: 'Tenant não encontrado' },
          { status: 403 }
        );
      }

      // Injetar tenant_id e user_id nos headers para uso nas API routes
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set('x-tenant-id', profile.tenant_id);
      requestHeaders.set('x-user-id', user.id);

      return NextResponse.next({
        request: {
          headers: requestHeaders,
        },
      });
    } catch {
      return NextResponse.json(
        { error: 'Erro ao validar token' },
        { status: 500 }
      );
    }
  }

  // ─── TODAS AS OUTRAS ROTAS (páginas) PASSAM LIVREMENTE ───
  // A proteção de autenticação é feita no client-side via useAuth
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
