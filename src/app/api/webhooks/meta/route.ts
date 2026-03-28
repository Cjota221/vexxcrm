import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/webhooks/meta
 * Meta webhook verification endpoint.
 * Called by Meta when you register a webhook URL in the App Dashboard.
 */
export async function GET(req: NextRequest) {
  const mode      = req.nextUrl.searchParams.get('hub.mode');
  const token     = req.nextUrl.searchParams.get('hub.verify_token');
  const challenge = req.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }

  return new Response('Forbidden', { status: 403 });
}

/**
 * POST /api/webhooks/meta
 * Receives Instagram / Facebook webhook events.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log('[Meta Webhook]', JSON.stringify(body));
    // TODO: handle specific events (messages, comments, etc.)
    return NextResponse.json({ received: true });
  } catch {
    return NextResponse.json({ received: true });
  }
}
