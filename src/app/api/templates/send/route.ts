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

    // Buscar template
    const { data: template, error: tplErr } = await supabase
      .from('composite_templates')
      .select('*')
      .eq('id', templateId)
      .eq('tenant_id', tenantId)
      .single();

    if (tplErr || !template) {
      return NextResponse.json({ error: 'Template não encontrado' }, { status: 404 });
    }

    const phoneNormalized = PhoneNormalizer.canonical(to);
    const blocks: TemplateBlock[] = (template.blocks as TemplateBlock[])
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
