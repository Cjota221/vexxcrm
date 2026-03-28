#!/usr/bin/env node
/**
 * VEXX CRM — Diagnóstico de Integração Evolution API
 *
 * Testa: conexão, instância, webhook, endpoints de mensagem,
 *        reactions, delete, presence, e schema do Supabase.
 *
 * Uso:
 *   node scripts/diagnose-evolution.mjs
 *   node scripts/diagnose-evolution.mjs --tenant <tenantId>
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Ler .env.local ────────────────────────────────────────────────────────────
function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
    for (const line of raw.split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && v.length && !k.startsWith('#')) {
        process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    console.error('❌  .env.local não encontrado. Execute na raiz do projeto.');
    process.exit(1);
  }
}

loadEnv();

const EVOLUTION_URL  = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY  = process.env.EVOLUTION_GLOBAL_KEY;
const SUPABASE_URL   = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_KEY;

// tenant passado via arg ou fixo para teste
const args = process.argv.slice(2);
const tenantIdx = args.indexOf('--tenant');
const TENANT_ID = tenantIdx !== -1 ? args[tenantIdx + 1] : null;

// ── Helpers ───────────────────────────────────────────────────────────────────
const OK   = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';
const INFO = '   ';

let passed = 0, failed = 0, warned = 0;

function ok(label, detail = '')  { passed++; console.log(`${OK}  ${label}${detail ? `  →  ${detail}` : ''}`); }
function fail(label, detail = '') { failed++; console.log(`${FAIL}  ${label}${detail ? `\n${INFO}    ${detail}` : ''}`); }
function warn(label, detail = '') { warned++; console.log(`${WARN}  ${label}${detail ? `\n${INFO}    ${detail}` : ''}`); }
function info(label)              { console.log(`${INFO}  ${label}`); }
function section(title)           { console.log(`\n${'─'.repeat(60)}\n  ${title}\n${'─'.repeat(60)}`); }

async function get(url, key = EVOLUTION_KEY) {
  const r = await fetch(url, { headers: { apikey: key }, signal: AbortSignal.timeout(10_000) });
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
}

async function post(url, body, key = EVOLUTION_KEY) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
}

async function supabaseGet(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
}

async function supabaseRpc(fn, params = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  });
  return { status: r.status, ok: r.ok, body: await r.json().catch(() => null) };
}

// ── Derivar instanceName igual ao código ──────────────────────────────────────
function getInstanceName(tenantId) {
  return `vexx-${tenantId.replace(/-/g, '').slice(0, 12)}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// CHECKS
// ═════════════════════════════════════════════════════════════════════════════

async function checkEnv() {
  section('1. Variáveis de Ambiente');
  EVOLUTION_URL ? ok('EVOLUTION_API_URL', EVOLUTION_URL) : fail('EVOLUTION_API_URL não definida');
  EVOLUTION_KEY ? ok('EVOLUTION_GLOBAL_KEY', '***' + EVOLUTION_KEY.slice(-6)) : fail('EVOLUTION_GLOBAL_KEY não definida');
  SUPABASE_URL  ? ok('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL) : fail('NEXT_PUBLIC_SUPABASE_URL não definida');
  SUPABASE_KEY  ? ok('SUPABASE_SERVICE_KEY', '***' + SUPABASE_KEY.slice(-6)) : fail('SUPABASE_SERVICE_KEY não definida');

  if (!EVOLUTION_URL || !EVOLUTION_KEY || !SUPABASE_URL || !SUPABASE_KEY) {
    console.log('\n❌  Variáveis obrigatórias ausentes. Abortando.\n');
    process.exit(1);
  }
}

async function checkEvolutionConnection() {
  section('2. Conexão com Evolution API');
  try {
    const r = await get(`${EVOLUTION_URL}/instance/fetchInstances`);
    if (r.ok) {
      const instances = Array.isArray(r.body) ? r.body : [];
      ok('Evolution API acessível', `${instances.length} instância(s) encontrada(s)`);
      return instances;
    } else if (r.status === 401) {
      fail('EVOLUTION_GLOBAL_KEY inválida (401 Unauthorized)');
    } else if (r.status === 403) {
      fail(`Acesso negado (403) — IP bloqueado ou key sem permissão`);
    } else {
      fail(`Evolution API retornou ${r.status}`, JSON.stringify(r.body).slice(0, 200));
    }
  } catch (e) {
    fail('Evolution API inacessível', e.message);
    info('Verifique se EVOLUTION_API_URL está correto e o servidor está online.');
  }
  return [];
}

async function checkInstances(instances) {
  section('3. Instâncias WhatsApp');

  if (instances.length === 0) {
    warn('Nenhuma instância encontrada — nenhum tenant conectou ainda');
    return;
  }

  for (const inst of instances.slice(0, 10)) { // limitar a 10
    const name    = inst.name || inst.instanceName || inst.instance?.instanceName || '?';
    const state   = inst.connectionStatus || inst.instance?.state || inst.state || '?';
    const emoji   = state === 'open' ? OK : state === 'connecting' ? WARN : FAIL;
    console.log(`  ${emoji}  ${name.padEnd(30)} estado: ${state}`);

    if (state !== 'open') {
      info(`      → Instância offline. QR Code pode ser necessário para reconectar.`);
    }
  }
  if (instances.length > 10) info(`  ... e mais ${instances.length - 10} instâncias`);
}

async function checkInstanceWebhook(instanceName) {
  section(`4. Webhook — instância: ${instanceName}`);
  try {
    const r = await get(`${EVOLUTION_URL}/webhook/find/${instanceName}`);
    if (!r.ok) {
      fail(`Não foi possível buscar webhook (${r.status})`, JSON.stringify(r.body).slice(0, 200));
      return;
    }

    const wh = r.body?.webhook || r.body;
    const url = wh?.url || wh?.webhookUrl || '(não configurado)';
    const enabled = wh?.enabled !== false;
    const events  = wh?.events || wh?.webhookByEvents || [];

    url.includes('vexxcrm') || url.includes('netlify') || url.includes('localhost')
      ? ok('Webhook URL configurada', url)
      : warn('Webhook URL parece incorreta', url);

    enabled ? ok('Webhook habilitado') : fail('Webhook DESABILITADO', 'Execute /api/whatsapp/connect para reconfigurar');

    // MESSAGES_REACTION não é enum válido na v2.3.7 — reactions chegam via MESSAGES_UPSERT
    const requiredEvents = [
      { name: 'MESSAGES_UPSERT',    desc: 'mensagens + reactions (v2.3.7)' },
      { name: 'MESSAGES_UPDATE',    desc: 'status de entrega/leitura' },
      { name: 'MESSAGES_DELETE',    desc: 'mensagens apagadas' },
      { name: 'PRESENCE_UPDATE',    desc: 'digitando / gravando' },
      { name: 'CONNECTION_UPDATE',  desc: 'status da conexão' },
    ];

    const eventsArr = Array.isArray(events) ? events : Object.keys(events).filter(k => events[k]);

    for (const { name: ev, desc } of requiredEvents) {
      const present = eventsArr.some(e => e.toUpperCase().replace('.', '_') === ev);
      present
        ? ok(`  Evento ${ev}`, desc)
        : fail(`  Evento ${ev} ausente`, desc);
    }

    info(`\n  Todos os eventos configurados: ${eventsArr.join(', ')}`);
  } catch (e) {
    fail('Erro ao verificar webhook', e.message);
  }
}

async function checkMessageEndpoints(instanceName) {
  section('5. Endpoints de Mensagem (Evolution API)');

  // 5a. sendReaction endpoint
  try {
    const r = await post(`${EVOLUTION_URL}/message/sendReaction/${instanceName}`, {
      key: { remoteJid: 'TEST@s.whatsapp.net', id: 'TEST_ID', fromMe: true },
      reaction: '👍',
    });
    if (r.status === 400 || r.status === 422 || r.ok) {
      ok('POST /message/sendReaction — endpoint existe', `HTTP ${r.status}`);
    } else if (r.status === 404) {
      fail('POST /message/sendReaction — 404 (não existe nesta versão)');
    } else {
      warn(`POST /message/sendReaction — HTTP ${r.status}`, JSON.stringify(r.body).slice(0, 100));
    }
  } catch (e) {
    fail('POST /message/sendReaction — timeout/erro', e.message);
  }

  // 5b. deleteMessage — novo endpoint v2
  try {
    const r = await fetch(`${EVOLUTION_URL}/message/delete/${instanceName}`, {
      method: 'DELETE',
      headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'TEST_ID', remoteJid: 'TEST@s.whatsapp.net', fromMe: true }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await r.json().catch(() => null);
    if (r.status === 400 || r.status === 422 || r.ok) {
      ok('DELETE /message/delete — endpoint existe (v2)', `HTTP ${r.status}`);
    } else if (r.status === 404) {
      warn('DELETE /message/delete — 404 (v2 não disponível)');
      // Testar fallback
      const r2 = await fetch(`${EVOLUTION_URL}/chat/deleteMessage/${instanceName}`, {
        method: 'DELETE',
        headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: { remoteJid: 'TEST@s.whatsapp.net', id: 'TEST_ID', fromMe: true } }),
        signal: AbortSignal.timeout(10_000),
      });
      if (r2.status === 400 || r2.status === 422 || r2.ok) {
        ok('DELETE /chat/deleteMessage — fallback existe (v1)', `HTTP ${r2.status}`);
      } else if (r2.status === 404) {
        fail('DELETE /chat/deleteMessage — 404 também (delete não suportado nesta versão)');
        info('      → Apagar mensagens só funciona como soft-delete local');
      } else {
        warn(`DELETE /chat/deleteMessage — HTTP ${r2.status}`);
      }
    } else {
      warn(`DELETE /message/delete — HTTP ${r.status}`, JSON.stringify(body).slice(0, 100));
    }
  } catch (e) {
    fail('DELETE — timeout/erro', e.message);
  }

  // 5c. updateMessage (edit) — PATCH
  try {
    const r = await fetch(`${EVOLUTION_URL}/message/updateMessage/${instanceName}`, {
      method: 'PATCH',
      headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: 'TEST@s.whatsapp.net', key: { id: 'TEST_ID' }, text: 'test' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (r.status === 400 || r.status === 422 || r.ok) {
      ok('PATCH /message/updateMessage — endpoint existe (edição)', `HTTP ${r.status}`);
    } else if (r.status === 404) {
      warn('PATCH /message/updateMessage — 404 (edição não suportada nesta versão)');
    } else {
      info(`PATCH /message/updateMessage — HTTP ${r.status}`);
    }
  } catch (e) {
    fail('PATCH /message/updateMessage — timeout/erro', e.message);
  }

  // 5d. presenceSubscribe
  try {
    const r = await post(`${EVOLUTION_URL}/chat/presenceSubscribe/${instanceName}`, {
      number: 'TEST@s.whatsapp.net',
    });
    if (r.status === 400 || r.status === 422 || r.ok) {
      ok('POST /chat/presenceSubscribe — endpoint existe', `HTTP ${r.status}`);
    } else if (r.status === 404) {
      warn('POST /chat/presenceSubscribe — 404 (typing indicator pode não funcionar)');
    } else {
      info(`POST /chat/presenceSubscribe — HTTP ${r.status}`);
    }
  } catch (e) {
    fail('POST /chat/presenceSubscribe — timeout/erro', e.message);
  }
}

async function checkEvolutionVersion(instanceName) {
  section('6. Versão da Evolution API');
  try {
    // Tentar endpoint de versão
    const endpoints = [
      `${EVOLUTION_URL}/`,
      `${EVOLUTION_URL}/instance/fetchInstances`,
    ];
    for (const url of endpoints) {
      const r = await get(url);
      const version = r.body?.version || r.body?.[0]?.version
        || (Array.isArray(r.body) && r.body[0]?.evolutionVersion);
      if (version) {
        ok('Versão detectada', version);
        const [major, minor] = version.split('.').map(Number);
        if (major >= 2 && minor >= 1) {
          ok('Versão compatível com reactions/edit/delete (≥ 2.1)');
        } else if (major >= 2) {
          warn(`Versão ${version} — reactions OK, edit/delete podem não funcionar`);
        } else {
          fail(`Versão ${version} muito antiga — reactions e presence não suportados`);
        }
        return;
      }
    }
    warn('Versão não detectável nos headers — verifique manualmente no painel da Evolution');
  } catch (e) {
    warn('Não foi possível detectar versão', e.message);
  }
}

async function checkSupabaseSchema() {
  section('7. Schema Supabase — Tabelas Críticas');

  const tables = [
    { name: 'messages',          cols: ['id', 'external_id', 'metadata', 'deleted', 'edited', 'status'] },
    { name: 'message_reactions', cols: ['id', 'message_id', 'emoji', 'from_me', 'reactor_phone', 'tenant_id'] },
    { name: 'contact_presence',  cols: ['phone', 'status', 'tenant_id', 'updated_at'] },
    { name: 'conversations',     cols: ['id', 'remote_jid', 'contact_name', 'client_id'] },
  ];

  for (const { name, cols } of tables) {
    try {
      const r = await supabaseGet(`/${name}?limit=0&select=${cols.join(',')}`);
      if (r.ok) {
        ok(`Tabela ${name}`, `colunas ${cols.join(', ')} OK`);
      } else if (r.status === 400) {
        // Coluna ausente — parsear qual
        const msg = JSON.stringify(r.body);
        const missingCol = msg.match(/column ["']([^"']+)["'] does not exist/) || [];
        fail(`Tabela ${name}`, missingCol[1] ? `Coluna ausente: ${missingCol[1]}` : msg.slice(0, 150));
      } else if (r.status === 401 || r.status === 403) {
        warn(`Tabela ${name} — sem permissão (${r.status}). RLS pode estar bloqueando service key.`);
      } else {
        warn(`Tabela ${name} — HTTP ${r.status}`, JSON.stringify(r.body).slice(0, 100));
      }
    } catch (e) {
      fail(`Tabela ${name} — erro`, e.message);
    }
  }

  // Verificar UNIQUE constraint em message_reactions
  section('7b. Constraint UNIQUE em message_reactions');
  try {
    // Tentar inserir e depois inserir duplicado — se der 409 conflict com reactor_phone, constraint existe
    const testR = await supabaseGet('/message_reactions?tenant_id=eq.00000000-0000-0000-0000-000000000000&limit=1');
    if (testR.ok) {
      ok('message_reactions acessível via service key');
      // Verificar se tem reactor_phone
      const r2 = await supabaseGet('/message_reactions?limit=0&select=reactor_phone');
      r2.ok
        ? ok('Coluna reactor_phone existe (migration 044 ✓)')
        : fail('Coluna reactor_phone AUSENTE — execute migration 044!',
            'sem ela reactions de múltiplos usuários sobrescrevem umas às outras');
    }
  } catch (e) {
    fail('Erro ao verificar message_reactions', e.message);
  }
}

async function checkSupabaseRealtime() {
  section('8. Supabase Realtime — Publication');

  // Verificar via RPC se as tabelas estão na publicação
  // (só funciona com service key em algumas configs)
  try {
    const r = await supabaseRpc('exec_sql', {
      query: `SELECT tablename FROM pg_publication_tables
              WHERE pubname = 'supabase_realtime'
              AND tablename IN ('messages','conversations','contact_presence','message_reactions')
              ORDER BY tablename`
    });

    if (r.ok && Array.isArray(r.body)) {
      const inPub = r.body.map(row => row.tablename);
      for (const t of ['messages', 'conversations', 'contact_presence']) {
        inPub.includes(t)
          ? ok(`${t} na publicação supabase_realtime`)
          : fail(`${t} NÃO está na publicação!`,
              t === 'contact_presence'
                ? 'Execute migration 045 — typing/recording não funciona sem isso'
                : `Execute migration 023 — ${t === 'messages' ? 'delivery confirmation' : 'chat list'} não atualiza`);
      }
    } else {
      // exec_sql pode não existir — tentar via pg_catalog diretamente
      const r2 = await supabaseGet(
        `/pg_publication_tables?pubname=eq.supabase_realtime&select=tablename`
      );
      if (r2.ok && Array.isArray(r2.body)) {
        const inPub = r2.body.map(row => row.tablename);
        for (const t of ['messages', 'conversations', 'contact_presence']) {
          inPub.includes(t)
            ? ok(`${t} na publicação supabase_realtime`)
            : fail(`${t} NÃO está na publicação`);
        }
      } else {
        warn('Não foi possível verificar Realtime publication automaticamente',
          'Verifique manualmente no Supabase: Table Editor → Realtime → Enabled tables');
        info('    Tabelas necessárias: messages, conversations, contact_presence');
      }
    }
  } catch (e) {
    warn('Não foi possível verificar Realtime publication', e.message);
    info('    Execute manualmente: SELECT tablename FROM pg_publication_tables WHERE pubname = \'supabase_realtime\'');
  }
}

async function checkSupabaseRpcs() {
  section('9. Supabase RPCs');

  const rpcs = [
    { name: 'sync_message_reactions', params: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_external_id: 'TEST' }, desc: 'reactions atômicas (migration 046)' },
    { name: 'increment_group_participants', params: { p_tenant_id: '00000000-0000-0000-0000-000000000000', p_group_jid: 'TEST', p_delta: 0 }, desc: 'grupos (migration 044)' },
    { name: 'auth_tenant_id', params: {}, desc: 'RLS otimizado (migration 025)' },
  ];

  for (const { name, params, desc } of rpcs) {
    try {
      const r = await supabaseRpc(name, params);
      // 200 ou erro de validação (404 do RPC inexistente é diferente de 422 param inválido)
      if (r.status === 200 || r.status === 204 || r.status === 422) {
        ok(`RPC ${name}`, desc);
      } else if (r.status === 404) {
        fail(`RPC ${name} NÃO EXISTE`, `Execute a migration correspondente: ${desc}`);
      } else {
        warn(`RPC ${name} — HTTP ${r.status}`, JSON.stringify(r.body).slice(0, 100));
      }
    } catch (e) {
      fail(`RPC ${name} — erro`, e.message);
    }
  }
}

async function checkTenantInstance() {
  if (!TENANT_ID) {
    section('10. Teste por Tenant');
    warn('Tenant ID não fornecido — pule com --tenant <uuid> para testar instância específica');
    info('    Exemplo: node scripts/diagnose-evolution.mjs --tenant 8aa3a7e7-cbb5-4ad5-8e2a-740d914aefdd');
    return;
  }

  section(`10. Instância do Tenant: ${TENANT_ID}`);
  const instanceName = getInstanceName(TENANT_ID);
  info(`    instanceName calculado: ${instanceName}`);

  try {
    const r = await get(`${EVOLUTION_URL}/instance/connectionState/${instanceName}`);
    if (r.ok) {
      const state = r.body?.instance?.state || r.body?.state || JSON.stringify(r.body).slice(0, 50);
      state === 'open'
        ? ok(`Instância ${instanceName} conectada`, `estado: ${state}`)
        : fail(`Instância ${instanceName} desconectada`, `estado: ${state} — QR Code necessário`);
    } else if (r.status === 404) {
      fail(`Instância ${instanceName} não existe`, 'Acesse /central e reconecte o WhatsApp');
    } else {
      warn(`Instância ${instanceName} — HTTP ${r.status}`);
    }

    // Verificar webhook desta instância
    await checkInstanceWebhook(instanceName);

    // Testar endpoints com a instância real
    await checkMessageEndpoints(instanceName);

  } catch (e) {
    fail(`Erro ao verificar instância ${instanceName}`, e.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('  VEXX CRM — Diagnóstico Evolution API + Supabase');
console.log('  ' + new Date().toLocaleString('pt-BR'));
console.log('═'.repeat(60));

await checkEnv();
const instances = await checkEvolutionConnection();

if (instances.length > 0) {
  await checkInstances(instances);
  // Pegar primeira instância vexx- para testar endpoints
  const vexxInst = instances.find(i => {
    const n = i.name || i.instanceName || i.instance?.instanceName || '';
    return n.startsWith('vexx-');
  });
  const testInstance = vexxInst
    ? (vexxInst.name || vexxInst.instanceName || vexxInst.instance?.instanceName)
    : (instances[0].name || instances[0].instanceName || instances[0].instance?.instanceName);

  if (testInstance) {
    await checkEvolutionVersion(testInstance);
    if (!TENANT_ID) {
      // Só faz se tenant não foi passado (vai testar no check 10)
      await checkInstanceWebhook(testInstance);
      await checkMessageEndpoints(testInstance);
    }
  }
}

await checkSupabaseSchema();
await checkSupabaseRealtime();
await checkSupabaseRpcs();
await checkTenantInstance();

// ── Relatório Final ───────────────────────────────────────────────────────────
console.log('\n' + '═'.repeat(60));
console.log('  RELATÓRIO FINAL');
console.log('═'.repeat(60));
console.log(`  ${OK}  Passou:     ${passed}`);
console.log(`  ${WARN}  Avisos:     ${warned}`);
console.log(`  ${FAIL}  Falhou:     ${failed}`);
console.log('═'.repeat(60));

if (failed > 0) {
  console.log('\n  ⚡ Próximos passos sugeridos:');
  console.log('  1. Corrija os itens ❌ primeiro — são bloqueadores');
  console.log('  2. Execute as migrations ausentes no Supabase SQL Editor');
  console.log('  3. Rode novamente para confirmar: node scripts/diagnose-evolution.mjs');
}
console.log();
