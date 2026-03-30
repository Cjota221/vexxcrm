/**
 * GET  /api/social/posts   → list posts from Meta Page + local scheduled
 * POST /api/social/posts   → create/schedule a post (stores in social_posts table)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { getTenantFromRequest } from '@/lib/auth-helpers';

import { META_BASE } from '@/lib/meta-config';

async function getPageToken(userToken: string, pageId: string): Promise<string> {
  const res = await fetch(`${META_BASE}/${pageId}?fields=access_token&access_token=${userToken}`);
  if (!res.ok) return userToken; // fallback to user token
  const data = await res.json() as { access_token?: string };
  return data.access_token || userToken;
}

export async function GET(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const supabase = createServerSupabaseClient();

    // Get Meta config
    const { data: config } = await supabase
      .from('ai_provider_config')
      .select('meta_access_token, meta_page_id, meta_instagram_id')
      .eq('tenant_id', profile.tenant_id)
      .single();

    // Local scheduled posts
    const { data: localPosts } = await supabase
      .from('social_posts')
      .select('*')
      .eq('tenant_id', profile.tenant_id)
      .order('created_at', { ascending: false })
      .limit(50);

    if (!config?.meta_access_token || !config?.meta_page_id) {
      return NextResponse.json({ connected: false, posts: localPosts || [], pagePosts: [] });
    }

    // Get page token + page name in parallel with posts
    const pageToken = await getPageToken(config.meta_access_token, config.meta_page_id);

    // Fetch page name + recent posts in parallel
    const [pageInfoRes, postsRes] = await Promise.all([
      fetch(`${META_BASE}/${config.meta_page_id}?fields=name,picture{url}&access_token=${pageToken}`)
        .catch(() => null),
      fetch(
        `${META_BASE}/${config.meta_page_id}/posts?fields=${encodeURIComponent(
          'id,message,story,full_picture,created_time,permalink_url,likes.summary(true),comments.summary(true)'
        )}&limit=20&access_token=${pageToken}`
      ).catch(() => null),
    ]);

    let pageName: string | undefined;
    let pagePhoto: string | undefined;
    if (pageInfoRes?.ok) {
      const info = await pageInfoRes.json() as { name?: string; picture?: { data?: { url?: string } } };
      pageName = info.name;
      pagePhoto = info.picture?.data?.url;
    }

    let pagePosts: unknown[] = [];
    if (postsRes?.ok) {
      const data = await postsRes.json() as { data: unknown[] };
      pagePosts = data.data || [];
    }

    return NextResponse.json({
      connected: true,
      pageId: config.meta_page_id,
      pageName,
      pagePhoto,
      instagramId: config.meta_instagram_id,
      posts: localPosts || [],
      pagePosts,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { profile } = await getTenantFromRequest(req);
    const body = await req.json() as {
      tipo: string;
      legenda: string;
      hashtags?: string;
      media_url?: string;
      agendado_para?: string;
      publicar_agora?: boolean;
    };
    const supabase = createServerSupabaseClient();

    const status = body.agendado_para ? 'agendado' : (body.publicar_agora ? 'publicado' : 'rascunho');

    let metaPostId: string | undefined;

    // If publishing now, call Meta API
    if (body.publicar_agora) {
      const { data: config } = await supabase
        .from('ai_provider_config')
        .select('meta_access_token, meta_page_id')
        .eq('tenant_id', profile.tenant_id)
        .single();

      if (config?.meta_access_token && config?.meta_page_id) {
        try {
          const pageToken = await getPageToken(config.meta_access_token, config.meta_page_id);
          const caption = [body.legenda, body.hashtags].filter(Boolean).join('\n\n');
          const payload: Record<string, string> = { message: caption, access_token: pageToken };
          if (body.media_url) payload.url = body.media_url;

          const endpoint = body.media_url
            ? `${META_BASE}/${config.meta_page_id}/photos`
            : `${META_BASE}/${config.meta_page_id}/feed`;

          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            const data = await res.json() as { id?: string };
            metaPostId = data.id;
          }
        } catch { /* store as rascunho on failure */ }
      }
    }

    const { data, error } = await supabase.from('social_posts').insert({
      tenant_id: profile.tenant_id,
      tipo: body.tipo || 'post',
      legenda: body.legenda,
      hashtags: body.hashtags,
      media_url: body.media_url,
      agendado_para: body.agendado_para || null,
      publicado_em: body.publicar_agora && metaPostId ? new Date().toISOString() : null,
      meta_post_id: metaPostId,
      status: metaPostId ? 'publicado' : status,
    }).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, post: data });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
