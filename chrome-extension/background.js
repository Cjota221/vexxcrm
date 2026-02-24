/**
 * VEXX CRM — Background Service Worker (Manifest V3)
 * 
 * Responsabilidades:
 * 1. Gerenciar autenticação e renovação de token
 * 2. Relay de mensagens entre popup e content script
 * 3. Cache de dados do CRM (respostas rápidas)
 * 4. Alarmes para refresh periódico
 */

// ━━━ INSTALAÇÃO / ATUALIZAÇÃO ━━━

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[VEXX BG] Extensão instalada — abrindo popup de configuração');
    chrome.tabs.create({ url: 'popup/popup.html' });
  }
});

// ━━━ RELAY DE MENSAGENS ━━━
// O popup não tem acesso direto ao content script — usa o background como ponte.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {

    // Popup pede para abrir/fechar a sidebar no WhatsApp Web
    case 'VEXX_TOGGLE_SIDEBAR': {
      getWhatsAppTab((tab) => {
        if (!tab) {
          sendResponse({ error: 'WhatsApp Web não está aberto' });
          return;
        }
        chrome.tabs.sendMessage(tab.id, { type: 'VEXX_TOGGLE_FROM_POPUP' });
        sendResponse({ ok: true });
      });
      return true; // async
    }

    // Popup/content script salva credenciais
    case 'VEXX_SAVE_AUTH': {
      chrome.storage.local.set({
        vexx_token:     message.token,
        vexx_tenant_id: message.tenantId,
        vexx_crm_url:   message.crmUrl,
        vexx_auth_at:   Date.now(),
      }, () => sendResponse({ ok: true }));
      return true;
    }

    // Popup pede status da autenticação
    case 'VEXX_GET_AUTH': {
      chrome.storage.local.get(['vexx_token', 'vexx_tenant_id', 'vexx_crm_url', 'vexx_auth_at'], (data) => {
        sendResponse({
          isAuthenticated: !!data.vexx_token,
          tenantId: data.vexx_tenant_id,
          crmUrl: data.vexx_crm_url,
          authAt: data.vexx_auth_at,
        });
      });
      return true;
    }

    // Logout
    case 'VEXX_LOGOUT': {
      chrome.storage.local.remove(['vexx_token', 'vexx_tenant_id', 'vexx_crm_url', 'vexx_auth_at'], () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    // Extensão quer saber se o WhatsApp Web está aberto
    case 'VEXX_CHECK_WHATSAPP': {
      getWhatsAppTab((tab) => {
        sendResponse({ open: !!tab, tabId: tab?.id });
      });
      return true;
    }
  }
});

// ━━━ UTILITÁRIOS ━━━

function getWhatsAppTab(callback) {
  chrome.tabs.query({ url: 'https://web.whatsapp.com/*' }, (tabs) => {
    callback(tabs?.[0] || null);
  });
}
