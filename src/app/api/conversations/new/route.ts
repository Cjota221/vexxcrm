import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

/**
 * POST /api/conversations/new
 * Inicia uma nova conversa com um número de telefone.
 * Body: { phone: string, mensagem?: string }
 *
 * 1. Normaliza o telefone
 * 2. Verifica se número existe no WhatsApp
 * 3. Envia mensagem inicial (se fornecida)
 * 4. Retorna o telefone normalizado
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as { phone: string; mensagem?: string };

    if (!body.phone) {
      return NextResponse.json({ error: 'phone obrigatório' }, { status: 400 });
    }

    const supabase = createServerSupabaseClient();

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, evolution_instance')
      .eq('id', profile.tenant_id)
      .single();

    if (!tenant?.evolution_instance) {
      return NextResponse.json({ error: 'Instância Evolution não configurada' }, { status: 400 });
    }

    const evolutionUrl = process.env.EVOLUTION_API_URL;
    const evolutionKey = process.env.EVOLUTION_GLOBAL_KEY;

    // Normalizar telefone
    let phone = body.phone.replace(/\D/g, '');
    // Remover 0 inicial
    if (phone.startsWith('0')) phone = phone.substring(1);
    // Adicionar DDI 55 se não tiver
    if (!phone.startsWith('55') && phone.length <= 11) phone = `55${phone}`;

    // Verificar se número existe no WhatsApp
    const checkRes = await fetch(`${evolutionUrl}/chat/whatsappNumbers/${tenant.evolution_instance}`, {
      method: 'POST',
      headers: { 'apikey': evolutionKey!, 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers: [phone] }),
    });

    if (checkRes.ok) {
      const checkResult = await checkRes.json() as Array<{ exists: boolean; jid?: string; number?: string }>;
      const numberInfo = checkResult?.[0];
      if (numberInfo && !numberInfo.exists) {
        return NextResponse.json({ error: 'Número não encontrado no WhatsApp' }, { status: 404 });
      }
    }

    // Enviar mensagem inicial se fornecida
    if (body.mensagem?.trim()) {
      const sendRes = await fetch(`${evolutionUrl}/message/sendText/${tenant.evolution_instance}`, {
        method: 'POST',
        headers: { 'apikey': evolutionKey!, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          number: phone,
          text: body.mensagem.trim(),
        }),
      });

      if (!sendRes.ok) {
        const err = await sendRes.json().catch(() => ({})) as { message?: string };
        return NextResponse.json({ error: err.message || 'Erro ao enviar mensagem' }, { status: 502 });
      }
    }

    return NextResponse.json({ ok: true, phone });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
