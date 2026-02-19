/**
 * fix-expired-media-urls.js
 *
 * Corrige mensagens no banco que ainda têm URLs mmg.whatsapp.net (expiradas).
 * Para cada mensagem com URL expirada:
 *   1. Chama a Evolution API (getBase64FromMediaMessage) para obter o base64
 *   2. Faz upload para o Supabase Storage (bucket 'media')
 *   3. Atualiza o campo media_url no banco com a URL permanente
 *
 * Uso:
 *   node scripts/fix-expired-media-urls.js
 *   node scripts/fix-expired-media-urls.js --dry-run     (só lista, não corrige)
 *   node scripts/fix-expired-media-urls.js --limit=50    (processa até 50 mensagens)
 *   node scripts/fix-expired-media-urls.js --type=image  (só imagens)
 */

const { createClient } = require('@supabase/supabase-js');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://qjjflshqdaapwneeirdq.supabase.co';
const SERVICE_KEY  = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFqamZsc2hxZGFhcHduZWVpcmRxIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDkxMjcxOCwiZXhwIjoyMDg2NDg4NzE4fQ.WvFSi-1FC9BXphfJrQoHBJ4ZNXDLTVG9I44kKe0uxBc';

// Evolution API — configuração do tenant principal
// Ajuste se necessário
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://evo.facilzap.com.br';
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || '';

// ─── ARGS ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = parseInt(args.find(a => a.startsWith('--limit='))?.split('=')[1] || '100');
const TYPE    = args.find(a => a.startsWith('--type='))?.split('=')[1] || null;
const BATCH   = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '5');

// ─── MIME → EXT ───────────────────────────────────────────────────────────────
const MIME_TO_EXT = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp',
  'video/mp4': 'mp4', 'video/webm': 'webm', 'video/3gpp': '3gp',
  'audio/ogg': 'ogg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a',
  'audio/ogg; codecs=opus': 'ogg', 'application/pdf': 'pdf',
  'image/sticker': 'webp',
};

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

// ─── HELPERS ──────────────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Busca config da Evolution API para um tenant específico.
 * Se não houver config específica, tenta as env vars globais.
 */
async function getEvolutionConfig(tenantId) {
  const { data } = await supabase
    .from('tenants')
    .select('evolution_url, evolution_key, evolution_instance')
    .eq('id', tenantId)
    .single();

  return {
    apiUrl:       data?.evolution_url      || EVOLUTION_API_URL,
    apiKey:       data?.evolution_key      || EVOLUTION_API_KEY,
    instanceName: data?.evolution_instance || EVOLUTION_INSTANCE,
  };
}

/**
 * Baixa a mídia via Evolution API e salva no Supabase Storage.
 * Retorna a URL pública permanente ou null se falhar.
 */
