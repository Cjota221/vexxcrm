import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import Anthropic from '@anthropic-ai/sdk';

/**
 * POST /api/trafego/interests/jarvis-analisar
 * O Jarvis analisa interesses pendentes (aprovado_jarvis IS NULL) na biblioteca
 * e classifica como aprovado/rejeitado com justificativa.
 *
 * Body: { ids?: string[] } — se omitido, analisa até 20 pendentes.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { ids?: string[] };

    const supabase = createServerSupabaseClient();

    // Buscar chave Anthropic do tenant
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('anthropic_api_key')
      .eq('tenant_id', profile.tenant_id)
      .single();

    const apiKey = config?.anthropic_api_key || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Chave Anthropic não configurada' }, { status: 400 });
    }

    // Buscar interesses a analisar
    let query = supabase
      .from('meta_interests_biblioteca')
      .select('id, nome, categoria, audiencia_global')
      .is('aprovado_jarvis', null)
      .eq('ativo', true)
      .limit(20);

    if (body.ids && body.ids.length > 0) {
      query = supabase
        .from('meta_interests_biblioteca')
        .select('id, nome, categoria, audiencia_global')
        .in('id', body.ids)
        .eq('ativo', true)
        .limit(50);
    }

    const { data: interesses, error: fetchErr } = await query;
    if (fetchErr) throw new Error(fetchErr.message);
    if (!interesses || interesses.length === 0) {
      return NextResponse.json({ analisados: 0, message: 'Nenhum interesse pendente encontrado' });
    }

    const client = new Anthropic({ apiKey });

    const prompt = `Você é o Jarvis, especialista em tráfego pago para e-commerce de moda feminina brasileira.
Analise a lista de interesses do Meta Ads abaixo e classifique cada um como APROVADO ou REJEITADO para campanhas de moda feminina (roupas, acessórios, calçados).

Critérios de aprovação:
- APROVADO: interesse diretamente relacionado a moda, compras, beleza, estilo feminino, comportamentos de compra online
- REJEITADO: interesse muito amplo/genérico, não relacionado ao público-alvo, ou improvável de converter

Para cada interesse, retorne um JSON array com objetos: { "id": "...", "aprovado": true/false, "justificativa": "..." (máx 80 chars) }

Interesses a analisar:
${interesses.map(i => `- ID: ${i.id} | Nome: ${i.nome} | Categoria: ${i.categoria ?? 'N/A'} | Audiência: ${i.audiencia_global ? i.audiencia_global.toLocaleString() : 'N/A'}`).join('\n')}

Retorne APENAS o JSON array, sem markdown ou texto adicional.`;

    const message = await client.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 2000,
      messages:   [{ role: 'user', content: prompt }],
    });

    const rawText = message.content[0].type === 'text' ? message.content[0].text : '';
    let resultados: Array<{ id: string; aprovado: boolean; justificativa: string }> = [];

    try {
      resultados = JSON.parse(rawText);
    } catch {
      // Tentar extrair JSON de dentro do texto
      const match = rawText.match(/\[[\s\S]*\]/);
      if (match) resultados = JSON.parse(match[0]);
      else throw new Error('Jarvis retornou resposta inválida');
    }

    // Atualizar biblioteca com resultados
    let atualizados = 0;
    for (const r of resultados) {
      const { error: updErr } = await supabase
        .from('meta_interests_biblioteca')
        .update({
          aprovado_jarvis: r.aprovado,
          justificativa:   r.justificativa,
          sincronizado_em: new Date().toISOString(),
        })
        .eq('id', r.id);

      if (!updErr) atualizados++;
    }

    return NextResponse.json({
      analisados: interesses.length,
      atualizados,
      resultados,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
