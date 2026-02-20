import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { sendTextMessage, sendMediaMessage, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import type { TemplateBlock } from '@/types';

/**
 * POST /api/templates/send
 *
 * Envia um template composto (multi-bubble) para um destinatário.
 * Cada bloco é disparado em sequência com um delay humano entre eles.
 *
 * Body: { templateId, to, variables?: Record<string, string> }
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const config = getTenantEvolutionConfig(tenantId);

    const body = await request.json();
    const { templateId, to, variables = {} } = body as {
      templateId: string;
      to: string;
      variables?: Record<string, string>;
    };

    if (!templateId || !to) {
      return NextResponse.json(
        { error: 'Campos obrigatórios: templateId, to' },
        { status: 400 }
      );
    }

    // Buscar template na tabela correta (message_templates)
    const { data: template, error: tplErr } = await supabase
      .from('message_templates')
      .select('*')
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .eq('status', 'ativo')
      .single();

    if (tplErr || !template) {
      console.error('[templates/send] Template não encontrado:', templateId, tplErr?.message);
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    const phoneNormalized = PhoneNormalizer.canonical(to);
    // message_templates usa campo `blocos` (não `blocks`)
    const rawBlocks = (template.blocos ?? template.blocks ?? []) as Array<Record<string, unknown>>;
    const blocks: TemplateBlock[] = rawBlocks
      .map((b, i) => ({
        id: (b.id as string) ?? String(i),
        type: (b.type ?? b.tipo ?? 'text') as TemplateBlock['type'],
        order: (b.order as number) ?? i,
        content: (b.content ?? b.conteudo ?? b.texto) as string | undefined,
        media_url: (b.media_url ?? b.url) as string | undefined,
        image_url: (b.image_url) as string | undefined,
        media_caption: (b.media_caption ?? b.caption ?? b.legenda) as string | undefined,
        image_caption: (b.image_caption) as string | undefined,
        link_url: (b.link_url ?? b.url) as string | undefined,
        link_title: (b.link_title ?? b.titulo) as string | undefined,
        cta_url: (b.cta_url) as string | undefined,
        cta_label: (b.cta_label) as string | undefined,
        delay_ms: (b.delay_ms as number) ?? undefined,
      } as TemplateBlock))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    // Substituir variáveis: {{nome}} → valor
    const interpolate = (str?: string) => {
      if (!str) return str;
      return str.replace(/\{\{(\w+)\}\}/g, (_, key) => variables[key] ?? `{{${key}}}`);
    };

    const results: Array<{ blockId: string; messageId: string; status: 'sent' | 'error'; error?: string }> = [];

    for (const block of blocks) {
      // Delay humano entre blocos (exceto o primeiro)
      const delayMs = block.delay_ms ?? (results.length === 0 ? 0 : 1000);
      if (delayMs > 0) {
        await new Promise(r => setTimeout(r, delayMs));
      }

      try {
        let messageId: string;

        switch (block.type) {
          case 'text': {
            const content = interpolate(block.content) || '';
            if (!content.trim()) { results.push({ blockId: block.id, messageId: '', status: 'error', error: 'Bloco vazio' }); continue; }
            messageId = await sendTextMessage(config, phoneNormalized, content);
            break;
          }

          case 'image':
          case 'video':
          case 'audio':
          case 'document': {
            const url = block.media_url || block.image_url;
            if (!url) { results.push({ blockId: block.id, messageId: '', status: 'error', error: 'URL de mídia ausente' }); continue; }
            const caption = interpolate(block.media_caption || block.image_caption);
            messageId = await sendMediaMessage(config, phoneNormalized, url, caption || '', block.type as 'image' | 'video' | 'audio' | 'document');
            break;
          }

          case 'link':
          case 'cta': {
            // Enviar como texto formatado
            const label = interpolate(block.link_title || block.cta_label) || '';
            const url = interpolate(block.link_url || block.cta_url) || '';
            const content = label ? `${label}\n${url}` : url;
            if (!content.trim()) { results.push({ blockId: block.id, messageId: '', status: 'error', error: 'Link vazio' }); continue; }
            messageId = await sendTextMessage(config, phoneNormalized, content);
            break;
          }

          default:
            results.push({ blockId: block.id, messageId: '', status: 'error', error: `Tipo desconhecido: ${block.type}` });
            continue;
        }

        results.push({ blockId: block.id, messageId, status: 'sent' });
      } catch (err: any) {
        results.push({ blockId: block.id, messageId: '', status: 'error', error: err.message });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const errors = results.filter(r => r.status === 'error').length;

    return NextResponse.json({
      success: errors === 0,
      summary: { sent, errors, total: blocks.length },
      results,
    });
  } catch (error: any) {
    console.error('[POST /api/templates/send]', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
