import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { processCartRecoveryQueue } from '@/lib/services/cart-recovery';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v2/anne/recovery-queue/process
 *
 * Endpoint chamado pelo cron (Netlify Scheduled Functions ou similar).
 * Processa entradas vencidas na anne_recovery_queue.
 *
 * Segurança: requer header X-Cron-Secret ou Authorization Bearer.
 */
export async function GET(request: NextRequest) {
  // Verificação simples — em produção usar CRON_SECRET env var
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const supabase = createServerSupabaseClient();
    const stats = await processCartRecoveryQueue(supabase);

    console.log('[CronJob] Cart recovery queue processed:', stats);
    return NextResponse.json({ ok: true, stats, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[CronJob] Error processing queue:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
