import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

type Params = Promise<{ id: string }>;

/**
 * POST /api/v2/campanhas/[id]/iniciar
 *
 * Muda o status da campanha para "running".
 * O front-end é responsável por chamar /dispatch-batch em loop
 * para processar os jobs com delays anti-ban entre cada chamada.
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

    console.log(`[INICIAR_CAMPANHA] Campanha "${campanha.name}" (${id}) → running com ${jobsPendentes} jobs`);

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
