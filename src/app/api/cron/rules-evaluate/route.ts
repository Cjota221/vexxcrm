import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';

/**
 * GET /api/cron/rules-evaluate
 * Avalia e executa regras automáticas de todos os tenants com Meta configurado.
 * Chamado pelo Netlify Scheduled Functions a cada 6 horas.
 */
export async function GET(req: NextRequest) {
  // Segurança: verificar que é chamada interna do Netlify
  const authHeader = req.headers.get('x-netlify-function-secret');
  const netlifySecret = process.env.NETLIFY_FUNCTION_SECRET;
  if (netlifySecret && authHeader !== netlifySecret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();

  // Buscar todos os tenants com Meta configurado e que têm regras ativas
  const { data: tenants } = await supabase
    .from('ai_provider_config')
    .select('tenant_id, meta_access_token, meta_ad_account_id')
    .not('meta_access_token', 'is', null)
    .not('meta_ad_account_id', 'is', null);

  if (!tenants?.length) return NextResponse.json({ skipped: true, reason: 'Nenhum tenant com Meta configurado' });

  let totalExecutadas = 0;
  const resultados: Record<string, number> = {};

  for (const tenant of tenants) {
    try {
      // Verificar se o tenant tem regras ativas antes de chamar
      const { count } = await supabase
        .from('meta_automation_rules')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenant.tenant_id)
        .eq('ativa', true);

      if (!count) continue;

      // Delegar para o endpoint de regras usando fetch interno
      const baseUrl = process.env.NEXTAUTH_URL || process.env.URL || 'http://localhost:3000';
      const res = await fetch(`${baseUrl}/api/trafego/rules/evaluate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Usar service role para contornar auth no cron
          'x-cron-secret': process.env.CRON_SECRET || '',
        },
      });

      if (res.ok) {
        const json = await res.json() as { executadas?: number };
        const exec = json.executadas || 0;
        totalExecutadas += exec;
        resultados[tenant.tenant_id] = exec;
      }
    } catch (err) {
      console.error(`[rules-evaluate] Erro no tenant ${tenant.tenant_id}:`, err);
    }
  }

  return NextResponse.json({ ok: true, totalExecutadas, resultados });
}
