/**
 * Diagnóstico da sincronização WhatsApp
 * Verifica se os dados estão sendo salvos corretamente
 * 
 * Uso: node scripts/diagnose-sync.js
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function diagnose() {
  console.log('🔍 DIAGNÓSTICO DE SINCRONIZAÇÃO WHATSAPP\n');
  console.log('='.repeat(50));

  // 1. Buscar tenants
  const { data: tenants } = await supabase.from('tenants').select('id, name');
  console.log(`\n📦 Tenants encontrados: ${tenants?.length || 0}`);
  
  for (const tenant of (tenants || [])) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`🏢 TENANT: ${tenant.name} (${tenant.id})`);
    console.log('─'.repeat(50));

    // 2. Contar clientes
    const { count: clientCount } = await supabase
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id);
    console.log(`👤 Clientes: ${clientCount || 0}`);

    // 3. Contar conversas
    const { count: convCount } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id);
    console.log(`💬 Conversas: ${convCount || 0}`);

    // 4. Conversas com last_message_at NULL (não aparecem na lista!)
    const { count: convNullCount } = await supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id)
      .is('last_message_at', null);
    console.log(`⚠️  Conversas sem last_message_at: ${convNullCount || 0}`);

    // 5. Contar mensagens
    const { count: msgCount } = await supabase
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenant.id);
    console.log(`📨 Mensagens: ${msgCount || 0}`);

    // 6. Conversas por canal
    const { data: byChannel } = await supabase
      .from('conversations')
      .select('channel')
      .eq('tenant_id', tenant.id);
    
    const channels = {};
    for (const c of (byChannel || [])) {
      channels[c.channel] = (channels[c.channel] || 0) + 1;
    }
    console.log(`📱 Por canal:`, channels);

    // 7. Últimas 5 conversas
    const { data: recentConvs } = await supabase
      .from('conversations')
      .select(`
        id,
        channel,
        status,
        last_message_at,
        last_message_text,
        unread_count,
        client:clients!conversations_client_id_fkey (
          name,
          phone
        )
      `)
      .eq('tenant_id', tenant.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(5);

    console.log(`\n📋 Últimas 5 conversas:`);
    for (const conv of (recentConvs || [])) {
      const clientName = conv.client?.name || 'Sem cliente';
      const phone = conv.client?.phone || '?';
      const lastMsg = conv.last_message_at 
        ? new Date(conv.last_message_at).toLocaleString('pt-BR')
        : 'NULL';
      console.log(`   - ${clientName} (${phone}) | ${conv.channel} | última: ${lastMsg}`);
    }

    // 8. Verificar conversas órfãs (sem client)
    const { data: orphanConvs } = await supabase
      .from('conversations')
      .select('id, contact_phone')
      .eq('tenant_id', tenant.id)
      .is('client_id', null);
    
    if (orphanConvs && orphanConvs.length > 0) {
      console.log(`\n⚠️  Conversas ÓRFÃS (sem client_id): ${orphanConvs.length}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Diagnóstico completo!');
}

diagnose().catch(console.error);
