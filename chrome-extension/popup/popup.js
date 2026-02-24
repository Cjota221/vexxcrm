// VEXX CRM — Popup Script

const authDot  = document.getElementById('auth-dot');
const authText = document.getElementById('auth-text');
const waDot    = document.getElementById('wa-dot');
const waText   = document.getElementById('wa-text');
const logoutWrap = document.getElementById('btn-logout-wrap');

// ━━━ INICIALIZAR ━━━

async function init() {
  // 1. Verificar autenticação
  const auth = await chrome.runtime.sendMessage({ type: 'VEXX_GET_AUTH' });
  if (auth.isAuthenticated) {
    authDot.className  = 'dot green';
    authText.textContent = `✓ Conectado ao CRM`;
    logoutWrap.style.display = 'block';
  } else {
    authDot.className  = 'dot yellow';
    authText.textContent = 'Não autenticado — faça login na sidebar';
  }

  // 2. Verificar WhatsApp Web
  const wa = await chrome.runtime.sendMessage({ type: 'VEXX_CHECK_WHATSAPP' });
  if (wa.open) {
    waDot.className  = 'dot green';
    waText.textContent = '✓ WhatsApp Web aberto';
  } else {
    waDot.className  = 'dot';
    waText.textContent = 'WhatsApp Web não detectado';
  }
}

// ━━━ BOTÕES ━━━

document.getElementById('btn-open-sidebar').addEventListener('click', async () => {
  const res = await chrome.runtime.sendMessage({ type: 'VEXX_TOGGLE_SIDEBAR' });
  if (res?.error) {
    waText.textContent = '⚠️ ' + res.error;
    waDot.className = 'dot yellow';
  } else {
    window.close();
  }
});

document.getElementById('btn-open-crm').addEventListener('click', async () => {
  const auth = await chrome.runtime.sendMessage({ type: 'VEXX_GET_AUTH' });
  const url  = auth.crmUrl || 'https://vexxcrm.netlify.app';
  chrome.tabs.create({ url });
});

document.getElementById('btn-logout').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'VEXX_LOGOUT' });
  authDot.className  = 'dot yellow';
  authText.textContent = 'Sessão encerrada';
  logoutWrap.style.display = 'none';
});

init();
