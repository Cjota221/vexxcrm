/**
 * POST /api/jarvis/chat
 * Chat com o Jarvis — motor de inteligência central do VEXX CRM.
 * Usa a Anthropic API diretamente via fetch (sem SDK).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { mensagem, historico } = await req.json() as {
    mensagem: string;
    historico?: Array<{ role: 'user' | 'assistant'; content: string }>;
  };

  if (!mensagem?.trim()) {
    return NextResponse.json({ error: 'Mensagem vazia' }, { status: 400 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 });
  }

  const supabase = createServerSupabaseClient();
  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('brand_name')
    .eq('tenant_id', tenantId)
    .single();

  const JARVIS_SYSTEM = `Você é o JARVIS, motor de inteligência central do VEXX CRM.
Você foi criado para a ${config?.brand_name ?? 'CJ Rasteirinhas'}.

Suas responsabilidades:
- Analisar performance de campanhas Meta Ads
- Criar e otimizar públicos de alta performance
- Gerar copies e estratégias de anúncio
- Identificar oportunidades e alertar sobre problemas
- Aprender com cada campanha para melhorar continuamente

Contexto do negócio:
- Produto: rasteirinhas femininas para revenda (atacado)
- Público: mulheres 25-55 anos, empreendedoras, Brasil
- Ad Account: act_1244920119465862
- Objetivo: gerar revendedoras e aumentar ROAS

Você é direto, estratégico e fala português brasileiro.
Quando o usuário pedir análise de campanhas, você busca os dados reais.
Quando pedir para criar campanha, você executa.
Você nunca diz "não posso" — você encontra uma forma.`;

  try {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...(historico ?? []),
      { role: 'user', content: mensagem },
    ];

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':         'application/json',
        'x-api-key':            apiKey,
        'anthropic-version':    '2023-06-01',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-6',
        max_tokens: 1024,
        system:     JARVIS_SYSTEM,
        messages,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    const data = await res.json() as {
      content?: Array<{ type: string; text: string }>;
      error?:   { message: string };
    };

    if (!res.ok || data.error) {
      return NextResponse.json({ error: data.error?.message ?? `Anthropic HTTP ${res.status}` }, { status: 500 });
    }

    const resposta = data.content?.find(c => c.type === 'text')?.text ?? '';
    return NextResponse.json({ resposta, role: 'assistant' });

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
