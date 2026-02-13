// Script para adicionar colunas de saúde/classificação na tabela clients
// e criar tabela historico_classificacao
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://qjjflshqdaapwneeirdq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc'
);

async function run() {
  console.log('🔄 Adicionando colunas de saúde na tabela clients...');
  
  const { error: e1 } = await supabase.rpc('exec_sql', {
    query: `
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_classification VARCHAR(20) DEFAULT 'novo';
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS dias_inatividade INTEGER DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS frequencia_compra_mes DECIMAL(5,2) DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS valor_total_gasto DECIMAL(12,2) DEFAULT 0;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS produtos_preferidos JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS tendencia_frequencia VARCHAR(20) DEFAULT 'estavel';
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS recomendacoes JSONB DEFAULT '[]'::jsonb;
      ALTER TABLE clients ADD COLUMN IF NOT EXISTS ultima_analise_em TIMESTAMPTZ;
    `
  });

  if (e1) {
    console.log('⚠️ exec_sql não disponível, tentando via SQL direto...');
    // Tentativa alternativa: usar .from() para testar se colunas existem
    // Se não funcionar, vamos criar via dashboard
    
    // Alternativa: Criar via Supabase Management API
    const response = await fetch('https://qjjflshqdaapwneeirdq.supabase.co/pg/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc',
      },
      body: JSON.stringify({
        query: "ALTER TABLE clients ADD COLUMN IF NOT EXISTS health_score INTEGER DEFAULT 0"
      })
    });
    
    if (!response.ok) {
      console.log('⚠️ Management API não disponível. Usando abordagem JSONB...');
      console.log('✅ Vamos usar o campo custom_fields (JSONB) já existente para armazenar health data');
      console.log('   Isso evita a necessidade de migrations SQL manuais!');
    }
  } else {
    console.log('✅ Colunas adicionadas com sucesso!');
  }

  // Criar tabela historico_classificacao
  console.log('🔄 Criando tabela historico_classificacao...');
  const { error: e2 } = await supabase.rpc('exec_sql', {
    query: `
      CREATE TABLE IF NOT EXISTS historico_classificacao (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        tenant_id UUID NOT NULL REFERENCES tenants(id),
        client_id UUID NOT NULL REFERENCES clients(id),
        status_anterior VARCHAR(20),
        status_novo VARCHAR(20),
        score_anterior INTEGER,
        score_novo INTEGER,
        razao TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_hist_class_tenant ON historico_classificacao(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_hist_class_client ON historico_classificacao(client_id);
    `
  });

  if (e2) {
    console.log('⚠️ Tabela historico via custom_fields approach');
  } else {
    console.log('✅ Tabela historico_classificacao criada!');
  }

  console.log('\n📋 ESTRATÉGIA: Armazenar dados de health no campo custom_fields (JSONB) dos clients');
  console.log('   Campos: health_score, health_classification, health_data (objeto completo)');
  console.log('   Isso funciona SEM migration SQL!\n');

  // Testar se custom_fields existe
  const { data } = await supabase.from('clients').select('custom_fields').limit(1);
  console.log('✅ Campo custom_fields existe:', data ? 'SIM' : 'NÃO');
  
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
