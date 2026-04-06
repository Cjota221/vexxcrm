/**
 * POST /api/meta/analisar-imagem
 * Analisa uma imagem criativa via Claude Haiku Vision (Anthropic) e salva classificação.
 * Body: { criativoId: string, imageUrl: string, fonte: 'ad_creatives' | 'meta_creatives_cache' }
 *
 * Migrado de OpenAI GPT-4o-mini Vision para Anthropic claude-haiku-4-5-20251001.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

const HAIKU_MODEL = process.env.JARVIS_MODEL ?? 'claude-haiku-4-5-20251001';

interface Classificacao {
  tipo_conteudo: string;
  tom: string;
  tem_cta: boolean;
  adequacao_publico_frio: number;
  adequacao_publico_quente: number;
  adequacao_whatsapp: number;
  resumo: string;
  recomendacao_uso: string;
}

export async function POST(req: NextRequest) {
  let tenantId: string;
  try {
    const auth = await getTenantFromRequest(req);
    tenantId = auth.tenantId;
  } catch {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json() as {
    criativoId: string;
    imageUrl: string;
    fonte?: 'ad_creatives' | 'meta_creatives_cache';
  };

  if (!body.criativoId || !body.imageUrl) {
    return NextResponse.json({ error: 'criativoId e imageUrl são obrigatórios' }, { status: 400 });
  }

  const fonte = body.fonte ?? 'ad_creatives';

  console.log('[ANALISAR IMAGEM] criativoId:', body.criativoId, 'url:', body.imageUrl?.substring(0, 50));

  // Buscar API key do banco ou env
  const supabase = createServerSupabaseClient();
  const { data: configData } = await supabase
    .from('ai_provider_config')
    .select('visual_api_key')
    .eq('tenant_id', tenantId)
    .single();

  const anthropicKey = configData?.visual_api_key || process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY não configurada' }, { status: 500 });
  }

  try {
    // Baixar imagem no servidor e converter para base64
    // URLs do Meta CDN expiram e exigem auth — Anthropic não consegue baixar diretamente
    let base64: string;
    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg';

    try {
      const imgRes = await fetch(body.imageUrl, { signal: AbortSignal.timeout(10_000) });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
      const buffer = await imgRes.arrayBuffer();
      base64 = Buffer.from(buffer).toString('base64');

      if (contentType.includes('png')) mediaType = 'image/png';
      else if (contentType.includes('gif')) mediaType = 'image/gif';
      else if (contentType.includes('webp')) mediaType = 'image/webp';
    } catch (downloadErr) {
      console.warn('[ANALISAR IMAGEM] Falha ao baixar imagem:', downloadErr);
      return NextResponse.json({ error: 'Não foi possível baixar a imagem para análise' }, { status: 422 });
    }

    const client = new Anthropic({ apiKey: anthropicKey });

    const response = await client.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 400,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: `Você é especialista em marketing digital para moda feminina e calçados no Brasil.
Analise esta imagem criativa para anúncio e retorne APENAS JSON válido, sem markdown:
{
  "tipo_conteudo": "produto|lifestyle|oferta|institucional|depoimento",
  "tom": "emocional|direto|educativo|urgente|inspiracional",
  "tem_cta": true,
  "adequacao_publico_frio": 0,
  "adequacao_publico_quente": 0,
  "adequacao_whatsapp": 0,
  "resumo": "Uma frase descrevendo a imagem",
  "recomendacao_uso": "Onde usar este criativo"
}
Critérios de score 0-10: frio=novos clientes que nunca compraram, quente=remarketing para quem já visitou, whatsapp=mensagens diretas convertendo em venda.`,
          },
        ],
      }],
    }, { signal: AbortSignal.timeout(20_000) as AbortSignal });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    let classificacao: Classificacao;
    try {
      const json = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      classificacao = JSON.parse(json) as Classificacao;
    } catch {
      return NextResponse.json({ error: 'Resposta da IA inválida', raw: content }, { status: 500 });
    }

    // Salvar classificação
    const tabela = fonte === 'meta_creatives_cache' ? 'meta_creatives_cache' : 'ad_creatives';

    await supabase
      .from(tabela)
      .update({ classificacao })
      .eq('id', body.criativoId)
      .eq('tenant_id', tenantId);

    return NextResponse.json({ ok: true, classificacao });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
