/**
 * Script para executar migração SQL no Supabase.
 * Usa o endpoint pg-meta para rodar queries SQL.
 */
const fs = require('fs');

const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

async function runMigration() {
  const sql = fs.readFileSync('supabase/migrations/001_initial_schema.sql', 'utf8');
  
  // Dividir em blocos menores para execução segura
  // Separar por comandos principais (cada CREATE TABLE, etc.)
  const blocks = sql.split(/(?=^(?:CREATE |ALTER |INSERT |DO ))/gm).filter(b => b.trim());
  
  console.log(`📦 Total de blocos SQL: ${blocks.length}`);
  console.log('🚀 Executando migração...\n');
  
  let success = 0;
  let errors = 0;
  
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i].trim();
    if (!block) continue;
    
    // Pegar primeira linha para exibir
    const firstLine = block.split('\n').find(l => l.trim() && !l.startsWith('--')) || '';
    const label = firstLine.substring(0, 60).trim();
    
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
        method: 'POST',
        headers: {
          'apikey': SERVICE_KEY,
          'Authorization': `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: block }),
      });
      
      if (res.ok) {
        console.log(`  ✅ [${i+1}/${blocks.length}] ${label}`);
        success++;
      } else {
        const err = await res.text();
        // Se o erro é "function does not exist", tentar via query direta
        if (err.includes('exec_sql') || err.includes('not found')) {
          // Tentar via endpoint alternativo
          const res2 = await fetch(`${SUPABASE_URL}/pg/query`, {
            method: 'POST',
            headers: {
              'apikey': SERVICE_KEY,
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: block }),
          });
          if (res2.ok) {
            console.log(`  ✅ [${i+1}/${blocks.length}] ${label}`);
            success++;
          } else {
            console.log(`  ⚠️  [${i+1}/${blocks.length}] ${label}`);
            console.log(`      ${(await res2.text()).substring(0, 100)}`);
            errors++;
          }
        } else {
          console.log(`  ⚠️  [${i+1}/${blocks.length}] ${label}`);
          console.log(`      ${err.substring(0, 100)}`);
          errors++;
        }
      }
    } catch (e) {
      console.log(`  ❌ [${i+1}/${blocks.length}] ${label}`);
      console.log(`      ${e.message}`);
      errors++;
    }
  }
  
  console.log(`\n📊 Resultado: ${success} sucesso, ${errors} erros`);
}

runMigration();
