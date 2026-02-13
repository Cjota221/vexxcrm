/**
 * Script de diagnóstico: testa as APIs de intelligence v2 diretamente
 * Usa service_role key para simular as chamadas
 */
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';
const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

const sb = createClient(SUPABASE_URL, SERVICE_KEY);

(async () => {
  try {
    // 1. Verificar orders com client_id
    console.log('=== DIAGNÓSTICO DE DADOS ===\n');
    
    const { count: totalOrders } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID);
    console.log('Total orders:', totalOrders);
    
    const { count: linkedOrders } = await sb.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', TENANT_ID).not('client_id', 'is', null);
    console.log('Orders vinculados (com client_id):', linkedOrders);

    // 2. Checar estrutura de items nos pedidos
    console.log('\n--- Estrutura de items nos pedidos ---');
    const { data: sampleOrders } = await sb.from('orders')
      .select('id, total, items, created_at, status, client_id')
      .eq('tenant_id', TENANT_ID)
      .not('client_id', 'is', null)
      .limit(3);
    
    for (const o of (sampleOrders || [])) {
      console.log(`Order ${o.id}:`);
      console.log(`  total: ${o.total}, status: ${o.status}, created_at: ${o.created_at}`);
      console.log(`  items type: ${typeof o.items}, isArray: ${Array.isArray(o.items)}`);
      if (o.items) {
        const items = Array.isArray(o.items) ? o.items : [];
        if (items.length > 0) {
          console.log(`  first item keys: ${Object.keys(items[0]).join(', ')}`);
          console.log(`  first item:`, JSON.stringify(items[0]).substring(0, 200));
        } else {
          console.log('  items empty array or not array');
        }
      } else {
        console.log('  items is null/undefined');
      }
    }

    // 3. Verificar date ranges - fevereiro 2026 é carnaval
    console.log('\n--- Date ranges de pedidos ---');
    const { data: dateRange } = await sb.from('orders')
      .select('created_at')
      .eq('tenant_id', TENANT_ID)
      .not('client_id', 'is', null)
      .order('created_at', { ascending: true })
      .limit(1);
    
    const { data: dateRangeEnd } = await sb.from('orders')
      .select('created_at')
      .eq('tenant_id', TENANT_ID)
      .not('client_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (dateRange?.[0]) console.log('Primeiro pedido:', dateRange[0].created_at);
    if (dateRangeEnd?.[0]) console.log('Último pedido:', dateRangeEnd[0].created_at);

    // 4. Verificar tabelas v2
    console.log('\n--- Tabelas Intelligence v2 ---');
    const tables = ['seasonal_events', 'client_seasonal_profiles', 'product_trends', 'product_affinity', 'client_grade_preferences'];
    for (const t of tables) {
      const { count } = await sb.from(t).select('id', { count: 'exact', head: true });
      console.log(`${t}: ${count} registros`);
    }

    // 5. Verificar colunas v2 em clients
    console.log('\n--- Colunas v2 em clients ---');
    const { data: clientSample } = await sb.from('clients')
      .select('id, seasonal_buyer, seasonal_score, preferred_season, variety_score, price_sensitivity, reorder_rate, sales_script_hint, last_insight_at')
      .eq('tenant_id', TENANT_ID)
      .limit(1);
    if (clientSample?.[0]) {
      console.log('Amostra cliente:', JSON.stringify(clientSample[0], null, 2));
    }

    // 6. Tentar simular o que SeasonalAnalyzer.analyze() faz
    console.log('\n--- Simulação SeasonalAnalyzer ---');
    const { data: orders } = await sb.from('orders')
      .select('id, client_id, total, items, created_at, status')
      .eq('tenant_id', TENANT_ID)
      .not('client_id', 'is', null)
      .order('created_at', { ascending: false })
      .range(0, 999);
    
    console.log('Orders carregados:', (orders || []).length);
    
    if (orders && orders.length > 0) {
      // Simular análise do Carnaval 2026 (fev)
      const carnavalStart = new Date(2026, 1, 1).toISOString();
      const carnavalEnd = new Date(2026, 1, 28).toISOString();
      const carnavalOrders = orders.filter(o => o.created_at >= carnavalStart && o.created_at <= carnavalEnd);
      console.log(`Carnaval 2026 (fev): ${carnavalOrders.length} pedidos`);

      // Check 2025 ranges
      const carnaval25Start = new Date(2025, 1, 1).toISOString();
      const carnaval25End = new Date(2025, 1, 28).toISOString();
      const carnaval25 = orders.filter(o => o.created_at >= carnaval25Start && o.created_at <= carnaval25End);
      console.log(`Carnaval 2025 (fev): ${carnaval25.length} pedidos`);

      // Check ALL months
      for (let m = 0; m < 12; m++) {
        const mStart = new Date(2025, m, 1).toISOString();
        const mEnd = new Date(2025, m + 1, 0).toISOString();
        const monthOrders = orders.filter(o => o.created_at >= mStart && o.created_at <= mEnd);
        if (monthOrders.length > 0) {
          console.log(`  2025-${String(m+1).padStart(2,'0')}: ${monthOrders.length} pedidos`);
        }
      }
      for (let m = 0; m < 12; m++) {
        const mStart = new Date(2026, m, 1).toISOString();
        const mEnd = new Date(2026, m + 1, 0).toISOString();
        const monthOrders = orders.filter(o => o.created_at >= mStart && o.created_at <= mEnd);
        if (monthOrders.length > 0) {
          console.log(`  2026-${String(m+1).padStart(2,'0')}: ${monthOrders.length} pedidos`);
        }
      }
    }

  } catch (e) {
    console.error('Error:', e.message, e.stack);
  }
  process.exit(0);
})();
