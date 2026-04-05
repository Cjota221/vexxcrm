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

  const supabase = createServerSupabaseClient();
  const { data: config } = await supabase
    .from('ai_provider_config')
    .select('brand_name, anthropic_api_key')
    .eq('tenant_id', tenantId)
    .single();

  // Prioriza key do banco; fallback para variável de ambiente
  const apiKey = config?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Token Anthropic não configurado. Adicione sua API key na página do Jarvis.' }, { status: 400 });
  }

  // Buscar base de conhecimento do tenant
  const { data: knowledgeDocs } = await supabase
    .from('jarvis_knowledge')
    .select('titulo, conteudo, categoria')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .order('criado_em', { ascending: false })
    .limit(20);

  const knowledgeBlock = knowledgeDocs && knowledgeDocs.length > 0
    ? `\n\n## BASE DE CONHECIMENTO DO NEGÓCIO\nAs informações abaixo foram cadastradas pelo usuário. Use-as sempre que relevante para responder:\n\n${
        knowledgeDocs
          .map(doc => `### [${doc.categoria.toUpperCase()}] ${doc.titulo}\n${doc.conteudo}`)
          .join('\n\n---\n\n')
      }`
    : '';

  const JARVIS_SYSTEM = `Você é o JARVIS, motor de inteligência central do VEXX CRM.
Você foi criado para a ${config?.brand_name ?? 'CJ Rasteirinhas'}.

Suas responsabilidades:
- Analisar performance de campanhas Meta Ads
- Criar e otimizar públicos de alta performance
- Gerar copies e estratégias de anúncio
- Identificar oportunidades e alertar sobre problemas
- Aprender com cada campanha para melhorar continuamente

Você é direto, estratégico e fala português brasileiro.
Quando o usuário pedir análise de campanhas, você busca os dados reais.
Quando pedir para criar campanha, você executa.
Você nunca diz "não posso" — você encontra uma forma.${knowledgeBlock}`;

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
