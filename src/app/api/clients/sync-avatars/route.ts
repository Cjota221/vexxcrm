import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { fetchProfilePicUrl, getTenantEvolutionConfig } from '@/lib/services/evolution.service';
import { PhoneNormalizer } from '@/lib/phone-normalizer';

/**
 * POST /api/clients/sync-avatars
 *
 * Corrige avatares ausentes ou expirados (mmg.whatsapp.net expira em 24-48h).
 * Para cada cliente:
 *   1. Busca URL atual via Evolution API (fetchProfilePicUrl)
 *   2. Faz download e sobe para Supabase Storage (cache permanente)
 *   3. Atualiza clients.avatar_url com URL permanente do Storage
 *
 * Processamento em lotes de 10 com 1.2s de delay para não estourar
 * o rate-limit da Evolution API.
 *
 * Body (opcional):
 *   - limit:  max de clientes a processar nesta chamada (default: 100, max: 500)
 *   - offset: cursor para paginação (default: 0)
 *   - force:  se true, reprocessa mesmo quem já tem avatar no Storage (default: false)
 */
export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const config = getTenantEvolutionConfig(tenantId);

    let limit = 100;
    let offset = 0;
    let force = false;

    try {
      const body = await request.json();
      limit = Math.min(body.limit || 100, 500);
      offset = body.offset || 0;
      force = body.force === true;
    } catch {
      // body vazio — usar defaults
    }

    // Buscar clientes que precisam de avatar:
    //   sem avatar_url, OU com URL temporária do WhatsApp
    let query = supabase
      .from('clients')
      .select('id, phone_normalized, phone, name, avatar_url')
      .eq('tenant_id', tenantId)
      .not('phone_normalized', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!force) {
      // Selecionar apenas os que não têm URL do Storage ainda
      query = query.or(
        'avatar_url.is.null,' +
        'avatar_url.like.%mmg.whatsapp.net%,' +
        'avatar_url.like.%pps.whatsapp.net%,' +
        'avatar_url.like.%whatsapp.net%'
      );
    }

    const { data: clients, error } = await query;

    if (error) {
      console.error('[SyncAvatars] Erro ao buscar clientes:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({
        processed: 0,
        updated: 0,
        failed: 0,
        hasMore: false,
        nextOffset: null,
        message: 'Nenhum cliente precisa de avatar.',
      });
    }

    // Contar total para saber se há mais páginas
    let countQuery = supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('phone_normalized', 'is', null);

    if (!force) {
      countQuery = countQuery.or(
        'avatar_url.is.null,' +
        'avatar_url.like.%mmg.whatsapp.net%,' +
        'avatar_url.like.%pps.whatsapp.net%,' +
        'avatar_url.like.%whatsapp.net%'
      );
    }

    const { count: totalCount } = await countQuery;
    const hasMore = (offset + clients.length) < (totalCount ?? 0);

    // Processar em lotes de 10 com 1.2s de delay entre lotes
    const BATCH_SIZE = 10;
    const DELAY_MS = 1_200;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (client) => {
          try {
            const phone = client.phone_normalized || PhoneNormalizer.canonical(client.phone || '');
            if (!phone || phone.length < 8) { failed++; return; }

            // 1. Buscar URL atual da foto via Evolution API
            const rawPicUrl = await fetchProfilePicUrl(config, `${phone}@s.whatsapp.net`);
            if (!rawPicUrl) { failed++; return; }

            // 2. Fazer cache permanente no Supabase Storage
            const permanentUrl = await downloadAndCacheAvatar(supabase, tenantId, client.id, rawPicUrl);
            if (!permanentUrl) { failed++; return; }

            // 3. Salvar URL permanente no banco
            const { error: updateErr } = await supabase
              .from('clients')
              .update({ avatar_url: permanentUrl })
              .eq('id', client.id)
              .eq('tenant_id', tenantId);

            if (updateErr) {
              console.warn(`[SyncAvatars] Erro update cliente ${client.id}:`, updateErr.message);
              failed++;
            } else {
              updated++;
            }
          } catch (err) {
            console.warn(`[SyncAvatars] Erro cliente ${client.id}:`, err);
            failed++;
          }
        })
      );

      // Delay entre lotes (exceto no último)
      if (i + BATCH_SIZE < clients.length) {
        await new Promise(r => setTimeout(r, DELAY_MS));
      }
    }

    console.log(
      `[SyncAvatars] tenant=${tenantId} | processados=${clients.length} | atualizados=${updated} | falhas=${failed}`
    );

    return NextResponse.json({
      processed: clients.length,
      updated,
      failed,
      hasMore,
      nextOffset: hasMore ? offset + clients.length : null,
      message: `${updated} avatares atualizados${failed > 0 ? `, ${failed} sem foto disponível` : ''}.`,
    });
  } catch (error: any) {
    console.error('[SyncAvatars] Erro:', error);
    if (error.message?.includes('Não autorizado') || error.message?.includes('Token')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    return NextResponse.json({ error: error.message || 'Erro interno' }, { status: 500 });
  }
}

