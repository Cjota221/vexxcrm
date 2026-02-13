/**
 * API Intelligence — Sales Assistant
 *
 * GET  /api/intelligence/assistant?client_id=xxx — Insight de um cliente
 * POST /api/intelligence/assistant — Gerar insights em batch
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { SalesAssistant } from '@/lib/services/sales-assistant';

async function getAuth(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return null;

  const token = authHeader.replace('Bearer ', '');
  const supabase = createServerSupabaseClient();

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id')
    .eq('id', user.id)
    .single();

  if (!profile) return null;

  return { supabase, tenantId: profile.tenant_id };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { supabase, tenantId } = auth;
    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('client_id');

    if (!clientId) {
      return NextResponse.json(
        { error: 'client_id é obrigatório' },
        { status: 400 }
      );
    }

    const assistant = new SalesAssistant(supabase, tenantId);
    const insight = await assistant.getClientInsight(clientId);

    if (!insight) {
      return NextResponse.json(
        { error: 'Cliente não encontrado' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      insight,
    });
  } catch (error) {
    console.error('Assistant GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuth(request);
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const { supabase, tenantId } = auth;
    const body = await request.json().catch(() => ({}));
    const limit = body.limit || 50;

    const assistant = new SalesAssistant(supabase, tenantId);
    const result = await assistant.generateBatchInsights(limit);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Assistant POST error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Erro interno' },
      { status: 500 }
    );
  }
}
