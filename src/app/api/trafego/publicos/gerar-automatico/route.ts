import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';

/* ─── Helper ─────────────────────────────────────────────────────────────── */

function sha256(value: string): string {
  return createHash('sha256').update(value.toLowerCase().trim()).digest('hex');
}

/**
 * Remove todos os públicos do mesmo tipo do tenant e insere um novo.
 * Simula upsert sem precisar de UNIQUE constraint na tabela.
 */
async function replacePublico(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  payload: Record<string, unknown>,
) {
  await supabase
    .from('meta_publicos_aprovados')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('tipo', payload.tipo as string);

  const { error } = await supabase.from('meta_publicos_aprovados').insert(payload);
  if (error) console.warn('[gerar-automatico] insert error:', error.message);
}

/* ─── Route ──────────────────────────────────────────────────────────────── */

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { tipo: 'frio' | 'quente' | 'lookalike' };
    const { tipo } = body;

    if (!['frio', 'quente', 'lookalike'].includes(tipo)) {
      return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json(
        { error: 'Meta não configurado. Configure token e ad account em Configurações.' },
        { status: 400 },
      );
    }

    const token = config.meta_access_token;
    const accountId = config.meta_ad_account_id.startsWith('act_')
      ? config.meta_ad_account_id
      : `act_${config.meta_ad_account_id}`;

    // ── PÚBLICO FRIO — interesses aplicados direto no adset ───────────────
    // NÃO cria Custom Audience. Salva o targeting no banco para o agente usar.
    if (tipo === 'frio') {
      // 1. Buscar interesses aprovados na biblioteca
      const { data: interesses } = await supabase
        .from('meta_interests_biblioteca')
        .select('id, nome')
        .eq('aprovado_jarvis', true)
        .eq('ativo', true)
        .order('audiencia_global', { ascending: false })
        .limit(8);

      let interessesFinais: Array<{ id: string; nome: string }> = interesses ?? [];

      // 2. Se biblioteca vazia, buscar na Meta API e salvar
      if (interessesFinais.length < 3) {
        const keywords = [
          'rasteirinha',
          'moda feminina',
          'calçados femininos',
          'revenda moda',
          'atacado moda',
        ];
        const encontrados: Array<{ id: string; nome: string; audiencia_global?: number }> = [];

        for (const kw of keywords) {
          try {
            const res = await fetch(
              `${META_BASE}/search?type=adinterest&q=${encodeURIComponent(kw)}&limit=5&locale=pt_BR&access_token=${token}`,
              { signal: AbortSignal.timeout(8000) },
            );
            if (!res.ok) continue;
            const data = await res.json() as {
              data?: Array<{ id: string; name: string; audience_size?: number }>;
            };
            for (const i of data.data ?? []) {
              encontrados.push({ id: i.id, nome: i.name, audiencia_global: i.audience_size });
            }
          } catch { continue; }
        }

        // Deduplicar por ID
        const unicos = Array.from(
          new Map(encontrados.map(i => [i.id, i])).values(),
        ).slice(0, 8);

        if (unicos.length > 0) {
          await supabase.from('meta_interests_biblioteca').upsert(
            unicos.map(i => ({
              id:              i.id,
              nome:            i.nome,
              categoria:       'revendedoras',
              audiencia_global: i.audiencia_global ?? null,
              ativo:           true,
              aprovado_jarvis: true,
              justificativa:   'Auto-aprovado pelo Jarvis para público frio CJ',
              sincronizado_em: new Date().toISOString(),
            })),
            { onConflict: 'id' },
          );
          interessesFinais = unicos.map(i => ({ id: i.id, nome: i.nome }));
        }
      }

      // 3. Montar targeting completo — vai direto no adset quando campanha for criada
      const targeting = {
        geo_locations: { countries: ['BR'] },
        age_min: 25,
        age_max: 50,
        genders: [2], // mulheres
        ...(interessesFinais.length > 0
          ? {
              flexible_spec: [{
                interests: interessesFinais.map(i => ({ id: i.id, name: i.nome })),
              }],
            }
          : {}),
      };

      await replacePublico(supabase, profile.tenant_id, {
        tenant_id:     profile.tenant_id,
        nome:          'CJ — Público Frio Revendedoras',
        tipo:          'frio',
        meta_audience_id: null,
        status:        'publicado',
        targeting,
        interest_ids:  interessesFinais.map(i => i.id),
        criado_por_ia: true,
      });

      return NextResponse.json({
        ok:                true,
        nome:              'CJ — Público Frio Revendedoras',
        tipo:              'frio',
        interesses_usados: interessesFinais.map(i => i.nome),
        nota:              'Targeting salvo — será aplicado direto no adset ao criar campanha.',
      });
    }

    // ── PÚBLICO QUENTE — Custom Audience de engajamento de vídeo ─────────
    // Cria Custom Audience via API com vídeos da conta Meta.
    if (tipo === 'quente') {
      // 1. Buscar vídeos na conta Meta
      let videoIds: string[] = [];

      try {
        const videosRes = await fetch(
          `${META_BASE}/${accountId}/advideos?fields=id,title&limit=20&access_token=${token}`,
          { signal: AbortSignal.timeout(10000) },
        );
        if (videosRes.ok) {
          const videosData = await videosRes.json() as { data?: Array<{ id: string }> };
          videoIds = (videosData.data ?? []).slice(0, 10).map(v => v.id);
        }
      } catch { /* fallback abaixo */ }

      // 2. Fallback: meta_video_id dos criativos no banco
      if (videoIds.length === 0) {
        const { data: criativos } = await supabase
          .from('ad_creatives')
          .select('meta_video_id')
          .eq('tenant_id', profile.tenant_id)
          .eq('tipo', 'video')
          .not('meta_video_id', 'is', null)
          .limit(10);

        videoIds = (criativos ?? [])
          .map(c => c.meta_video_id as string)
          .filter(Boolean);
      }

      if (videoIds.length === 0) {
        return NextResponse.json(
          {
            error:
              'Nenhum vídeo encontrado na conta Meta. Faça upload de pelo menos 1 vídeo na aba Criativos antes de criar público quente.',
          },
          { status: 400 },
        );
      }

      // 3. Criar Custom Audience ENGAGEMENT com rule de visualização de vídeo
      // Formato legado exigido pela Meta: todos os vídeos em event_sources de UMA rule só,
      // usando video_time_percentage (≥25%) em vez de video_time (segundos).
      const rule = {
        inclusions: {
          operator: 'or',
          rules: [
            {
              event_sources: videoIds.map(id => ({ id, type: 'video' })),
              retention_seconds: 2592000, // 30 dias
              filter: {
                operator: 'and',
                filters: [
                  { field: 'video_time_percentage', operator: 'gte', value: '0.25' }, // ≥ 25%
                ],
              },
            },
          ],
        },
      };

      const params = new URLSearchParams();
      params.set('name',    'CJ — Público Quente Vídeos 30d');
      params.set('subtype', 'ENGAGEMENT');
      params.set('rule',    JSON.stringify(rule));
      params.set('prefill', '1');
      params.set('access_token', token);

      const res = await fetch(`${META_BASE}/${accountId}/customaudiences`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
        signal:  AbortSignal.timeout(15000),
      });
      const data = await res.json() as {
        id?: string;
        error?: { message?: string; error_user_msg?: string; code?: number };
      };

      if (!res.ok || !data.id) {
        const isTosError =
          data.error?.code === 200 ||
          (data.error?.message ?? '').toLowerCase().includes('terms') ||
          (data.error?.message ?? '').toLowerCase().includes('tos');

        return NextResponse.json(
          {
            error: isTosError
              ? 'Aceite os Termos de Custom Audiences no Meta Ads Manager: Configurações da conta → Custom Audiences → Aceitar termos.'
              : (data.error?.error_user_msg ?? data.error?.message ?? 'Erro ao criar público quente'),
          },
          { status: 502 },
        );
      }

      await replacePublico(supabase, profile.tenant_id, {
        tenant_id:        profile.tenant_id,
        nome:             'CJ — Público Quente Vídeos 30d',
        tipo:             'quente',
        meta_audience_id: data.id,
        status:           'publicado',
        targeting:        { custom_audiences: [{ id: data.id }] },
        interest_ids:     [],
        criado_por_ia:    true,
      });

      return NextResponse.json({
        ok:             true,
        nome:           'CJ — Público Quente Vídeos 30d',
        meta_audience_id: data.id,
        tipo:           'quente',
        videos_usados:  videoIds.length,
        nota:           'O Meta leva até 30 minutos para popular este público.',
      });
    }

    // ── LOOKALIKE — baseado em lista de clientes hasheada ─────────────────
    // Cria Custom Audience (customer list) + Lookalike 1% BR.
    if (tipo === 'lookalike') {
      // 1. Verificar mínimo de clientes
      const { count } = await supabase
        .from('clients')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', profile.tenant_id);

      if (!count || count < 100) {
        return NextResponse.json(
          {
            error: `Mínimo de 100 clientes necessário para criar Lookalike. Você tem ${count ?? 0} cliente(s) no CRM.`,
          },
          { status: 400 },
        );
      }

      // 2. Buscar clientes e hashear com SHA-256
      const { data: clientes } = await supabase
        .from('clients')
        .select('phone, email')
        .eq('tenant_id', profile.tenant_id)
        .limit(500);

      // Separar por tipo de dado disponível (schema deve ser uniforme por batch)
      const phoneRows: string[][] = [];
      const emailOnlyRows: string[][] = [];

      for (const c of clientes ?? []) {
        const rawPhone = (c.phone ?? '').replace(/\D/g, '');
        if (rawPhone.length >= 10) {
          // Prefixo 55 obrigatório para telefones brasileiros antes do hash SHA-256
          const normalizedPhone = rawPhone.startsWith('55') ? rawPhone : `55${rawPhone}`;
          phoneRows.push([sha256(normalizedPhone)]);
        } else if (c.email?.includes('@')) {
          emailOnlyRows.push([sha256(c.email)]);
        }
      }

      const totalValidos = phoneRows.length + emailOnlyRows.length;
      if (totalValidos < 100) {
        return NextResponse.json(
          {
            error: `Apenas ${totalValidos} clientes válidos (com phone ou email). Mínimo 100 necessário.`,
          },
          { status: 400 },
        );
      }

      // 3. Criar Custom Audience de origem (customer list)
      const caParams = new URLSearchParams();
      caParams.set('name',                 'CJ — Base Clientes para Lookalike');
      caParams.set('subtype',              'CUSTOM');
      caParams.set('customer_file_source', 'USER_PROVIDED_ONLY');
      caParams.set('access_token',         token);

      const caRes = await fetch(`${META_BASE}/${accountId}/customaudiences`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    caParams.toString(),
        signal:  AbortSignal.timeout(15000),
      });
      const caData = await caRes.json() as {
        id?: string;
        error?: { message?: string; code?: number };
      };

      if (!caRes.ok || !caData.id) {
        const isTosError = caData.error?.code === 200;
        return NextResponse.json(
          {
            error: isTosError
              ? 'Aceite os Termos de Custom Audiences no Meta Ads Manager: Configurações da conta → Custom Audiences → Aceitar termos.'
              : (caData.error?.message ?? 'Erro ao criar base de clientes'),
          },
          { status: 502 },
        );
      }

      // 4. Adicionar usuários hasheados — dois batches (phone e email separados)
      if (phoneRows.length > 0) {
        await fetch(`${META_BASE}/${caData.id}/users`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            payload:      { schema: ['PHONE'], data: phoneRows },
            access_token: token,
          }),
          signal: AbortSignal.timeout(30000),
        });
      }

      if (emailOnlyRows.length > 0) {
        await fetch(`${META_BASE}/${caData.id}/users`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            payload:      { schema: ['EMAIL'], data: emailOnlyRows },
            access_token: token,
          }),
          signal: AbortSignal.timeout(30000),
        });
      }

      // 5. Criar Lookalike 1% BR a partir da base de clientes
      const laParams = new URLSearchParams();
      laParams.set('name',               'CJ — Lookalike 1% Compradores BR');
      laParams.set('subtype',            'LOOKALIKE');
      laParams.set('origin_audience_id', caData.id);
      laParams.set('lookalike_spec',     JSON.stringify({
        ratio:   0.01,
        country: 'BR',
        type:    'similarity',
      }));
      laParams.set('access_token', token);

      const laRes = await fetch(`${META_BASE}/${accountId}/customaudiences`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    laParams.toString(),
        signal:  AbortSignal.timeout(15000),
      });
      const laData = await laRes.json() as {
        id?: string;
        error?: { message?: string };
      };

      if (!laRes.ok || !laData.id) {
        return NextResponse.json(
          { error: laData.error?.message ?? 'Erro ao criar Lookalike' },
          { status: 502 },
        );
      }

      // 6. Salvar ambos no banco
      // Base de clientes como 'retargeting' (pode ser usada para remarketing)
      await replacePublico(supabase, profile.tenant_id, {
        tenant_id:        profile.tenant_id,
        nome:             'CJ — Base Clientes para Lookalike',
        tipo:             'retargeting',
        meta_audience_id: caData.id,
        status:           'publicado',
        targeting:        { custom_audiences: [{ id: caData.id }] },
        interest_ids:     [],
        criado_por_ia:    true,
      });

      // Lookalike como 'lookalike'
      await replacePublico(supabase, profile.tenant_id, {
        tenant_id:        profile.tenant_id,
        nome:             'CJ — Lookalike 1% Compradores BR',
        tipo:             'lookalike',
        meta_audience_id: laData.id,
        status:           'publicado',
        targeting:        { custom_audiences: [{ id: laData.id }] },
        interest_ids:     [],
        criado_por_ia:    true,
      });

      return NextResponse.json({
        ok:               true,
        nome:             'CJ — Lookalike 1% Compradores BR',
        meta_audience_id: laData.id,
        tipo:             'lookalike',
        contatos_enviados: totalValidos,
        nota:             'O Meta leva 1-6 horas para processar o Lookalike.',
      });
    }

    return NextResponse.json({ error: 'tipo inválido' }, { status: 400 });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
