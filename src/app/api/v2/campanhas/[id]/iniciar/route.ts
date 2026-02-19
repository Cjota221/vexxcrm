import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/**
 * POST /api/v2/campanhas/[id]/iniciar
 *
 * Muda o status da campanha para "running" e dispara o processador
 * de fila via chamada assíncrona ao cron interno (fire-and-forget).
 *
 * O front-end chama este endpoint após criar a campanha (status draft)
 * e o usuário clicar em "Disparar Agora".
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id } = await params;

    // Verificar que a campanha pertence ao tenant e está em estado disparável
    const { data: campanha, error: errBusca } = await supabase
      .from('campaigns')
      .select('id, status, destinatarios, name')
      .eq('id', id)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (errBusca || !campanha) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    if (!['draft', 'scheduled', 'paused'].includes(campanha.status)) {
      return NextResponse.json(
        { error: `Campanha não pode ser iniciada com status "${campanha.status}"` },
        { status: 400 }
      );
    }

    // Verificar se há jobs pendentes
    const { count: jobsPendentes } = await supabase
      .from('campaign_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('campanha_id', id)
      .eq('status', 'pendente');

    if (!jobsPendentes || jobsPendentes === 0) {
      return NextResponse.json(
        { error: 'Nenhum job pendente encontrado. Verifique os destinatários da campanha.' },
        { status: 400 }
      );
    }

    // Mudar status para running
    const { error: errUpdate } = await supabase
      .from('campaigns')
      .update({
        status: 'running',
        status_detalhe: 'Iniciado manualmente',
        started_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (errUpdate) {
      return NextResponse.json({ error: errUpdate.message }, { status: 500 });
    }

    // Fire-and-forget: acionar o dispatcher via cron endpoint interno
    // Não aguardamos o resultado (o disparo é longo e rodaria em background)
    const baseUrl = process.env.NEXTAUTH_URL
      || process.env.NEXT_PUBLIC_APP_URL
      || request.headers.get('origin')
      || 'https://vexxcrm.netlify.app';

    const cronSecret = process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_KEY || '';

    // Não await — disparo assíncrono em background
    fetch(`${baseUrl}/api/cron/campaign-dispatcher`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cronSecret}`,
      },
      body: JSON.stringify({ campanha_id: id, tenant_id: profile.tenant_id }),
    }).catch(err => {
      console.error('[INICIAR_CAMPANHA] Erro ao acionar dispatcher:', err);
    });

    return NextResponse.json({
      success: true,
      campanha_id: id,
      status: 'running',
      jobs_pendentes: jobsPendentes,
      mensagem: `Campanha "${campanha.name}" iniciada com ${jobsPendentes} destinatários.`,
    });

  } catch (err) {
    console.error('[INICIAR_CAMPANHA_UNEXPECTED]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
