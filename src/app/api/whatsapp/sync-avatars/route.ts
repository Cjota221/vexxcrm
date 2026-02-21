import { NextRequest, NextResponse } from 'next/server';
import { getTenantFromRequest } from '@/lib/auth-helpers';
import { createServerSupabaseClient } from '@/lib/supabase';
import { PhoneNormalizer } from '@/lib/phone-normalizer';
import {
  getTenantEvolutionConfig,
  fetchProfilePicUrl,
} from '@/lib/services/evolution.service';

/**
 * POST /api/whatsapp/sync-avatars
 *
 * Varre clientes do tenant sem avatar_url, busca a foto de perfil na
 * Evolution API e salva permanentemente no Supabase Storage.
 *
 * Query params:
 *   - limit: número máximo de clientes a processar (default: 50, max: 200)
 *
 * Response:
 *   { total, processed, updated, errors, skipped }
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  // Netlify: 10s de timeout — respeitamos 8s
  const MAX_EXECUTION_TIME = 8000;

  try {
    const { tenantId } = await getTenantFromRequest(request);
    const supabase = createServerSupabaseClient();

    const limitParam = request.nextUrl.searchParams.get('limit');
    const limit = Math.min(parseInt(limitParam || '50', 10) || 50, 200);

    // 1. Buscar clientes SEM avatar_url (ou com URL temporária do WhatsApp)
    const { data: clients, error: fetchErr } = await supabase
      .from('clients')
      .select('id, phone, phone_normalized, name, avatar_url')
      .eq('tenant_id', tenantId)
      .or('avatar_url.is.null,avatar_url.eq.')
      .limit(limit);

    if (fetchErr) throw new Error(`Erro ao buscar clientes: ${fetchErr.message}`);
    if (!clients || clients.length === 0) {
      return NextResponse.json({ total: 0, processed: 0, updated: 0, errors: 0, skipped: 0 });
    }

    const config = getTenantEvolutionConfig(tenantId);

    let updated = 0;
    let errors = 0;
    let skipped = 0;

    for (const client of clients) {
      // Checar timeout preventivo
      if (Date.now() - startTime > MAX_EXECUTION_TIME) {
        console.log(`[SyncAvatars] Timeout preventivo após ${updated} atualizações`);
        break;
      }

      const rawPhone = client.phone_normalized || client.phone;
      if (!rawPhone) { skipped++; continue; }

      const canonical = PhoneNormalizer.canonical(rawPhone);
      const jid = `${canonical}@s.whatsapp.net`;

      try {
        // 2. Buscar URL temporária da foto de perfil na Evolution API
        const rawPicUrl = await fetchProfilePicUrl(config, jid).catch(() => null);
        if (!rawPicUrl) { skipped++; continue; }

        // 3. Fazer download e salvar permanentemente no Storage
        const permanentUrl = await cacheProfilePic(supabase, tenantId, client.id, rawPicUrl);
        if (!permanentUrl) { errors++; continue; }

        // 4. Atualizar o cliente no banco
        const { error: updateErr } = await supabase
          .from('clients')
          .update({ avatar_url: permanentUrl })
          .eq('id', client.id)
          .eq('tenant_id', tenantId);

        if (updateErr) {
          console.error(`[SyncAvatars][${client.id}] Erro ao salvar: ${updateErr.message}`);
          errors++;
        } else {
          updated++;
        }
      } catch (err) {
        console.error(`[SyncAvatars][${client.id}] Exceção:`, err);
        errors++;
      }
    }

    const duration = Date.now() - startTime;
    console.log(`[SyncAvatars] Concluído em ${duration}ms — ${updated} atualizados, ${errors} erros, ${skipped} sem número`);

    return NextResponse.json({
      total: clients.length,
      processed: updated + errors + skipped,
      updated,
      errors,
      skipped,
      duration_ms: duration,
    });
  } catch (err: any) {
    console.error('[SyncAvatars] Erro:', err);
    if (err.message?.includes('Não autorizado') || err.message?.includes('Token')) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }
    return NextResponse.json({ error: err.message || 'Erro interno' }, { status: 500 });
  }
}

/**
 * Faz download da foto de perfil e salva permanentemente no Supabase Storage.
 * Retorna URL permanente ou null se falhar.
 */
async function cacheProfilePic(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  tenantId: string,
  clientId: string,
  picUrl: string
): Promise<string | null> {
  const TAG = `[CacheAvatar][${clientId.slice(0, 8)}]`;

  try {
    const res = await fetch(picUrl, { redirect: 'follow' });
    if (!res.ok) {
      console.warn(`${TAG} Download falhou (${res.status})`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${tenantId}/clients/${clientId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, { contentType, upsert: true });

    if (uploadErr) {
      console.error(`${TAG} Upload falhou: ${uploadErr.message}`);
      return null;
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    return pub.publicUrl || null;
  } catch (err) {
    console.error(`${TAG} Exceção: ${err instanceof Error ? err.message : err}`);
    return null;
  }
}