async function reprocessMedia(msg, config) {
  const { id: messageId, external_id, media_url, media_mime_type, type, tenant_id } = msg;

  // Monta objeto message mínimo para o endpoint da Evolution
  const mediaKey = `${type || 'image'}Message`;
  const fakeMessage = {
    [mediaKey]: {
      url: media_url,
      mimetype: media_mime_type,
    },
  };

  // Chama getBase64FromMediaMessage
  const url = `${config.apiUrl}/chat/getBase64FromMediaMessage/${config.instanceName}`;
  const body = {
    message: {
      key: {
        id: external_id,
        remoteJid: `unknown@s.whatsapp.net`, // expirada — Evolution tenta pelo ID
        fromMe: false,
      },
      message: fakeMessage,
    },
    convertToMp4: false,
  };

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': config.apiKey },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, reason: `fetch error: ${err.message}` };
  }

  if (!resp.ok) {
    return { ok: false, reason: `Evolution HTTP ${resp.status}` };
  }

  let data;
  try {
    data = await resp.json();
  } catch {
    return { ok: false, reason: 'Evolution resposta inválida (não JSON)' };
  }

  const base64Raw = data.base64 || null;
  if (!base64Raw) {
    return { ok: false, reason: 'Evolution retornou sem base64 (mídia apagada do WA)' };
  }

  // Decodificar
  const cleanB64 = base64Raw.replace(/^data:[^;]+;base64,/, '');
  let buffer;
  try {
    buffer = Buffer.from(cleanB64, 'base64');
  } catch {
    return { ok: false, reason: 'base64 inválido' };
  }

  if (buffer.length > 25 * 1024 * 1024) {
    return { ok: false, reason: `arquivo muito grande (${(buffer.length/1024/1024).toFixed(1)}MB)` };
  }

  const mime    = media_mime_type || data.mimetype || 'application/octet-stream';
  const ext     = MIME_TO_EXT[mime] || 'bin';
  const fileName = `${tenant_id}/${Date.now()}-${messageId.slice(-8)}.${ext}`;

  // Upload para Storage
  const { data: uploadData, error: uploadErr } = await supabase.storage
    .from('media')
    .upload(fileName, buffer, {
      contentType: mime,
      cacheControl: '31536000',
      upsert: false,
    });

  if (uploadErr) {
    return { ok: false, reason: `Storage upload: ${uploadErr.message}` };
  }

  const { data: publicUrlData } = supabase.storage
    .from('media')
    .getPublicUrl(uploadData.path);

  return { ok: true, permanentUrl: publicUrlData.publicUrl };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   fix-expired-media-urls.js — VEXX CRM              ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Modo:    ${DRY_RUN ? '🔍 DRY-RUN (sem alterações)' : '🔧 CORREÇÃO REAL'}`);
  console.log(`  Limite:  ${LIMIT} mensagens`);
  console.log(`  Tipo:    ${TYPE || 'todos (image, video, audio, document)'}`);
  console.log(`  Batch:   ${BATCH} simultâneos`);
  console.log('');

  // 1. Buscar mensagens com URLs expiradas
  let query = supabase
    .from('messages')
    .select(`
      id, external_id, tenant_id, media_url, media_mime_type, type,
      conversations!inner(contact_phone)
    `)
    .ilike('media_url', '%mmg.whatsapp.net%')
    .not('external_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT);

  if (TYPE) {
    query = query.eq('type', TYPE);
  }

  const { data: messages, error, count } = await query;

  if (error) {
    console.error('❌ Erro ao buscar mensagens:', error.message);
    process.exit(1);
  }

  if (!messages || messages.length === 0) {
    console.log('✅ Nenhuma mensagem com URL expirada encontrada! Tudo ok.');
    return;
  }

  // Contar total (query separada)
  const { count: total } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .ilike('media_url', '%mmg.whatsapp.net%');

  console.log(`📊 Total no banco com URL expirada: ${total}`);
  console.log(`📋 Processando: ${messages.length} mensagens\n`);

  if (DRY_RUN) {
    console.log('📝 Amostra das mensagens a corrigir:');
    messages.slice(0, 10).forEach((m, i) => {
      console.log(`  ${i+1}. [${m.type}] ID: ${m.id.slice(-8)} | URL: ${m.media_url?.substring(0, 70)}...`);
    });
    console.log('\n💡 Execute sem --dry-run para aplicar as correções.');
    return;
  }

  // 2. Processar em batches
  let fixed = 0, failed = 0, skipped = 0;
  const errors = [];

  // Agrupar por tenant para buscar config uma vez por tenant
  const byTenant = {};
  for (const msg of messages) {
    if (!byTenant[msg.tenant_id]) byTenant[msg.tenant_id] = [];
    byTenant[msg.tenant_id].push(msg);
  }

  for (const [tenantId, tenantMsgs] of Object.entries(byTenant)) {
    const config = await getEvolutionConfig(tenantId);

    if (!config.apiKey || !config.instanceName) {
      console.warn(`  ⚠️  Tenant ${tenantId.slice(-8)}: sem config Evolution (apiKey ou instance), pulando ${tenantMsgs.length} msgs`);
      skipped += tenantMsgs.length;
      continue;
    }

    console.log(`\n🏢 Tenant ${tenantId.slice(-8)} — ${tenantMsgs.length} mensagens`);
    console.log(`   Instance: ${config.instanceName} | URL: ${config.apiUrl}`);

    // Processar em batches de N
    for (let i = 0; i < tenantMsgs.length; i += BATCH) {
      const batch = tenantMsgs.slice(i, i + BATCH);

      await Promise.all(batch.map(async (msg) => {
        process.stdout.write(`  [${msg.type}] ${msg.id.slice(-8)}... `);
        const result = await reprocessMedia(msg, config);

        if (result.ok) {
          // Atualizar no banco
          const { error: updateErr } = await supabase
            .from('messages')
            .update({ media_url: result.permanentUrl })
            .eq('id', msg.id);

          if (updateErr) {
            console.log(`❌ DB update falhou: ${updateErr.message}`);
            errors.push({ id: msg.id, reason: `DB: ${updateErr.message}` });
            failed++;
          } else {
            console.log(`✅ ${result.permanentUrl.substring(0, 60)}...`);
            fixed++;
          }
        } else {
          console.log(`⚠️  ${result.reason}`);
          errors.push({ id: msg.id, reason: result.reason });
          failed++;
        }
      }));

      // Pausa entre batches para não sobrecarregar Evolution API
      if (i + BATCH < tenantMsgs.length) {
        await sleep(500);
      }
    }
  }

  // 3. Resumo
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   RESUMO                                             ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  ✅ Corrigidas:  ${fixed}`);
  console.log(`  ❌ Falhas:      ${failed}`);
  console.log(`  ⏭️  Puladas:     ${skipped}`);

  if (errors.length > 0) {
    console.log('\n  Detalhes dos erros:');
    errors.forEach(e => console.log(`    - ${e.id}: ${e.reason}`));
  }

  if (failed > 0) {
    console.log('\n  💡 Dica: mídias marcadas como "Evolution HTTP 404" foram apagadas');
    console.log('     do WhatsApp e não podem ser recuperadas. Isso é normal para');
    console.log('     mídias com mais de 60 dias.');
  }
}

main().catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
