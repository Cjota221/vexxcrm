import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { META_BASE } from '@/lib/meta-config';
import Anthropic from '@anthropic-ai/sdk';

const KEYWORDS_POR_TIPO = {
  frio: [
    'rasteirinha', 'sandália feminina', 'calçados femininos',
    'moda feminina', 'atacado moda', 'revenda roupas',
    'empreendedorismo feminino', 'renda extra', 'sacoleira',
    'revendedora', 'moda praia', 'lojista atacado',
  ],
  quente: [
    'moda feminina', 'calçados femininos', 'rasteirinha',
  ],
  lookalike: [
    'compradores moda', 'clientes recorrentes moda feminina',
  ],
};

const NOMES_POR_TIPO = {
  frio:      'CJ — Público Frio Revendedoras',
  quente:    'CJ — Público Quente Engajamento',
  lookalike: 'CJ — Lookalike Compradores',
};

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { tipo: 'frio' | 'quente' | 'lookalike' };
    const { tipo } = body;

    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_ad_account_id, meta_page_id, anthropic_api_key')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token || !config?.meta_ad_account_id) {
      return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });
    }

    const token = config.meta_access_token;
    const accountId = config.meta_ad_account_id.startsWith('act_')
      ? config.meta_ad_account_id
      : `act_${config.meta_ad_account_id}`;

    // ── PÚBLICO QUENTE: Custom Audience de engajamento ───────────────────────
    if (tipo === 'quente') {
      const params = new URLSearchParams();
      params.set('name', NOMES_POR_TIPO.quente);
      params.set('subtype', 'ENGAGEMENT');
      params.set('description', 'Pessoas que engajaram com CJ Rasteirinhas nos últimos 30 dias');
      params.set('access_token', token);

      const engRes = await fetch(`${META_BASE}/${accountId}/customaudiences`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    params.toString(),
      });
      const engData = await engRes.json() as { id?: string; error?: { message?: string } };

      if (!engRes.ok || !engData.id) {
        return NextResponse.json({
          error: engData.error?.message || 'Erro ao criar público de engajamento',
        }, { status: 502 });
      }

      const { error: insertErr } = await supabase.from('meta_publicos_aprovados').insert({
        tenant_id:        profile.tenant_id,
        nome:             NOMES_POR_TIPO.quente,
        tipo:             'quente',
        meta_audience_id: engData.id,
        status:           'publicado',
        targeting:        { custom_audiences: [{ id: engData.id }] },
        interest_ids:     [],
        criado_por_ia:    true,
      });
      if (insertErr) console.warn('[gerar-automatico] insert quente:', insertErr.message);

      return NextResponse.json({
        ok:               true,
        nome:             NOMES_POR_TIPO.quente,
        meta_audience_id: engData.id,
        tipo:             'quente',
      });
    }

    // ── LOOKALIKE: a partir da base de clientes ──────────────────────────────
    if (tipo === 'lookalike') {
      const { data: clientes } = await supabase
        .from('contacts')
        .select('phone, email')
        .eq('tenant_id', profile.tenant_id)
        .limit(500);

      if (!clientes || clientes.length < 100) {
        return NextResponse.json({
          error: `Mínimo de 100 clientes necessário para criar lookalike. Você tem ${clientes?.length ?? 0} contatos.`,
        }, { status: 400 });
      }

      // 1. Criar Custom Audience base
      const caParams = new URLSearchParams();
      caParams.set('name', 'CJ — Base Clientes para Lookalike');
      caParams.set('subtype', 'CUSTOM');
      caParams.set('description', 'Lista de clientes CJ para gerar lookalike');
      caParams.set('access_token', token);

      const caRes  = await fetch(`${META_BASE}/${accountId}/customaudiences`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    caParams.toString(),
      });
      const caData = await caRes.json() as { id?: string; error?: { message?: string } };

      if (!caRes.ok || !caData.id) {
        return NextResponse.json({
          error: caData.error?.message || 'Erro ao criar base de clientes',
        }, { status: 502 });
      }

      // 2. Criar lookalike
      const laParams = new URLSearchParams();
      laParams.set('name', NOMES_POR_TIPO.lookalike);
      laParams.set('origin_audience_id', caData.id);
      laParams.set('lookalike_spec', JSON.stringify({
        type:    'similarity',
        ratio:   0.01,
        country: 'BR',
      }));
      laParams.set('access_token', token);

      const laRes  = await fetch(`${META_BASE}/${accountId}/customaudiences`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body:    laParams.toString(),
      });
      const laData = await laRes.json() as { id?: string; error?: { message?: string } };

      if (!laRes.ok || !laData.id) {
        return NextResponse.json({
          error: laData.error?.message || 'Erro ao criar lookalike',
        }, { status: 502 });
      }

      const { error: insertErr } = await supabase.from('meta_publicos_aprovados').insert({
        tenant_id:        profile.tenant_id,
        nome:             NOMES_POR_TIPO.lookalike,
        tipo:             'lookalike',
        meta_audience_id: laData.id,
        status:           'publicado',
        targeting:        { custom_audiences: [{ id: laData.id }] },
        interest_ids:     [],
        criado_por_ia:    true,
      });
      if (insertErr) console.warn('[gerar-automatico] insert lookalike:', insertErr.message);

      return NextResponse.json({
        ok:               true,
        nome:             NOMES_POR_TIPO.lookalike,
        meta_audience_id: laData.id,
        tipo:             'lookalike',
      });
    }

    // ── PÚBLICO FRIO: buscar interesses + Jarvis seleciona ───────────────────

    // PASSO 1: buscar interesses na Meta API
    const interessesEncontrados: Array<{ id: string; name: string; audience_size: number }> = [];

    for (const kw of KEYWORDS_POR_TIPO.frio.slice(0, 10)) {
      try {
        const res = await fetch(
          `${META_BASE}/search?type=adinterest&q=${encodeURIComponent(kw)}&limit=10&locale=pt_BR&access_token=${token}`
        );
        if (!res.ok) continue;
        const data = await res.json() as { data: Array<{ id: string; name: string; audience_size: number }> };
        interessesEncontrados.push(...(data.data ?? []).slice(0, 3));
      } catch { continue; }
    }

    // Deduplicar por ID
    const unicos = Array.from(
      new Map(interessesEncontrados.map(i => [i.id, i])).values()
    );

    // PASSO 2: Jarvis seleciona os melhores
    const apiKey = config.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    let interessesSelecionados = unicos.slice(0, 10);

    if (apiKey && unicos.length > 0) {
      try {
        const anthropic = new Anthropic({ apiKey });
        const response = await anthropic.messages.create({
          model:      'claude-haiku-4-5-20251001',
          max_tokens: 1000,
          messages: [{
            role:    'user',
            content: `Você é especialista em Meta Ads para CJ Rasteirinhas — fabricante de rasteirinhas femininas atacado em Goiânia-BR.
Nosso público-alvo: mulheres 25-50 anos, revendedoras, lojistas, empreendedoras de moda.

Selecione os 8 melhores interesses da lista abaixo para targeting de público frio.
Retorne APENAS um array JSON com os IDs selecionados, sem mais nada:
["id1", "id2", "id3", ...]

Interesses disponíveis:
${JSON.stringify(unicos.map(i => ({ id: i.id, nome: i.name, audiencia: i.audience_size })))}`,
          }],
        });

        const text  = response.content[0].type === 'text' ? response.content[0].text : '[]';
        const clean = text.replace(/```json|```/g, '').trim();
        const ids: string[] = JSON.parse(clean);
        const filtrados = unicos.filter(i => ids.includes(i.id));
        if (filtrados.length > 0) interessesSelecionados = filtrados;
        else interessesSelecionados = unicos.slice(0, 8);
      } catch {
        interessesSelecionados = unicos.slice(0, 8);
      }
    }

    // PASSO 3: salvar interesses aprovados na biblioteca
    if (interessesSelecionados.length > 0) {
      await supabase.from('meta_interests_biblioteca').upsert(
        interessesSelecionados.map(i => ({
          id:              i.id,
          nome:            i.name,
          categoria:       'revendedoras',
          audiencia_global: i.audience_size || null,
          ativo:           true,
          aprovado_jarvis: true,
          justificativa:   'Selecionado automaticamente pelo Jarvis para público frio CJ',
          sincronizado_em: new Date().toISOString(),
        })),
        { onConflict: 'id' }
      );
    }

    // PASSO 4: montar targeting
    const targeting = {
      geo_locations: { countries: ['BR'] },
      age_min:       25,
      age_max:       50,
      genders:       [2],
      flexible_spec: [{
        interests: interessesSelecionados.map(i => ({ id: i.id, name: i.name })),
      }],
    };

    // PASSO 5: criar Saved Audience no Meta
    const params = new URLSearchParams();
    params.set('name',      NOMES_POR_TIPO.frio);
    params.set('targeting', JSON.stringify(targeting));
    params.set('access_token', token);

    const metaRes  = await fetch(`${META_BASE}/${accountId}/saved_audiences`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    params.toString(),
    });
    const metaData = await metaRes.json() as {
      id?: string;
      error?: { message?: string; error_user_msg?: string };
    };

    if (!metaRes.ok || !metaData.id) {
      // Salvar localmente com status erro mesmo assim
      await supabase.from('meta_publicos_aprovados').insert({
        tenant_id:    profile.tenant_id,
        nome:         NOMES_POR_TIPO.frio,
        tipo:         'frio',
        status:       'erro',
        erro_msg:     metaData.error?.error_user_msg || metaData.error?.message || 'Erro Meta',
        targeting,
        interest_ids: interessesSelecionados.map(i => i.id),
        criado_por_ia: true,
      });

      return NextResponse.json({
        error: metaData.error?.error_user_msg || metaData.error?.message || 'Erro ao criar no Meta',
      }, { status: 502 });
    }

    // PASSO 6: salvar com ID do Meta
    const { error: insertErr } = await supabase.from('meta_publicos_aprovados').insert({
      tenant_id:        profile.tenant_id,
      nome:             NOMES_POR_TIPO.frio,
      tipo:             'frio',
      meta_audience_id: metaData.id,
      status:           'publicado',
      targeting,
      interest_ids:     interessesSelecionados.map(i => i.id),
      criado_por_ia:    true,
    });
    if (insertErr) console.warn('[gerar-automatico] insert frio:', insertErr.message);

    return NextResponse.json({
      ok:               true,
      nome:             NOMES_POR_TIPO.frio,
      meta_audience_id: metaData.id,
      tipo:             'frio',
      interesses_usados: interessesSelecionados.map(i => i.name),
    });

  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
