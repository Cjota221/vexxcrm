/**
 * POST /api/meta/analisar-imagem
 * Analisa uma imagem criativa via GPT-4o-mini vision e salva classificação.
 * Body: { criativoId: string, imageUrl: string, fonte: 'ad_creatives' | 'meta_creatives_cache' }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';

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

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY não configurada' }, { status: 500 });
  }

  try {
    // Baixar imagem no servidor e converter para base64
    // URLs do Meta CDN expiram e exigem auth — OpenAI não consegue baixar diretamente
    let imagePayload: { url: string };
    try {
      const imgRes = await fetch(body.imageUrl, { signal: AbortSignal.timeout(10_000) });
      if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
      const contentType = imgRes.headers.get('content-type') ?? 'image/jpeg';
      const buffer = await imgRes.arrayBuffer();
      const base64 = Buffer.from(buffer).toString('base64');
      imagePayload = { url: `data:${contentType};base64,${base64}` };
    } catch (downloadErr) {
      console.warn('[ANALISAR IMAGEM] Falha ao baixar imagem, tentando URL direta:', downloadErr);
      imagePayload = { url: body.imageUrl };
    }

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: imagePayload,
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
        max_tokens: 300,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const data = await res.json() as {
      choices?: Array<{ message: { content: string } }>;
      error?: { message: string };
    };

    if (data.error) {
      return NextResponse.json({ error: data.error.message }, { status: 400 });
    }

    const content = data.choices?.[0]?.message?.content ?? '';
    let classificacao: Classificacao;
    try {
      // Remover blocos de código markdown se presentes
      const json = content.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      classificacao = JSON.parse(json) as Classificacao;
    } catch {
      return NextResponse.json({ error: 'Resposta da IA inválida', raw: content }, { status: 500 });
    }

    // Salvar classificação
    const supabase = createServerSupabaseClient();
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
