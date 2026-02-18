/**
 * fetch-avatars.js
 * 
 * Busca fotos de perfil via Evolution API para todos os clientes que
 * não têm avatar_url, faz upload para o Supabase Storage (bucket "avatars")
 * e atualiza clients.avatar_url com a URL permanente.
 * 
 * Uso:
 *   node scripts/fetch-avatars.js
 *   node scripts/fetch-avatars.js --limit=100   (processa apenas 100 por vez)
 *   node scripts/fetch-avatars.js --overwrite    (refaz mesmo quem já tem foto)
 * 
 * ⚠️  Rate limit: pausamos 300ms entre cada chamada à Evolution API para
 *    não ser bloqueado como spam.
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const TENANT_ID = '8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd';
const DELAY_MS   = 400;   // pausa entre chamadas à Evolution API
const BATCH_SIZE = 50;    // clientes por lote antes de pausa maior

const args = process.argv.slice(2);
const LIMIT    = parseInt((args.find(a => a.startsWith('--limit=')) || '--limit=500').split('=')[1]);
const OVERWRITE = args.includes('--overwrite');

// ── Configuração Evolution API ────────────────────────────────────────────────
// instanceName é gerado deterministicamente: vexx-{primeiros 12 chars sem hífens}
const EVOLUTION_URL      = process.env.EVOLUTION_API_URL?.replace(/\/$/, '');
const EVOLUTION_API_KEY  = process.env.EVOLUTION_GLOBAL_KEY || process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = `vexx-${TENANT_ID.replace(/-/g,'').slice(0,12)}`;

if (!EVOLUTION_URL || !EVOLUTION_API_KEY) {
  console.error('❌ Variáveis de ambiente da Evolution API não encontradas.');
  console.error('   Precisamos de: EVOLUTION_API_URL e EVOLUTION_GLOBAL_KEY');
  process.exit(1);
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/** Pausa assíncrona */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/** 
 * Busca URL da foto de perfil via Evolution API.
 * Retorna null se não disponível (privacidade, offline, etc).
 */
async function fetchProfilePicUrl(phone) {
  try {
    const res = await fetch(
      `${EVOLUTION_URL}/chat/fetchProfilePictureUrl/${EVOLUTION_INSTANCE}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': EVOLUTION_API_KEY,
        },
        body: JSON.stringify({ number: phone }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.profilePictureUrl || data.profilePicUrl || data.picture || null;
  } catch {
    return null;
  }
}

/**
 * Baixa imagem de uma URL e faz upload para o Supabase Storage.
 * Retorna a URL pública permanente ou null em caso de falha.
 */
async function cacheAvatarInStorage(clientId, imageUrl) {
  try {
    const res = await fetch(imageUrl, { redirect: 'follow' });
    if (!res.ok) return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const path = `${TENANT_ID}/clients/${clientId}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('avatars')
      .upload(path, buffer, {
        contentType,
        upsert: true,
      });

    if (upErr) {
      // Se o bucket não existir, tenta criar
      if (upErr.message?.includes('not found') || upErr.message?.includes('Bucket')) {
        await supabase.storage.createBucket('avatars', { public: true });
        const { error: retry } = await supabase.storage
          .from('avatars')
          .upload(path, buffer, { contentType, upsert: true });
        if (retry) return null;
      } else {
        return null;
      }
    }

    const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
    return pub.publicUrl || null;
  } catch {
    return null;
  }
}

async function main() {
  console.log('🖼️  FETCH AVATARS — Buscando fotos de perfil WhatsApp\n');
  console.log(`   Instância: ${EVOLUTION_INSTANCE}`);
  console.log(`   Limite:    ${LIMIT} clientes`);
  console.log(`   Overwrite: ${OVERWRITE ? 'sim' : 'não (só quem não tem foto)'}\n`);

  // ── Buscar clientes sem foto ──────────────────────────────────────────────
  let query = supabase
    .from('clients')
    .select('id, name, phone, phone_normalized')
    .eq('tenant_id', TENANT_ID)
    .not('phone', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (!OVERWRITE) {
    query = query.or('avatar_url.is.null,avatar_url.eq.');
  }

  const { data: clients, error } = await query;
  if (error) {
    console.error('❌ Erro ao buscar clientes:', error.message);
    process.exit(1);
  }

  console.log(`👥 Clientes para processar: ${clients?.length ?? 0}\n`);

  let found = 0, cached = 0, noPhoto = 0, errors = 0;

  for (let i = 0; i < (clients?.length ?? 0); i++) {
    const c = clients[i];
    
    // Extrair número limpo (sem DDI duplicado)
    const rawPhone = c.phone_normalized || c.phone || '';
    const phoneDigits = rawPhone.replace(/\D/g, '');
    
    // Evolution API aceita o número com DDI: 5511999998888
    const phone = phoneDigits.startsWith('55') ? phoneDigits : '55' + phoneDigits;

    process.stdout.write(`  [${i + 1}/${clients.length}] ${c.name?.substring(0, 25).padEnd(25)} `);

    // Buscar URL da foto
    const picUrl = await fetchProfilePicUrl(phone);
    if (!picUrl) {
      process.stdout.write(`⚫ sem foto\n`);
      noPhoto++;
      await sleep(DELAY_MS);
      continue;
    }

    found++;
    process.stdout.write(`📸 foto encontrada → `);

    // Fazer cache no Storage
    const storedUrl = await cacheAvatarInStorage(c.id, picUrl);
    const finalUrl = storedUrl || picUrl; // Fallback: usar URL temporária se storage falhar

    // Atualizar no banco
    const { error: upErr } = await supabase
      .from('clients')
      .update({ avatar_url: finalUrl })
      .eq('id', c.id)
      .eq('tenant_id', TENANT_ID);

    if (upErr) {
      process.stdout.write(`❌ erro DB\n`);
      errors++;
    } else {
      if (storedUrl) {
        process.stdout.write(`✅ salva no Storage\n`);
        cached++;
      } else {
        process.stdout.write(`⚠️  salva URL temporária\n`);
      }
    }

    // Pausa entre chamadas
    await sleep(DELAY_MS);

    // A cada BATCH_SIZE, pausa mais longa
    if ((i + 1) % BATCH_SIZE === 0) {
      console.log(`\n   ⏸  Pausa de 3s após ${BATCH_SIZE} itens...\n`);
      await sleep(3000);
    }
  }

  // ── Resumo ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════════════════════════════');
  console.log('📊 RESUMO:');
  console.log(`   📸 Fotos encontradas:    ${found}`);
  console.log(`   ✅ Salvas no Storage:    ${cached}`);
  console.log(`   ⚫ Sem foto (privado):   ${noPhoto}`);
  console.log(`   ❌ Erros:               ${errors}`);
  console.log('═══════════════════════════════════════\n');
}

main().catch(console.error);
