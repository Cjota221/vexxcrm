/**
 * POST /api/meta/campanhas/ia-copy
 *
 * Modos:
 *   melhorar_headline — melhora um headline existente
 *   melhorar_body     — melhora um texto principal existente
 *   variacoes         — gera 3 variações de headline + texto
 *
 * Body: { modo, headline?, body? }
 * Usa claude-haiku-4-5-20251001 via anthropic_api_key do tenant.
 * Chama a Anthropic API diretamente via fetch (mesmo padrão do jarvis/chat).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

const MODEL   = 'claude-haiku-4-5-20251001';
const ANT_URL = 'https://api.anthropic.com/v1/messages';

const SYSTEM_MELHORAR =
  'Você é um especialista em copy para Meta Ads de moda feminina no Brasil, ' +
  'atacado e revenda. Melhore o texto recebido para ser mais persuasivo, urgente e direto. ' +
  'Máximo 40 palavras. Foco em mulheres 25-55 anos que querem renda extra revendendo rasteirinhas. ' +
  'Retorne só o texto melhorado, sem explicação.';

const SYSTEM_VARIACOES =
  'Você é um especialista em copy para Meta Ads de moda feminina no Brasil, atacado e revenda. ' +
  'Gere 3 variações alternativas de headline + texto para anúncio no Meta. ' +
  'Foco em mulheres 25-55 anos que querem renda extra revendendo rasteirinhas. ' +
  'headline: máx 40 caracteres, persuasivo e direto. texto: máx 125 caracteres, urgente. ' +
  'Retorne APENAS JSON válido, sem markdown, sem explicação:\n' +
  '[{"headline":"...","texto":"..."},{"headline":"...","texto":"..."},{"headline":"...","texto":"..."}]';

type Modo = 'melhorar_headline' | 'melhorar_body' | 'variacoes';

async function chamarAnthropic(
  apiKey: string,
  system: string,
  userContent: string,
  maxTokens: number,
): Promise<string> {
  const res = await fetch(ANT_URL, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
    }),
    signal: AbortSignal.timeout(25_000),
  });

  const data = await res.json() as {
    content?: Array<{ type: string; text: string }>;
    error?:   { message: string };
  };

  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `Anthropic HTTP ${res.status}`);
  }

  const text = data.content?.[0]?.text;
  if (!text) throw new Error('Resposta vazia da Anthropic');
  return text.trim();
}

export async function POST(req: NextRequest) {
  try {
    // ── Autenticação ──────────────────────────────────────────────────────
    const { tenantId } = await getTenantFromRequest(req);

    // ── Body ─────────────────────────────────────────────────────────────
    const payload = await req.json() as {
      modo:       Modo;
      headline?:  string;
      body?:      string;
    };

    if (!payload.modo) {
      return NextResponse.json({ error: 'modo é obrigatório' }, { status: 400 });
    }

    // ── API key do tenant ────────────────────────────────────────────────
    const supabase = createServerSupabaseClient();
    const { data: cfg, error: cfgError } = await supabase
      .from('ai_provider_config')
      .select('anthropic_api_key, strategy_api_key')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (cfgError) {
      console.error('[ia-copy] Erro ao buscar ai_provider_config:', cfgError.message);
    }

    const apiKey =
      cfg?.anthropic_api_key ||
      cfg?.strategy_api_key  ||
      process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key da Anthropic não configurada. Acesse Time de IAs → Configurações.' },
        { status: 400 },
      );
    }

    // ── Modos ────────────────────────────────────────────────────────────
    if (payload.modo === 'melhorar_headline') {
      if (!payload.headline?.trim()) {
        return NextResponse.json({ error: 'headline é obrigatório' }, { status: 400 });
      }
      const resultado = await chamarAnthropic(apiKey, SYSTEM_MELHORAR, payload.headline, 100);
      return NextResponse.json({ resultado });
    }

    if (payload.modo === 'melhorar_body') {
      if (!payload.body?.trim()) {
        return NextResponse.json({ error: 'body é obrigatório' }, { status: 400 });
      }
      const resultado = await chamarAnthropic(apiKey, SYSTEM_MELHORAR, payload.body, 200);
      return NextResponse.json({ resultado });
    }

    if (payload.modo === 'variacoes') {
      const contexto = [
        payload.headline ? `Headline atual: "${payload.headline}"` : '',
        payload.body     ? `Texto atual: "${payload.body}"`         : '',
      ].filter(Boolean).join('\n') || 'Produto: rasteirinhas femininas para revenda';

      const raw = await chamarAnthropic(apiKey, SYSTEM_VARIACOES, contexto, 500);

      let variacoes: Array<{ headline: string; texto: string }>;
      try {
        // Extrai JSON mesmo se vier com markdown ```json ... ```
        const jsonStr = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
        variacoes = JSON.parse(jsonStr) as typeof variacoes;
        if (!Array.isArray(variacoes) || variacoes.length === 0) throw new Error('formato inválido');
      } catch {
        console.error('[ia-copy] Falha ao parsear variações. Raw:', raw);
        return NextResponse.json(
          { error: 'Erro ao interpretar resposta da IA. Tente novamente.' },
          { status: 500 },
        );
      }

      return NextResponse.json({ variacoes: variacoes.slice(0, 3) });
    }

    return NextResponse.json({ error: 'Modo inválido' }, { status: 400 });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[ia-copy] Erro:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
