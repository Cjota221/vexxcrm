import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { REGRA_DA_CAROL } from '@/lib/services/campaign-dispatcher';

/**
 * GET /api/v2/campanhas/volume-check
 * 
 * Verifica se o tenant pode enviar mais mensagens nas próximas 24h.
 * Retorna:
 * - enviados_hoje: número de envios já feitos hoje
 * - limite_diario: máximo permitido (200 pela Regra da Carol)
 * - pode_enviar: boolean
 * - restantes: quantos ainda pode enviar
 * - risco: nível de risco ('safe' | 'warning' | 'danger')
 */
export async function GET(request: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    // Buscar envios hoje via RPC
    let enviadosHoje = 0;
    try {
      const { data } = await supabase.rpc('get_daily_send_count', {
        p_tenant_id: profile.tenant_id,
      });
      enviadosHoje = data ?? 0;
    } catch {
      // Fallback: contar diretamente dos campaign_jobs
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .from('campaign_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', profile.tenant_id)
        .eq('status', 'enviado')
        .gte('enviado_em', hoje.toISOString());
      enviadosHoje = count ?? 0;
    }

    const limiteDiario = REGRA_DA_CAROL.MAX_ENVIOS_24H;
    const restantes = Math.max(0, limiteDiario - enviadosHoje);
    const podeEnviar = restantes > 0;
    const percentual = (enviadosHoje / limiteDiario) * 100;

    let risco: 'safe' | 'warning' | 'danger' = 'safe';
    if (percentual >= 100) risco = 'danger';
    else if (percentual >= 75) risco = 'warning';

    return NextResponse.json({
      enviados_hoje: enviadosHoje,
      limite_diario: limiteDiario,
      pode_enviar: podeEnviar,
      restantes,
      risco,
      percentual: Math.round(percentual),
      regra: {
        delay_min_s: REGRA_DA_CAROL.DELAY_MIN_MS / 1000,
        cooloff_a_cada: REGRA_DA_CAROL.COOLOFF_A_CADA,
        cooloff_duracao_s: REGRA_DA_CAROL.COOLOFF_DURACAO_MS / 1000,
        janela: `${REGRA_DA_CAROL.JANELA_INICIO}h–${REGRA_DA_CAROL.JANELA_FIM}h`,
      },
    });
  } catch (err) {
    console.error('[VOLUME_CHECK]', err);
    return NextResponse.json({ error: 'Erro ao verificar volume' }, { status: 500 });
  }
}
