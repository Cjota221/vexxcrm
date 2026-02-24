/**
 * VEXX CRM — Content Script
 * 
 * Injeta a sidebar do VEXX CRM dentro do WhatsApp Web.
 * 
 * Fluxo:
 * 1. Aguarda o DOM do WhatsApp carregar completamente
 * 2. Cria um iframe isolado com a sidebar React
 * 3. Observa mudanças de contato via MutationObserver
 * 4. Detecta o campo de mensagem e injeta texto quando solicitado
 * 5. Se comunica com o background via chrome.runtime.sendMessage
 */

(function () {
  'use strict';

  // ━━━ CONSTANTES ━━━
  const VEXX_SIDEBAR_ID = 'vexx-crm-sidebar';
  const VEXX_TOGGLE_ID  = 'vexx-crm-toggle';
  const SIDEBAR_WIDTH   = '340px';

  // Seletores do WhatsApp Web (atualizados para versão 2024+)
  // O WA troca class names com hashes — usar atributos semânticos é mais estável
  const WA_SELECTORS = {
    // Painel principal direito (onde fica o chat)
    mainPanel: '#main',
    // Campo de digitação (contenteditable)
    messageBox: 'div[contenteditable="true"][data-tab="10"]',
    // Fallback para o messageBox (WhatsApp muda o data-tab às vezes)
    messageBoxFallback: 'footer div[contenteditable="true"]',
    // Cabeçalho do chat com nome do contato
    chatHeader: 'header[data-testid="conversation-header"]',
    // Nome do contato no header
    contactName: 'header[data-testid="conversation-header"] span[dir="auto"]',
    // Foto do contato
    contactAvatar: 'header[data-testid="conversation-header"] img[draggable="false"]',
  };

  // ━━━ ESTADO ━━━
  let sidebarVisible = false;
  let currentContact = { name: '', phone: '', avatar: '' };
  let headerObserver = null;
  let mainObserver = null;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 1. INICIALIZAÇÃO — aguarda o WhatsApp terminar de carregar
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function waitForWhatsApp() {
    const check = setInterval(() => {
      const mainPanel = document.querySelector(WA_SELECTORS.mainPanel);
      if (mainPanel) {
        clearInterval(check);
        console.log('[VEXX] WhatsApp Web detectado — iniciando extensão');
        init();
      }
    }, 1000);
  }

  function init() {
    injectToggleButton();
    injectSidebar();
    observeContactChanges();
    listenToMessages();
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 2. BOTÃO FLUTUANTE — abre/fecha a sidebar
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function injectToggleButton() {
    if (document.getElementById(VEXX_TOGGLE_ID)) return;

    const btn = document.createElement('button');
    btn.id = VEXX_TOGGLE_ID;
    btn.title = 'VEXX CRM';
    btn.innerHTML = `
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="9" y1="10" x2="15" y2="10"/>
        <line x1="9" y1="14" x2="13" y2="14"/>
      </svg>
    `;

    // Estilos inline para não depender de CSS externo no host
    Object.assign(btn.style, {
      position: 'fixed',
      bottom: '80px',
      right: sidebarVisible ? `calc(${SIDEBAR_WIDTH} + 16px)` : '16px',
      zIndex: '9999',
      width: '48px',
      height: '48px',
      borderRadius: '50%',
      backgroundColor: '#1e3a5f',
      color: '#ffffff',
      border: 'none',
      cursor: 'pointer',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      transition: 'all 0.3s ease',
    });

    btn.addEventListener('click', toggleSidebar);
    document.body.appendChild(btn);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 3. SIDEBAR — iframe isolado com React app
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function injectSidebar() {
    if (document.getElementById(VEXX_SIDEBAR_ID)) return;

    const sidebar = document.createElement('div');
    sidebar.id = VEXX_SIDEBAR_ID;

    Object.assign(sidebar.style, {
      position: 'fixed',
      top: '0',
      right: '0',
      width: SIDEBAR_WIDTH,
      height: '100vh',
      zIndex: '9998',
      transform: 'translateX(100%)',
      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
      boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      backgroundColor: '#ffffff',
      borderLeft: '1px solid #e5e7eb',
    });

    // iframe isolado — scripts da extensão não poluem o DOM do WhatsApp
    const iframe = document.createElement('iframe');
    iframe.src = chrome.runtime.getURL('sidebar/index.html');
    iframe.style.cssText = 'width:100%;height:100%;border:none;';
    iframe.allow = 'clipboard-write';

    sidebar.appendChild(iframe);
    document.body.appendChild(sidebar);

    // Aguardar iframe carregar para enviar estado inicial
    iframe.addEventListener('load', () => {
      // Enviar token e dados do tenant ao iframe
      chrome.storage.local.get(['vexx_token', 'vexx_tenant_id', 'vexx_crm_url'], (data) => {
        iframe.contentWindow.postMessage({
          type: 'VEXX_INIT',
          token: data.vexx_token,
          tenantId: data.vexx_tenant_id,
          crmUrl: data.vexx_crm_url || 'https://vexxcrm.netlify.app',
        }, '*');
      });
    });
  }

  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
    const sidebar = document.getElementById(VEXX_SIDEBAR_ID);
    const btn = document.getElementById(VEXX_TOGGLE_ID);

    if (sidebar) {
      sidebar.style.transform = sidebarVisible ? 'translateX(0)' : 'translateX(100%)';
    }
    if (btn) {
      btn.style.right = sidebarVisible ? `calc(${SIDEBAR_WIDTH} + 16px)` : '16px';
      btn.style.backgroundColor = sidebarVisible ? '#059669' : '#1e3a5f';
    }

    // Notificar iframe do estado
    sendToSidebar({ type: 'VEXX_TOGGLE', visible: sidebarVisible });
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 4. OBSERVAR MUDANÇA DE CONTATO — MutationObserver no header
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  function observeContactChanges() {
    // O WhatsApp atualiza o header quando você troca de conversa.
    // Observamos o #main para detectar quando um novo header é inserido.
    const mainPanel = document.querySelector(WA_SELECTORS.mainPanel);
    if (!mainPanel) return;

    mainObserver = new MutationObserver(() => {
      const header = document.querySelector(WA_SELECTORS.chatHeader);
      if (header && headerObserver === null) {
        attachHeaderObserver(header);
        extractContactFromHeader();
      }
    });

    mainObserver.observe(mainPanel, { childList: true, subtree: true });

    // Checar se já há um chat aberto
    const existingHeader = document.querySelector(WA_SELECTORS.chatHeader);
    if (existingHeader) {
      attachHeaderObserver(existingHeader);
      extractContactFromHeader();
    }
  }

  function attachHeaderObserver(header) {
    if (headerObserver) {
      headerObserver.disconnect();
    }
    headerObserver = new MutationObserver(() => {
      extractContactFromHeader();
    });
    headerObserver.observe(header, { childList: true, subtree: true, characterData: true });
  }

  function extractContactFromHeader() {
    const nameEl  = document.querySelector(WA_SELECTORS.contactName);
    const avatarEl = document.querySelector(WA_SELECTORS.contactAvatar);

    const name   = nameEl?.textContent?.trim() || '';
    const avatar = avatarEl?.src || '';

    // Extrair número de telefone da URL ou do atributo data
    // O WhatsApp coloca o JID na URL do chat: /send?phone=55...
    let phone = '';
    const urlMatch = window.location.href.match(/send\?phone=(\d+)/);
    if (urlMatch) phone = urlMatch[1];

    // Alternativa: pegar do atributo title do avatar
    if (!phone && avatarEl?.title) {
      phone = avatarEl.title.replace(/\D/g, '');
    }

    // Só notificar se o contato mudou
    if (name !== currentContact.name || phone !== currentContact.phone) {
      currentContact = { name, phone, avatar };
      console.log('[VEXX] Contato ativo:', currentContact);
      sendToSidebar({ type: 'VEXX_CONTACT_CHANGED', contact: currentContact });
    }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 5. INSERÇÃO DE TEXTO no campo de mensagem do WhatsApp
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * Insere texto no contenteditable do WhatsApp de forma que o React
   * interno do WA detecte a mudança e habilite o botão "enviar".
   * 
   * Estratégia: execCommand + evento input sintético.
   * Não usamos .innerText= direto pois o React do WA ignora.
   */
  function insertTextIntoMessageBox(text) {
    const box = getMessageBox();
    if (!box) {
      console.warn('[VEXX] Campo de mensagem não encontrado');
      return false;
    }

    // Focar o campo
    box.focus();

    // Limpar conteúdo atual (opcional — descomente se quiser substituir)
    // document.execCommand('selectAll', false, null);

    // Posicionar cursor no final
    const range = document.createRange();
    const sel   = window.getSelection();
    range.selectNodeContents(box);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    // Inserir texto via execCommand (mais compatível com React interno do WA)
    const inserted = document.execCommand('insertText', false, text);

    if (!inserted) {
      // Fallback: evento sintético de input
      box.textContent = text;
      box.dispatchEvent(new Event('input', { bubbles: true }));
      // Mover cursor para o fim
      const r = document.createRange();
      r.selectNodeContents(box);
      r.collapse(false);
      const s = window.getSelection();
      s.removeAllRanges();
      s.addRange(r);
    }

    // Disparar keydown/keyup para garantir que o WA reconheça o conteúdo
    box.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, keyCode: 229 }));
    box.dispatchEvent(new KeyboardEvent('keyup',  { bubbles: true }));

    return true;
  }

  function getMessageBox() {
    return (
      document.querySelector(WA_SELECTORS.messageBox) ||
      document.querySelector(WA_SELECTORS.messageBoxFallback)
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 6. COMUNICAÇÃO — iframe ↔ content script ↔ background
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /** Envia mensagem para o iframe da sidebar */
  function sendToSidebar(message) {
    const sidebar = document.getElementById(VEXX_SIDEBAR_ID);
    if (!sidebar) return;
    const iframe = sidebar.querySelector('iframe');
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage(message, '*');
    }
  }

  /** Escuta mensagens vindas do iframe (e do background) */
  function listenToMessages() {
    window.addEventListener('message', (event) => {
      // Segurança: só aceitar mensagens da extensão
      if (event.source !== document.getElementById(VEXX_SIDEBAR_ID)?.querySelector('iframe')?.contentWindow) {
        // Também aceitar do background via postMessage com origem da extensão
        if (!event.data?.type?.startsWith('VEXX_')) return;
      }

      const { type, payload } = event.data || {};

      switch (type) {
        // Sidebar pede para inserir uma resposta rápida no WA
        case 'VEXX_INSERT_QUICK_REPLY':
          insertTextIntoMessageBox(payload.content);
          break;

        // Sidebar pede para fechar
        case 'VEXX_CLOSE_SIDEBAR':
          if (sidebarVisible) toggleSidebar();
          break;

        // Sidebar pede o contato atual
        case 'VEXX_GET_CONTACT':
          sendToSidebar({ type: 'VEXX_CONTACT_CHANGED', contact: currentContact });
          break;

        // Sidebar salvou token (após login no popup)
        case 'VEXX_TOKEN_SAVED':
          chrome.storage.local.set({
            vexx_token: payload.token,
            vexx_tenant_id: payload.tenantId,
            vexx_crm_url: payload.crmUrl,
          });
          break;
      }
    });

    // Mensagens do background service worker
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'VEXX_TOGGLE_FROM_POPUP') {
        toggleSidebar();
      }
    });
  }

  // ━━━ BOOT ━━━
  waitForWhatsApp();

})();
