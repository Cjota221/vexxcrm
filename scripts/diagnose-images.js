#!/usr/bin/env node

/**
 * Script de diagnóstico — Imagens não aparecendo
 * 
 * Verifica:
 * 1. Se há mensagens com type='image' no banco
 * 2. Se essas mensagens têm media_url preenchida
 * 3. Se as URLs são válidas (resolvem corretamente)
 * 4. Se as imagens estão no Storage do Supabase
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Ler .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) env[match[1]] = match[2];
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis Supabase não configuradas');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('🔍 Diagnóstico: Imagens não aparecendo\n');

  // 1. Buscar estatísticas de mensagens
  console.log('1️⃣  Contagem de mensagens por type:');
  const { data: typeCount, error: typeErr } = await supabase
    .from('messages')
    .select('type', { count: 'exact' })
    .order('type');

  if (typeErr) {
    console.error('❌ Erro ao buscar tipos:', typeErr.message);
  } else {
    const grouped = {};
    (typeCount || []).forEach(m => {
      grouped[m.type] = (grouped[m.type] || 0) + 1;
    });
    Object.entries(grouped).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });
  }

  // 2. Buscar imagens sem media_url
  console.log('\n2️⃣  Imagens sem media_url:');
  const { data: imagesNoUrl, error: noUrlErr } = await supabase
    .from('messages')
    .select('id, type, created_at, media_url')
    .eq('type', 'image')
    .is('media_url', null)
    .limit(5);

  if (noUrlErr) {
    console.error('❌ Erro ao buscar:', noUrlErr.message);
  } else {
    if ((imagesNoUrl || []).length === 0) {
      console.log('   ✅ Todas as imagens têm media_url');
    } else {
      console.log(`   ⚠️  ${imagesNoUrl?.length} imagens sem URL:`);
      imagesNoUrl?.forEach(m => {
        console.log(`      ${m.id.substring(0, 8)} — criada em ${m.created_at}`);
      });
    }
  }

  // 3. Buscar imagens com URL
  console.log('\n3️⃣  Últimas 5 imagens com URL:');
  const { data: imagesWithUrl, error: withUrlErr } = await supabase
    .from('messages')
    .select('id, type, media_url, created_at')
    .eq('type', 'image')
    .not('media_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(5);

  if (withUrlErr) {
    console.error('❌ Erro ao buscar:', withUrlErr.message);
  } else {
    if ((imagesWithUrl || []).length === 0) {
      console.log('   ⚠️  Nenhuma imagem com URL encontrada!');
    } else {
      imagesWithUrl?.forEach(m => {
        const isStorage = m.media_url?.includes('supabase.co/storage');
        const icon = isStorage ? '✅' : '⚠️';
        console.log(`   ${icon} ${m.id.substring(0, 8)}`);
        console.log(`      URL: ${m.media_url?.substring(0, 80)}...`);
      });
    }
  }

  // 4. Verificar se há arquivos no Storage
  console.log('\n4️⃣  Arquivos no Supabase Storage (media bucket):');
  const { data: storageFiles, error: storageErr } = await supabase
    .storage
    .from('media')
    .list('', { limit: 10 });

  if (storageErr) {
    console.error('❌ Erro ao listar storage:', storageErr.message);
  } else {
    if ((storageFiles || []).length === 0) {
      console.log('   ⚠️  Nenhum arquivo no bucket media!');
    } else {
      console.log(`   ✅ ${storageFiles?.length} arquivo(s) encontrados:`);
      storageFiles?.slice(0, 5).forEach(f => {
        console.log(`      ${f.name} — ${(f.metadata?.size / 1024).toFixed(1)}KB`);
      });
    }
  }

  // 5. Verificar URLs expiradas
  console.log('\n5️⃣  Testando acesso às URLs:');
  const urls = imagesWithUrl?.slice(0, 3).map(m => m.media_url).filter(Boolean) || [];
  for (const url of urls) {
    try {
      const res = await fetch(url || '', { method: 'HEAD' });
      const icon = res.ok ? '✅' : '❌';
      console.log(`   ${icon} ${res.status} — ${url?.substring(0, 60)}...`);
    } catch (err) {
      console.log(`   ❌ Erro — ${url?.substring(0, 60)}...`);
    }
  }

  console.log('\n✨ Diagnóstico completo');
}

main().catch(console.error);
