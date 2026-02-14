import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';
import { executeSentinelaFullScan } from '@/lib/services/customer-health';

/**
 * POST /api/sentinela/scan
 * Executa varredura completa da base de clientes.
 * Calcula health score e classificação para todos os clientes do tenant.
 */
export async function POST(request: NextRequest) {
  try {
    const authorization = request.headers.get('Authorization');
    if (!authorization) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authorization.replace('Bearer ', '');
    const supabaseAuth = createAuthenticatedClient(token);
    const supabase = createServerSupabaseClient();

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile?.tenant_id) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 403 });
    }

    console.log('🔍 Sentinela: Iniciando varredura para tenant', profile.tenant_id);

    const result = await executeSentinelaFullScan(supabase, profile.tenant_id);

    console.log(`✅ Sentinela: ${result.totalProcessados} clientes processados em ${result.tempoExecucao}`);
    console.log('📊 Distribuição:', JSON.stringify(result.distribuicao));

    return NextResponse.json({ data: result });
  } catch (error: unknown) {
    console.error('❌ Sentinela scan error:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
