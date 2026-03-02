#!/usr/bin/env node

/**
 * Script simples para testar a API de clientes localmente
 * 
 * Uso:
 * node scripts/test-client-orders.js {clientId}
 */

const clientId = process.argv[2];

if (!clientId) {
  console.error('❌ Uso: node scripts/test-client-orders.js {clientId}');
  process.exit(1);
}

const baseUrl = 'http://localhost:3000';

async function test() {
  console.log(`\n🔍 Testando GET /api/clients/${clientId}\n`);

  try {
    const res = await fetch(`${baseUrl}/api/clients/${clientId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        // Se precisar auth, adicionar aqui
      },
    });

    console.log(`Status: ${res.status}\n`);

    if (!res.ok) {
      const err = await res.text();
      console.error('❌ Erro:', err);
      process.exit(1);
    }

    const data = await res.json();
    console.log('✅ Resposta recebida');
    console.log('\n📊 Cliente:');
    console.log(`   ID: ${data.data?.id}`);
    console.log(`   Nome: ${data.data?.name}`);
    console.log(`   Telefone: ${data.data?.phone}`);

    console.log('\n📦 Pedidos:');
    const orders = data.data?.recent_orders ?? [];
    if (orders.length === 0) {
      console.log('   ⚠️  NENHUM PEDIDO RETORNADO');
      console.log('\n   Possíveis causas:');
      console.log('   1. Cliente não tem pedidos no banco');
      console.log('   2. Pedidos estão órfãos (client_id=null)');
      console.log('   3. Telefone do cliente não corresponde aos pedidos');
    } else {
      console.log(`   ✅ ${orders.length} pedido(s) encontrado(s):`);
      orders.forEach((o, i) => {
        console.log(`   ${i + 1}. #${o.external_id ?? o.id} — ${o.status} — R$ ${o.total}`);
      });
    }

    console.log('\n---\n');
  } catch (err) {
    console.error('❌ Erro ao fazer request:', err);
    process.exit(1);
  }
}

test();
