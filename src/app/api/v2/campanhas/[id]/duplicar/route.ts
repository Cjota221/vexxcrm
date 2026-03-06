import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { criarJobsCampanha } from '@/lib/services/campaign-dispatcher';

type Params = Promise<{ id: string }>;

/**
 * POST /api/v2/campanhas/[id]/duplicar
 *
 * Clona uma campanha existente como rascunho (status: draft).
 * Copia blocos e destinatários originais, zera contadores de envio.
 * Não inicia o disparo — usuário deve disparar manualmente.
 */
export async function POST(request: NextRequest, { params }: { params: Params }) {
  try {
    const { profile } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const { id: campanhaId } = await params;

    // Buscar campanha original (apenas do tenant correto)
    const { data: original, error: errOriginal } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campanhaId)
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (errOriginal || !original) {
      return NextResponse.json({ error: 'Campanha não encontrada' }, { status: 404 });
    }

    // Gerar nome da cópia
    const nomeCopia = `${original.name} (cópia)`;

    // Criar nova campanha como rascunho
    const { data: nova, error: errNova } = await supabase
      .from('campaigns')
      .insert({
        tenant_id: profile.tenant_id,
        created_by: profile.id,
        name: nomeCopia,
        type: original.type ?? 'broadcast',
        status: 'draft',
        template_id: original.template_id ?? null,
        blocos_snapshot: original.blocos_snapshot ?? original.messages ?? [],
        messages: original.messages ?? original.blocos_snapshot ?? [],
        destinatarios: original.destinatarios ?? 0,
        tipo_destinatario: original.tipo_destinatario ?? 'contatos',
        config_antiban: original.config_antiban ?? null,
        origem: original.origem ?? null,
        origem_grupo_nome: original.origem_grupo_nome ?? null,
        sent_count: 0,
        failed_count: 0,
      })
      .select('id, name, status')
      .single();

    if (errNova || !nova) {
      console.error('[DUPLICAR_CAMPANHA]', errNova);
      return NextResponse.json({ error: errNova?.message ?? 'Erro ao criar cópia' }, { status: 500 });
    }

    // Copiar os jobs da campanha original (destinatários)
    const { data: jobsOriginais } = await supabase
      .from('campaign_jobs')
      .select('contato_id, contato_telefone, contato_nome, blocos, ordem')
      .eq('campanha_id', campanhaId)
      .order('ordem', { ascending: true })
      .limit(5000);

    if (jobsOriginais && jobsOriginais.length > 0) {
      const destinatarios = jobsOriginais.map(j => ({
        id: j.contato_id ?? j.contato_telefone,
        telefone: j.contato_telefone,
        nome: j.contato_nome,
      }));

      const blocos = original.blocos_snapshot ?? original.messages ?? [];

      await criarJobsCampanha(
        supabase,
        nova.id,
        profile.tenant_id,
        destinatarios,
        blocos
      );
    }

    return NextResponse.json({
      campanha_id: nova.id,
      name: nova.name,
      status: nova.status,
    }, { status: 201 });

  } catch (err) {
    console.error('[DUPLICAR_CAMPANHA_UNEXPECTED]', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
