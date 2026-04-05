/**
 * POST /api/jarvis/chat
 * Chat com o Jarvis — motor de inteligência central do VEXX CRM.
 */

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

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

  const supabase = createServerSupabaseClient();

  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('*')
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

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     JARVIS_SYSTEM,
      messages,
    });

    const resposta = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    return NextResponse.json({ resposta, role: 'assistant' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
