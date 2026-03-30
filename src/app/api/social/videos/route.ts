import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

/** GET /api/social/videos — list video library from Meta */
export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) return NextResponse.json({ connected: false, videos: [] });

    const token = config.meta_access_token;
    const accountId = config.meta_ad_account_id?.startsWith('act_')
      ? config.meta_ad_account_id : config.meta_ad_account_id ? `act_${config.meta_ad_account_id}` : null;

    // Get videos from ad account library
    let videos: unknown[] = [];
    if (accountId) {
      try {
        const res = await fetch(
          `${META_BASE}/${accountId}/advideos?fields=id,title,description,thumbnails,length,created_time,status&limit=30&access_token=${token}`
        );
        if (res.ok) {
          const data = await res.json() as { data: unknown[] };
          videos = data.data || [];
        }
      } catch { /* silencioso */ }
    }

    // Also get page videos if page_id configured
    let pageVideos: unknown[] = [];
    if (config.meta_page_id) {
      try {
        const res = await fetch(
          `${META_BASE}/${config.meta_page_id}/videos?fields=id,title,description,thumbnails,length,created_time&limit=20&access_token=${token}`
        );
        if (res.ok) {
          const data = await res.json() as { data: unknown[] };
          pageVideos = data.data || [];
        }
      } catch { /* silencioso */ }
    }

    return NextResponse.json({ connected: true, videos, pageVideos });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

/**
 * POST /api/social/videos — publish Reel via URL
 * Meta requires a publicly accessible video URL for resumable upload
 * Body: { video_url: string, titulo: string, descricao?: string, publicar_reel?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      video_url: string;
      titulo: string;
      descricao?: string;
      publicar_reel?: boolean;
    };

    const supabase = createServerSupabaseClient();
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id, meta_ad_account_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    if (!config?.meta_access_token) return NextResponse.json({ error: 'Meta não configurado' }, { status: 400 });

    const token = config.meta_access_token;

    // Upload video to ad account library first (for ads use)
    let adVideoId: string | undefined;
    if (config.meta_ad_account_id) {
      const accountId = config.meta_ad_account_id.startsWith('act_')
        ? config.meta_ad_account_id : `act_${config.meta_ad_account_id}`;
      try {
        const res = await fetch(`https://graph-video.facebook.com/v23.0/${accountId}/advideos`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_url: body.video_url, title: body.titulo, access_token: token }),
        });
        if (res.ok) {
          const data = await res.json() as { id?: string };
          adVideoId = data.id;
        }
      } catch { /* silencioso */ }
    }

    // Publish as Reel to page if requested
    let reelId: string | undefined;
    if (body.publicar_reel && config.meta_page_id) {
      try {
        const res = await fetch(`${META_BASE}/${config.meta_page_id}/video_reels`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            file_url: body.video_url,
            description: [body.titulo, body.descricao].filter(Boolean).join('\n\n'),
            published: true,
            access_token: token,
          }),
        });
        if (res.ok) {
          const data = await res.json() as { video_id?: string; id?: string };
          reelId = data.video_id || data.id;
        }
      } catch { /* silencioso */ }
    }

    return NextResponse.json({ ok: true, adVideoId, reelId });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
