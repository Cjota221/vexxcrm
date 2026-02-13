/**
 * API Intelligence — Behavioral Events
 *
 * POST /api/intelligence/events — Registrar evento(s) comportamental(is)
 * GET  /api/intelligence/events — Consultar eventos de um cliente
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createLearningLogger } from '@/lib/services/learning-logger';
import type { EventType, EventCategory } from '@/lib/services/learning-logger';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   POST — Registrar evento(s)
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
    }

    const body = await request.json();
    const logger = createLearningLogger(supabase, tenant.id);

    // Suporta evento único ou array
    const events = Array.isArray(body.events) ? body.events : [body];

    for (const event of events) {
      if (!event.client_id || !event.event_type || !event.category) {
        continue;
      }

      if (event.message_text) {
        await logger.logEventWithSentiment(
          {
            client_id: event.client_id,
            event_type: event.event_type as EventType,
            category: event.category as EventCategory,
            data: event.data,
            channel: event.channel,
            source: event.source,
            session_id: event.session_id,
          },
          event.message_text
        );
      } else {
        await logger.logEvent({
          client_id: event.client_id,
          event_type: event.event_type as EventType,
          category: event.category as EventCategory,
          data: event.data,
          channel: event.channel,
          source: event.source,
          session_id: event.session_id,
          sentiment_score: event.sentiment_score,
          sentiment: event.sentiment,
        });
      }
    }

    // Flush
    const result = await logger.flush();

    return NextResponse.json({
      success: true,
      inserted: result.inserted,
      errors: result.errors,
    });
  } catch (error) {
    console.error('Erro ao registrar eventos:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: String(error) },
      { status: 500 }
    );
  }
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   GET — Consultar eventos
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
    }

    const { data: tenant } = await supabase
      .from('tenants')
      .select('id')
      .eq('owner_id', user.id)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant não encontrado' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');
    const days = parseInt(searchParams.get('days') || '30');

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('behavioral_events')
      .select('*')
      .eq('tenant_id', tenant.id)
      .gte('occurred_at', since)
      .order('occurred_at', { ascending: false })
      .limit(limit);

    if (clientId) {
      query = query.eq('client_id', clientId);
    }

    if (category) {
      query = query.eq('category', category);
    }

    const { data: events, error } = await query;

    if (error) {
      return NextResponse.json({ error: 'Erro na consulta', details: error.message }, { status: 500 });
    }

    // Resumo por categoria
    const summary: Record<string, number> = {};
    for (const e of events || []) {
      summary[e.category] = (summary[e.category] || 0) + 1;
    }

    return NextResponse.json({
      success: true,
      events: events || [],
      total: events?.length || 0,
      summary,
    });
  } catch (error) {
    console.error('Erro na consulta de eventos:', error);
    return NextResponse.json(
      { error: 'Erro interno', details: String(error) },
      { status: 500 }
    );
  }
}
