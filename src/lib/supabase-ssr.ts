import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Cria um cliente Supabase SSR que lê a sessão do usuário via cookies.
 * Use este cliente quando precisar de auth.getUser() em Server Components
 * ou Route Handlers do App Router. Usa a anon key + cookies (não bypassa RLS).
 */
export async function createServerClientFromCookies() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Route Handlers podem ignorar set em cookies de resposta
          }
        },
      },
    }
  );
}
