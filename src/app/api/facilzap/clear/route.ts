import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '@/lib/auth-admin';

/**
 * POST /api/facilzap/clear
 * 
 * Limpa todos os dados sincronizados do FacilZap (produtos, clientes, pedidos)
 * para permitir uma re-sincronização limpa.
 * 
 * Só apaga dados do tenant autenticado (segurança multi-tenant).
 * 
 * Body: { entities?: ('products' | 'clients' | 'orders')[] }
 *   - Se não especificado, apaga tudo
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  try {
    // Autenticação centralizada (usa headers do middleware)
    const auth = await authenticateAdmin(request);
    if (auth instanceof NextResponse) return auth;
    
    const { supabase: supabaseAdmin, tenantId } = auth;

    let body: { entities?: string[] } = {};
    try { body = await request.json(); } catch { body = {}; }

    const entities = body.entities || ['products', 'clients', 'orders'];
    const results = {
      products_deleted: 0,
      clients_deleted: 0,
      orders_deleted: 0,
      errors: [] as string[],
    };

    // Ordem de deleção importante: orders primeiro (tem FK para clients)
    if (entities.includes('orders')) {
      try {
        const { data, error } = await supabaseAdmin
          .from('orders')
          .delete()
          .eq('tenant_id', tenantId)
          .select('id');
        
        if (error) {
          results.errors.push('Pedidos: ' + error.message);
        } else {
          results.orders_deleted = data?.length || 0;
        }
      } catch (e: any) {
        results.errors.push('Pedidos: ' + e.message);
      }
    }

    // Clients: precisa apagar conversations e messages primeiro (FK)
    if (entities.includes('clients')) {
      try {
        // Apagar mensagens das conversas do tenant
        await supabaseAdmin
          .from('messages')
          .delete()
          .eq('tenant_id', tenantId);

        // Apagar conversas do tenant
        await supabaseAdmin
          .from('conversations')
          .delete()
          .eq('tenant_id', tenantId);

        // Agora apagar clientes
        const { data, error } = await supabaseAdmin
          .from('clients')
          .delete()
          .eq('tenant_id', tenantId)
          .select('id');
        
        if (error) {
          results.errors.push('Clientes: ' + error.message);
        } else {
          results.clients_deleted = data?.length || 0;
        }
      } catch (e: any) {
        results.errors.push('Clientes: ' + e.message);
      }
    }

    if (entities.includes('products')) {
      try {
        const { data, error } = await supabaseAdmin
          .from('products')
          .delete()
          .eq('tenant_id', tenantId)
          .select('id');
        
        if (error) {
          results.errors.push('Produtos: ' + error.message);
        } else {
          results.products_deleted = data?.length || 0;
        }
      } catch (e: any) {
        results.errors.push('Produtos: ' + e.message);
      }
    }

    const duration = Date.now() - startTime;
    return NextResponse.json({
      success: true,
      results,
      duration_ms: duration,
      message: `Limpeza concluída: ${results.products_deleted} produtos, ${results.clients_deleted} clientes, ${results.orders_deleted} pedidos removidos`,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: 'Erro ao limpar dados', details: error.message, duration_ms: Date.now() - startTime },
      { status: 500 }
    );
  }
}
