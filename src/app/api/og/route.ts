import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/og?url=https://...
 *
 * Busca metadados Open Graph de uma URL (server-side, evita CORS).
 * Retorna: { title, description, image, favicon, domain }
 * Cache de 1h por URL via Cache-Control.
 */
export const runtime = 'nodejs';

interface OGData {
  title: string | null;
  description: string | null;
  image: string | null;
  favicon: string | null;
  domain: string;
}

function extractMeta(html: string, property: string): string | null {
  // og: e twitter: e name=
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${property}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return m?.[1]?.trim() || null;
}

function extractFavicon(html: string, baseUrl: string): string | null {
  const origin = new URL(baseUrl).origin;
  const m = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
  if (m?.[1]) {
    const href = m[1];
    if (href.startsWith('http')) return href;
    if (href.startsWith('//')) return `https:${href}`;
    if (href.startsWith('/')) return `${origin}${href}`;
    return `${origin}/${href}`;
  }
  return `${origin}/favicon.ico`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url');
  if (!url || !/^https?:\/\//.test(url)) {
    return NextResponse.json({ error: 'URL inválida' }, { status: 400 });
  }

  try {
    const domain = new URL(url).hostname.replace(/^www\./, '');

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VexxBot/1.0; +https://vexxcrm.com.br)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    });

    if (!res.ok) {
      return NextResponse.json({ title: null, description: null, image: null, favicon: null, domain } satisfies OGData, {
        headers: { 'Cache-Control': 'public, max-age=300' },
      });
    }

    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
      // Para imagens/PDFs diretos — mostrar só o domínio
      return NextResponse.json({ title: null, description: null, image: ct.startsWith('image/') ? url : null, favicon: null, domain } satisfies OGData, {
        headers: { 'Cache-Control': 'public, max-age=3600' },
      });
    }

    // Ler só os primeiros 50KB (suficiente para head)
    const reader = res.body?.getReader();
    if (!reader) throw new Error('no body');
    let html = '';
    while (html.length < 50_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      if (html.toLowerCase().includes('</head>')) break;
    }
    reader.cancel().catch(() => {});

    const title = extractMeta(html, 'og:title') || extractTitle(html);
    const description = extractMeta(html, 'og:description') || extractMeta(html, 'description');
    let image = extractMeta(html, 'og:image') || extractMeta(html, 'twitter:image') || extractMeta(html, 'twitter:image:src');
    const favicon = extractFavicon(html, url);

    // Resolver imagem relativa
    if (image && !image.startsWith('http')) {
      const origin = new URL(url).origin;
      image = image.startsWith('//') ? `https:${image}` : image.startsWith('/') ? `${origin}${image}` : `${origin}/${image}`;
    }

    const data: OGData = { title, description, image, favicon, domain };

    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, max-age=3600' },
    });
  } catch {
    return NextResponse.json(
      { title: null, description: null, image: null, favicon: null, domain: '' } satisfies OGData,
      { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } }
    );
  }
}
