/**
 * Deleta campanhas de teste na Meta API e marca como 'deletado' no Supabase.
 * Rodar: npx ts-node scripts/deletar-campanhas-teste.ts
 */

import { createClient } from '@supabase/supabase-js';

const META_API = 'https://graph.facebook.com/v21.0';
const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';

const campanhasParaDeletar = [
  '120243149864890382',
  '120243150326030382',
  '120243150478350382',
  '120243150879720382',
  '120243151076720382',
];

async function main() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('❌ META_ACCESS_TOKEN não definido');
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não definidos');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  for (const campaignId of campanhasParaDeletar) {
    console.log(`\n→ Deletando campanha ${campaignId}...`);

    // 1. DELETE na Meta API
    const url = `${META_API}/${campaignId}?access_token=${encodeURIComponent(accessToken)}`;
    let metaOk = false;
    try {
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json() as { success?: boolean; error?: { message: string; code: number } };

      if (json.success) {
        console.log(`  ✅ Meta: deletada com sucesso`);
        metaOk = true;
      } else {
        console.warn(`  ⚠️  Meta: ${json.error?.message ?? JSON.stringify(json)}`);
        // Segue para atualizar o Supabase mesmo assim (campanha pode já ter sido deletada)
        metaOk = true;
      }
    } catch (err) {
      console.error(`  ❌ Meta: erro de rede — ${err}`);
    }

    if (!metaOk) continue;

    // 2. UPDATE no Supabase
    const { error: dbErr, count } = await supabase
      .from('meta_campaign_drafts')
      .update({ status: 'deletado' })
      .eq('meta_campaign_id', campaignId)
      .eq('tenant_id', TENANT_ID);

    if (dbErr) {
      console.error(`  ❌ Supabase: ${dbErr.message}`);
    } else {
      console.log(`  ✅ Supabase: ${count ?? '?'} linha(s) atualizada(s) para 'deletado'`);
    }
  }

  console.log('\n✅ Concluído.');
}

main();
