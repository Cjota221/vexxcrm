import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

/**
 * POST /api/auth/logout
 * Encerra sessão do Supabase Auth.
 */
export async function POST() {
  try {
    await supabase.auth.signOut();
    return NextResponse.json({ message: 'Logout realizado com sucesso' });
  } catch {
    return NextResponse.json(
      { error: 'Erro ao fazer logout' },
      { status: 500 }
    );
  }
}
