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
          const TAG = `[SyncAvatars][${client.id.slice(0, 8)}][${client.phone_normalized || client.phone}]`;
          try {
            const phone = client.phone_normalized || PhoneNormalizer.canonical(client.phone || '');
            if (!phone || phone.length < 8) {
              console.warn(`${TAG} ❌ Telefone inválido: "${phone}" — pulando`);
              failed++; return;
            }

            const jid = `${phone}@s.whatsapp.net`;
            console.log(`${TAG} avatar_atual: ${client.avatar_url ? client.avatar_url.substring(0, 60) : 'null'}`);
            console.log(`${TAG} Buscando foto via Evolution API para JID: ${jid}`);

            // 1. Buscar URL atual da foto via Evolution API
            const rawPicUrl = await fetchProfilePicUrl(config, jid);
            console.log(`${TAG} rawPicUrl da Evolution: ${rawPicUrl ? rawPicUrl.substring(0, 80) : 'null (sem foto)'}`);

            if (!rawPicUrl) {
              console.warn(`${TAG} ❌ Evolution API não retornou foto — failed++`);
              failed++; return;
            }

            // 2. Fazer cache permanente no Supabase Storage
            console.log(`${TAG} Iniciando downloadAndCacheAvatar...`);
            const permanentUrl = await downloadAndCacheAvatar(supabase, tenantId, client.id, rawPicUrl);
            console.log(`${TAG} permanentUrl: ${permanentUrl ? permanentUrl.substring(0, 80) : 'null (upload falhou)'}`);

            if (!permanentUrl) {
              console.warn(`${TAG} ❌ Download/upload para Storage falhou — failed++`);
              failed++; return;
            }

            // 3. Salvar URL permanente no banco
            const { error: updateErr } = await supabase
              .from('clients')
              .update({ avatar_url: permanentUrl })
              .eq('id', client.id)
              .eq('tenant_id', tenantId);

            if (updateErr) {
              console.error(`${TAG} ❌ Erro ao salvar no banco: ${updateErr.message}`);
              failed++;
            } else {
              console.log(`${TAG} ✅ avatar_url atualizado com sucesso no banco`);
              updated++;
            }
          } catch (err) {
            console.error(`[SyncAvatars][${client.id}] ❌ Exceção: ${err instanceof Error ? err.message : err}`);
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
  const TAG = `[DownloadCache][${clientId.slice(0, 8)}]`;

  // URL do Storage já é permanente — não reprocessar
  if (picUrl.includes('supabase.co/storage')) {
    console.log(`${TAG} URL já é do Storage — pulando download`);
    return picUrl;
  }

  try {
    console.log(`${TAG} Fazendo fetch: ${picUrl.substring(0, 80)}`);
    const res = await fetch(picUrl, { redirect: 'follow' });
    console.log(`${TAG} HTTP status: ${res.status} ${res.statusText}`);

    if (!res.ok) {
      console.warn(`${TAG} ❌ Fetch falhou (${res.status}) — retornando null`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/clients/${clientId}.${ext}`;

    console.log(`${TAG} Upload para Storage: avatars/${path} — ${buffer.byteLength} bytes (${contentType})`);

    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType, upsert: true });

    if (uploadError) {
      console.error(`${TAG} ❌ Upload falhou: ${uploadError.message} — retornando null`);
      return null;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    console.log(`${TAG} ✅ Upload OK — publicUrl: ${pub.publicUrl?.substring(0, 80)}`);
    return pub.publicUrl || null;
  } catch (err) {
    console.error(`${TAG} ❌ Exceção: ${err instanceof Error ? err.message : err} — retornando null`);
    return null;
  }
}
