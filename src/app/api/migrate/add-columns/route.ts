import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/migrate/add-columns
 * 
 * Rota para adicionar colunas faltantes (cpf, birthday) à tabela clients.
 * Requer DATABASE_URL no .env ou aceita via body.
 * Usa o driver 'pg' para executar DDL diretamente.
 */
export async function POST(request: NextRequest) {
  try {
    // Aceitar DATABASE_URL via body ou env
    let dbUrl = process.env.DATABASE_URL || '';
    
    try {
      const body = await request.json();
      if (body?.database_url) dbUrl = body.database_url;
    } catch {
      // body vazio, usa env
    }

    if (!dbUrl) {
      return NextResponse.json({
        status: 'needs_database_url',
        message: 'Forneça DATABASE_URL. Encontre em: Supabase Dashboard → Settings → Database → Connection string (URI)',
        example: 'postgresql://postgres:SUA_SENHA@db.qjjflshqdaapwneeirdq.supabase.co:5432/postgres',
        howTo: 'POST /api/migrate/add-columns com body: { "database_url": "postgresql://..." }',
      }, { status: 400 });
    }

    // Importar pg dinamicamente
    const { Client } = await import('pg');
    const client = new Client({ 
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });

    await client.connect();

    const sqls = [
      'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS cpf VARCHAR(14)',
      'ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS birthday DATE',
      'CREATE INDEX IF NOT EXISTS idx_clients_cpf ON public.clients(tenant_id, cpf) WHERE cpf IS NOT NULL',
    ];

    const results: string[] = [];
    for (const sql of sqls) {
      try {
        await client.query(sql);
        results.push(`✅ ${sql.substring(0, 60)}...`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push(`⚠️ ${sql.substring(0, 40)}... → ${msg}`);
      }
    }

    // Verificar
    const verify = await client.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'clients' AND column_name IN ('cpf', 'birthday')"
    );

    await client.end();

    const existingCols = verify.rows.map((r: { column_name: string }) => r.column_name);

    return NextResponse.json({
      status: existingCols.length === 2 ? 'success' : 'partial',
      message: existingCols.length === 2
        ? 'Colunas cpf e birthday criadas com sucesso!'
        : `Apenas ${existingCols.join(', ')} encontrada(s)`,
      results,
      columns_found: existingCols,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json(
      { status: 'error', error: msg },
      { status: 500 }
    );
  }
}
