import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/admin/migrate-022?secret=vexx2024migrate
 * Aplica a migration 022 — adiciona coluna config JSONB na tabela tenants.
 * Usa service_role key para executar DDL via RPC.
 */
export async function GET(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret');
  if (secret !== 'vexx2024migrate') {
    return NextResponse.json({ error: 'Proibido' }, { status: 403 });
  }

  const supabase = createServerSupabaseClient();

  const statements = [
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cnpj TEXT DEFAULT NULL`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_email TEXT DEFAULT NULL`,
    `ALTER TABLE tenants ADD COLUMN IF NOT EXISTS contact_phone TEXT DEFAULT NULL`,
  ];

  const results: { sql: string; ok: boolean; note?: string }[] = [];

  for (const sql of statements) {
    const { error } = await supabase.rpc('exec_sql', { query: sql });
    if (error) {
      if (error.message?.includes('already exists') || error.message?.includes('já existe')) {
        results.push({ sql: sql.substring(0, 70), ok: true, note: 'já existia' });
      } else if (error.message?.includes('Could not find the function') || error.message?.includes('function exec_sql')) {
        results.push({ sql: sql.substring(0, 70), ok: false, note: 'RPC exec_sql não existe — use o SQL abaixo no Supabase Dashboard' });
      } else {
        results.push({ sql: sql.substring(0, 70), ok: false, note: error.message });
      }
    } else {
      results.push({ sql: sql.substring(0, 70), ok: true });
    }
  }

  const allOk = results.every(r => r.ok);

  return NextResponse.json({
    success: allOk,
    results,
    // Se falhou, fornecer o SQL completo para copiar e colar no Supabase Dashboard
    manual_sql: allOk ? null : statements.join(';\n') + ';',
  });
}
