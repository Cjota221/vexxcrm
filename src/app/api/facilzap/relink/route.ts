import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

/**
 * POST /api/facilzap/relink
 * 
 * Re-vincula pedidos órfãos (sem client_id) aos clientes existentes
 * usando PhoneNormalizer para matching confiável de telefones.
 * 
 * Também normaliza phone_normalized dos clientes existentes e
 * recalcula stats (ltv, total_orders, avg_ticket) de todos os clientes.
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabaseAdmin = createServerSupabaseClient();
    const supabaseAuth = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${token}` } } }
    );

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single();

    if (!profile) {
      return NextResponse.json({ error: 'Usuário não encontrado' }, { status: 404 });
    }

    const tenantId = profile.tenant_id;
    const results = {
      phonesNormalized: 0,
      ordersRelinked: 0,
      statsUpdated: 0,
      errors: [] as string[],
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FASE 1: Normalizar phone_normalized de todos os clientes
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('[RELINK] Fase 1: Normalizando telefones dos clientes...');

    const { data: allClients } = await supabaseAdmin
      .from('clients')
      .select('id, phone, phone_normalized')
      .eq('tenant_id', tenantId);

    if (allClients && allClients.length > 0) {
      const updates: { id: string; phone: string; phone_normalized: string }[] = [];

      for (const c of allClients) {
        const raw = c.phone || c.phone_normalized || '';
        if (!raw) continue;

        const canonical = PhoneNormalizer.canonical(raw);
        const display = PhoneNormalizer.normalize(raw);

        // Só atualizar se mudou
        if (canonical !== c.phone_normalized || display !== c.phone) {
          updates.push({
            id: c.id,
            phone: display,
            phone_normalized: canonical,
          });
        }
      }

      if (updates.length > 0) {
        // Deduplicar por phone_normalized (pode haver colisão após normalização)
        const seen = new Set<string>();
        const uniqueUpdates = updates.filter((u) => {
          if (seen.has(u.phone_normalized)) return false;
          seen.add(u.phone_normalized);
          return true;
        });

        for (let i = 0; i < uniqueUpdates.length; i += 50) {
          const batch = uniqueUpdates.slice(i, i + 50);
          for (const u of batch) {
            const { error } = await supabaseAdmin
              .from('clients')
              .update({ phone: u.phone, phone_normalized: u.phone_normalized })
              .eq('id', u.id)
              .eq('tenant_id', tenantId);
            if (error) {
              console.error(`[RELINK] Erro ao normalizar cliente ${u.id}:`, error.message);
            } else {
              results.phonesNormalized++;
            }
          }
        }
        console.log(`[RELINK] ${results.phonesNormalized} telefones normalizados`);
      }
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FASE 2: Re-vincular pedidos órfãos (client_id IS NULL)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('[RELINK] Fase 2: Re-vinculando pedidos órfãos...');

    // Recarregar clientes (com phones normalizados)
    const { data: freshClients } = await supabaseAdmin
      .from('clients')
      .select('id, phone, phone_normalized')
      .eq('tenant_id', tenantId);

    // Criar mapa com TODAS as variações possíveis
    const phoneMap = new Map<string, string>();
    for (const c of (freshClients || [])) {
      if (c.phone_normalized) {
        phoneMap.set(c.phone_normalized, c.id);
        phoneMap.set(PhoneNormalizer.normalize(c.phone_normalized), c.id);
      }
      if (c.phone) {
        const cleaned = c.phone.replace(/\D/g, '');
        phoneMap.set(cleaned, c.id);
        phoneMap.set(PhoneNormalizer.canonical(cleaned), c.id);
        phoneMap.set(PhoneNormalizer.normalize(cleaned), c.id);
      }
    }

    // Buscar pedidos sem client_id que tenham telefone nos metadados
    const { data: orphanOrders } = await supabaseAdmin
      .from('orders')
      .select('id, metadata')
      .eq('tenant_id', tenantId)
      .is('client_id', null);

    if (orphanOrders && orphanOrders.length > 0) {
      console.log(`[RELINK] ${orphanOrders.length} pedidos órfãos encontrados`);

      for (const order of orphanOrders) {
        const meta = order.metadata as any;
        if (!meta) continue;

        // Extrair telefone dos metadados (salvos durante sync)
        const rawPhone = meta.cliente_whatsapp || meta.cliente_telefone || '';
        const ph = rawPhone.replace(/\D/g, '');
        if (!ph) continue;

        // Tentar encontrar cliente por múltiplas variações
        const clientId = phoneMap.get(ph)
          || phoneMap.get(PhoneNormalizer.canonical(ph))
          || phoneMap.get(PhoneNormalizer.normalize(ph))
          || null;

        if (clientId) {
          const { error } = await supabaseAdmin
            .from('orders')
            .update({ client_id: clientId })
            .eq('id', order.id)
            .eq('tenant_id', tenantId);

          if (error) {
            results.errors.push(`Pedido ${order.id}: ${error.message}`);
          } else {
            results.ordersRelinked++;
          }
        }
      }
      console.log(`[RELINK] ${results.ordersRelinked} pedidos re-vinculados`);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // FASE 3: Recalcular stats de TODOS os clientes
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    console.log('[RELINK] Fase 3: Recalculando estatísticas...');

    const { data: allOrders } = await supabaseAdmin
      .from('orders')
      .select('client_id, total, created_at')
      .eq('tenant_id', tenantId)
      .not('client_id', 'is', null);

    // Calcular stats por client
    const clientStats = new Map<string, { total: number; count: number; last: string }>();
    for (const o of (allOrders || [])) {
      if (!o.client_id) continue;
      const prev = clientStats.get(o.client_id) || { total: 0, count: 0, last: '' };
      prev.total += Number(o.total) || 0;
      prev.count += 1;
      if (o.created_at > prev.last) prev.last = o.created_at;
      clientStats.set(o.client_id, prev);
    }

    // Incluir clientes que AINDA não têm pedidos (zerar stats)
    for (const c of (freshClients || [])) {
      if (!clientStats.has(c.id)) {
        clientStats.set(c.id, { total: 0, count: 0, last: '' });
      }
    }

    // Atualizar em batches
    const statsUpdates = Array.from(clientStats.entries()).map(([clientId, stats]) => ({
      id: clientId,
      tenant_id: tenantId,
      ltv: Math.round(stats.total * 100) / 100,
      total_orders: stats.count,
      avg_ticket: stats.count > 0 ? Math.round((stats.total / stats.count) * 100) / 100 : 0,
      last_order_at: stats.last || null,
    }));

    for (let i = 0; i < statsUpdates.length; i += 100) {
      const batch = statsUpdates.slice(i, i + 100);
      const { error } = await supabaseAdmin.from('clients').upsert(batch, { onConflict: 'id' });
      if (error) {
        results.errors.push(`Stats batch ${i}: ${error.message}`);
      } else {
        results.statsUpdated += batch.length;
      }
    }
    console.log(`[RELINK] Stats de ${results.statsUpdated} clientes atualizadas`);

    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      data: results,
      duration_ms: duration,
      message: `Relink concluído: ${results.phonesNormalized} phones normalizados, ${results.ordersRelinked} pedidos re-vinculados, ${results.statsUpdated} stats atualizadas`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao re-vincular', details: error.message },
      { status: 500 }
    );
  }
}
