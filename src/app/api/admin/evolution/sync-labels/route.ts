import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

const WA_LABEL_COLORS: Record<string, string> = {
  '0': '#FF6900', '1': '#FCB900', '2': '#7BDCB5', '3': '#00D084',
  '4': '#8ED1FC', '5': '#0693E3', '6': '#ABB8C3', '7': '#EB144C',
  '8': '#F78DA7', '9': '#9900EF', '10': '#FF6900', '11': '#FCB900',
  '12': '#00D084', '13': '#0693E3', '14': '#EB144C', '15': '#9900EF',
  '16': '#FF6900', '17': '#7BDCB5', '18': '#ABB8C3', '19': '#EB144C',
};

/**
 * POST /api/admin/evolution/sync-labels
 * Sincroniza etiquetas existentes do WhatsApp para o banco local.
 * Chama GET /chat/findLabels/{instancia} da Evolution API.
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
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

    if (!evolutionUrl || !evolutionKey) {
      return NextResponse.json({ error: 'EVOLUTION_API_URL ou EVOLUTION_GLOBAL_KEY não configurados' }, { status: 500 });
    }

    const res = await fetch(`${evolutionUrl}/chat/findLabels/${tenant.evolution_instance}`, {
      headers: { 'apikey': evolutionKey },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return NextResponse.json({ error: `Erro Evolution: ${res.status} ${err}` }, { status: 502 });
    }

    const labels = await res.json() as Array<{
      id: string; name: string; color?: number; predefinedId?: string;
    }>;

    if (!Array.isArray(labels) || labels.length === 0) {
      return NextResponse.json({ ok: true, message: 'Nenhuma etiqueta encontrada no WhatsApp', synced: 0 });
    }

    let synced = 0;
    for (const label of labels) {
      const corStr = label.color !== undefined ? String(label.color) : null;
      const { error } = await supabase
        .from('whatsapp_labels')
        .upsert({
          tenant_id: profile.tenant_id,
          whatsapp_label_id: label.id,
          nome: label.name || '(sem nome)',
          cor: corStr,
          cor_hex: corStr ? (WA_LABEL_COLORS[corStr] || '#ABB8C3') : null,
          predefined_id: label.predefinedId || null,
          ativo: true,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'tenant_id,whatsapp_label_id' });

      if (!error) synced++;
    }

    return NextResponse.json({
      ok: true,
      message: `Sincronizadas ${synced} etiqueta(s) do WhatsApp`,
      synced,
      total: labels.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
