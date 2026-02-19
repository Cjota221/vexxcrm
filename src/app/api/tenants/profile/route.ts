import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAuthenticatedClient } from '@/lib/supabase';

/**
 * GET /api/tenants/profile
 * Retorna os dados de perfil da loja (nome, cnpj, email, telefone).
 *
 * PUT /api/tenants/profile
 * Atualiza os dados de perfil da loja.
 */

async function getAuth(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) return null;

  const supabaseAuth = createAuthenticatedClient(token);
  const supabase = createServerSupabaseClient();

  const { data: { user }, error } = await supabaseAuth.auth.getUser();
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
  const auth = await getAuth(request);
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { supabase, tenantId } = auth;

  const { data, error } = await supabase
    .from('tenants')
    .select('name, cnpj, contact_email, contact_phone, slug')
    .eq('id', tenantId)
    .single();

  if (error) return NextResponse.json({ error: 'Erro ao buscar perfil' }, { status: 500 });

  return NextResponse.json({
    store_name: data.name || '',
    cnpj: data.cnpj || '',
    contact_email: data.contact_email || '',
    contact_phone: data.contact_phone || '',
    slug: data.slug || '',
  });
}

export async function PUT(request: NextRequest) {
  const auth = await getAuth(request);
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const { supabase, tenantId } = auth;

  const body = await request.json();
  const { store_name, cnpj, contact_email, contact_phone } = body;

  // Montar update apenas com os campos fornecidos
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (store_name !== undefined) update.name = store_name.trim();
  if (cnpj !== undefined) update.cnpj = cnpj.trim();
  if (contact_email !== undefined) update.contact_email = contact_email.trim();
  if (contact_phone !== undefined) update.contact_phone = contact_phone.trim();

  const { data, error } = await supabase
    .from('tenants')
    .update(update)
    .eq('id', tenantId)
    .select('name, cnpj, contact_email, contact_phone, slug')
    .single();

  if (error) {
    console.error('❌ Profile update error:', error);
    return NextResponse.json({ error: 'Erro ao salvar perfil' }, { status: 500 });
  }

  return NextResponse.json({
    store_name: data.name || '',
    cnpj: data.cnpj || '',
    contact_email: data.contact_email || '',
    contact_phone: data.contact_phone || '',
    slug: data.slug || '',
  });
}