/**
 * Faz download de uma URL de foto e sobe para Supabase Storage como cache permanente.
 * Retorna a URL pública permanente do Storage, ou null se falhar.
 */
async function downloadAndCacheAvatar(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string,
  picUrl: string
): Promise<string | null> {
  // URL do Storage já é permanente — não reprocessar
  if (picUrl.includes('supabase.co/storage')) return picUrl;

  try {
    const res = await fetch(picUrl, { redirect: 'follow' });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/clients/${clientId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.warn(`[SyncAvatars] Upload Storage falhou (${path}):`, uploadError.message);
      return null;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    return pub.publicUrl || null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();
    const config = getTenantEvolutionConfig(tenantId);

    const { searchParams } = new URL(request.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);
    const offset = parseInt(searchParams.get('offset') || '0');
    const force = searchParams.get('force') === 'true';

    // Buscar clientes do tenant sem avatar (ou todos se force=true)
    let query = supabase
      .from('clients')
      .select('id, phone_normalized, phone, name')
      .eq('tenant_id', tenantId)
      .not('phone_normalized', 'is', null)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (!force) {
      query = query.is('avatar_url', null);
    }

    const { data: clients, error } = await query;

    if (error) {
      console.error('[SyncAvatars] Erro ao buscar clientes:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!clients || clients.length === 0) {
      return NextResponse.json({
        processed: 0,
        updated: 0,
        failed: 0,
        hasMore: false,
        message: 'Nenhum cliente para processar',
      });
    }

    // Verificar se há mais clientes após este lote
    let countQuery = supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .not('phone_normalized', 'is', null);

    if (!force) {
      countQuery = countQuery.is('avatar_url', null);
    }

    const { count: totalCount } = await countQuery;

    const hasMore = (offset + clients.length) < (totalCount ?? 0);

    // Processar em lotes de 10 com 1s de delay
    const BATCH_SIZE = 10;
    const DELAY_MS = 1_000;
    let updated = 0;
    let failed = 0;

    for (let i = 0; i < clients.length; i += BATCH_SIZE) {
      const batch = clients.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(async (client) => {
          try {
            // Montar JID do WhatsApp a partir do telefone normalizado
            const phone = client.phone_normalized || PhoneNormalizer.canonical(client.phone);
            if (!phone || phone.length < 8) {
              failed++;
              return;
            }

            const jid = `${phone}@s.whatsapp.net`;
            const picUrl = await fetchProfilePicUrl(config, jid);

            if (picUrl) {
              const { error: updateErr } = await supabase
                .from('clients')
                .update({ avatar_url: picUrl })
                .eq('id', client.id)
                .eq('tenant_id', tenantId);

              if (updateErr) {
                console.warn(`[SyncAvatars] Erro ao atualizar cliente ${client.id}:`, updateErr.message);
                failed++;
              } else {
                updated++;
              }
            } else {
              // Sem foto disponível — marcar com placeholder vazio para não
              // reprocessar na próxima chamada (evita chamada redundante à Evolution API)
              // Deixamos null — sem foto é o estado correto, será retentado com force=true
              failed++; // conta como "sem foto" mas não é erro real
            }
          } catch (err) {
            console.warn(`[SyncAvatars] Erro no cliente ${client.id}:`, err);
            failed++;
          }
        })
      );

      // Delay entre lotes (exceto no último)
      if (i + BATCH_SIZE < clients.length) {
        await new Promise((r) => setTimeout(r, DELAY_MS));
      }
    }

    console.log(`[SyncAvatars] tenant=${tenantId} | processados=${clients.length} | atualizados=${updated} | sem_foto=${failed}`);

    return NextResponse.json({
      processed: clients.length,
      updated,
      failed,
      hasMore,
      nextOffset: hasMore ? offset + clients.length : null,
    });
  } catch (error: any) {
    console.error('[SyncAvatars] Erro:', error);

    if (error.message?.includes('Não autorizado') || error.message?.includes('Token')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    return NextResponse.json(
      { error: error.message || 'Erro interno' },
      { status: 500 }
    );
  }
}
