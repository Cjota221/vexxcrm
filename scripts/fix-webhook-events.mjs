#!/usr/bin/env node
/**
 * Reconfigura o webhook da instância Evolution API
 * adicionando MESSAGES_REACTION e todos os eventos necessários.
 *
 * Uso: node scripts/fix-webhook-events.mjs
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8');
  for (const line of raw.split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length && !k.startsWith('#')) {
      process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

loadEnv();

const EVOLUTION_URL = process.env.EVOLUTION_API_URL;
const EVOLUTION_KEY = process.env.EVOLUTION_GLOBAL_KEY;
const APP_URL       = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://vexxcrm.netlify.app';

// Eventos válidos para Evolution API v2.3.7
// MESSAGES_REACTION NÃO é um enum válido nesta versão —
// reactions chegam como MESSAGES_UPSERT com messageType=reactionMessage
const REQUIRED_EVENTS = [
  'APPLICATION_STARTUP',
  'CALL',
  'CHATS_DELETE',
  'CHATS_SET',
  'CHATS_UPDATE',
  'CHATS_UPSERT',
  'CONNECTION_UPDATE',
  'CONTACTS_SET',
  'CONTACTS_UPDATE',
  'CONTACTS_UPSERT',
  'GROUP_PARTICIPANTS_UPDATE',
  'GROUP_UPDATE',
  'GROUPS_UPSERT',
  'LABELS_ASSOCIATION',
  'LABELS_EDIT',
  'LOGOUT_INSTANCE',
  'MESSAGES_DELETE',
  'MESSAGES_SET',
  'MESSAGES_UPDATE',
  'MESSAGES_UPSERT',
  'PRESENCE_UPDATE',
  'QRCODE_UPDATED',
  'REMOVE_INSTANCE',
  'SEND_MESSAGE',
  'TYPEBOT_CHANGE_STATUS',
  'TYPEBOT_START',
];

// 1. Listar instâncias
const listR = await fetch(`${EVOLUTION_URL}/instance/fetchInstances`, {
  headers: { apikey: EVOLUTION_KEY },
});
const instances = await listR.json();

if (!Array.isArray(instances) || instances.length === 0) {
  console.log('❌  Nenhuma instância encontrada.');
  process.exit(1);
}

console.log(`\nEncontradas ${instances.length} instância(s):\n`);

for (const inst of instances) {
  const name = inst.name || inst.instanceName || inst.instance?.instanceName;
  if (!name) continue;

  // Extrair tenantId do nome (vexx-{12chars do tenantId sem hífens})
  // Não conseguimos reconstruir o UUID exato, então usamos a URL atual do webhook
  const currentWh = await fetch(`${EVOLUTION_URL}/webhook/find/${name}`, {
    headers: { apikey: EVOLUTION_KEY },
  }).then(r => r.json()).catch(() => null);

  const currentUrl = currentWh?.webhook?.url || currentWh?.url || '';
  const tenantMatch = currentUrl.match(/tenant_id=([^&]+)/);
  const tenantId = tenantMatch?.[1];

  if (!tenantId) {
    console.log(`⚠️   ${name} — tenant_id não encontrado na URL do webhook. Pulando.`);
    continue;
  }

  const webhookUrl = `${APP_URL}/api/webhooks/evolution?tenant_id=${tenantId}`;

  console.log(`🔧  Reconfigurando: ${name}`);
  console.log(`    URL: ${webhookUrl}`);
  console.log(`    Eventos: ${REQUIRED_EVENTS.length} eventos (incluindo MESSAGES_REACTION)`);

  const r = await fetch(`${EVOLUTION_URL}/webhook/set/${name}`, {
    method: 'POST',
    headers: { apikey: EVOLUTION_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      webhook: {
        url: webhookUrl,
        enabled: true,
        webhook_by_events: false,
        webhook_base64: true,
        events: REQUIRED_EVENTS,
      },
    }),
  });

  const body = await r.json().catch(() => null);

  if (r.ok) {
    console.log(`✅  ${name} — webhook reconfigurado com sucesso\n`);
  } else {
    console.log(`❌  ${name} — erro ${r.status}: ${JSON.stringify(body).slice(0, 200)}\n`);
  }
}

console.log('Pronto. Rode o diagnóstico para confirmar:');
console.log('  node scripts/diagnose-evolution.mjs\n');
