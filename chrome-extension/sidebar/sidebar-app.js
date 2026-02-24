/**
 * VEXX CRM — Sidebar App (React sem bundler, UMD) v2
 *
 * Roda dentro do iframe isolado injetado no WhatsApp Web.
 * Comunica com o content script via window.postMessage.
 *
 * Funcionalidades:
 * - Login com token do CRM
 * - Dados do cliente ativo (nome, telefone, histórico, insights Sentinela)
 * - Respostas rápidas com busca e inserção 1-click
 * - Notas rápidas sobre o cliente
 * - Chat com a Anne (IA) com contexto automático do cliente aberto
 */

const { useState, useEffect, useCallback, useRef, useMemo } = React;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TABS = [
  { id: 'quick-replies', label: '⚡ Respostas', icon: '⚡' },
  { id: 'client',        label: '👤 Cliente',   icon: '👤' },
  { id: 'notes',         label: '📝 Notas',     icon: '📝' },
  { id: 'anne',          label: '🤖 Anne',      icon: '🤖' },
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK: Comunicação com o Content Script (postMessage)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useContentScriptBridge() {
  const [contact, setContact]       = useState(null);
  const [initData, setInitData]     = useState(null);

  useEffect(() => {
    function onMessage(event) {
      const { type, ...rest } = event.data || {};
      switch (type) {
        case 'VEXX_INIT':
          setInitData({ token: rest.token, tenantId: rest.tenantId, crmUrl: rest.crmUrl });
          break;
        case 'VEXX_CONTACT_CHANGED':
          setContact(rest.contact);
          break;
      }
    }
    window.addEventListener('message', onMessage);

    // Pedir contato atual ao content script
    window.parent.postMessage({ type: 'VEXX_GET_CONTACT' }, '*');

    return () => window.removeEventListener('message', onMessage);
  }, []);

  const insertQuickReply = useCallback((content) => {
    window.parent.postMessage({ type: 'VEXX_INSERT_QUICK_REPLY', payload: { content } }, '*');
  }, []);

  const closeSidebar = useCallback(() => {
    window.parent.postMessage({ type: 'VEXX_CLOSE_SIDEBAR' }, '*');
  }, []);

  const saveToken = useCallback((token, tenantId, crmUrl) => {
    window.parent.postMessage({ type: 'VEXX_TOKEN_SAVED', payload: { token, tenantId, crmUrl } }, '*');
  }, []);

  return { contact, initData, insertQuickReply, closeSidebar, saveToken };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK: API do VEXX CRM
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useCrmApi(crmUrl, token, tenantId) {
  const [quickReplies, setQuickReplies] = useState([]);
  const [clientData, setClientData]     = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  // Cache local para não bater na API a cada troca de chat
  const cacheRef = useRef({ quickReplies: null, lastFetch: 0 });

  const apiFetch = useCallback(async (path, opts = {}) => {
    if (!crmUrl || !token) throw new Error('Não autenticado');
    const res = await fetch(`${crmUrl}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': tenantId || '',
        ...(opts.headers || {}),
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error || `HTTP ${res.status}`);
    }
    return res.json();
  }, [crmUrl, token, tenantId]);

  // Buscar respostas rápidas (com cache de 5 minutos)
  const fetchQuickReplies = useCallback(async () => {
    const now = Date.now();
    if (cacheRef.current.quickReplies && now - cacheRef.current.lastFetch < 5 * 60 * 1000) {
      setQuickReplies(cacheRef.current.quickReplies);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/extension/quick-replies');
      setQuickReplies(data.quickReplies || []);
      cacheRef.current = { quickReplies: data.quickReplies || [], lastFetch: now };
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  // Buscar dados do cliente pelo telefone
  const fetchClient = useCallback(async (phone) => {
    if (!phone) { setClientData(null); return; }
    setLoading(true);
    try {
      const data = await apiFetch(`/api/extension/client?phone=${encodeURIComponent(phone)}`);
      setClientData(data.client || null);
    } catch (e) {
      setClientData(null);
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  // Salvar nota rápida
  const saveNote = useCallback(async (clientId, note) => {
    await apiFetch(`/api/extension/client/${clientId}/note`, {
      method: 'POST',
      body: JSON.stringify({ note }),
    });
  }, [apiFetch]);

  // Incrementar contador de uso da resposta rápida
  const trackUsage = useCallback(async (quickReplyId) => {
    apiFetch(`/api/extension/quick-replies/${quickReplyId}/use`, { method: 'POST' })
      .catch(() => {}); // fire-and-forget
  }, [apiFetch]);

  // Chat com a Anne (com contexto do cliente atual)
  const chatWithAnne = useCallback(async (message, phone, chatHistory) => {
    const data = await apiFetch('/api/extension/anne/chat', {
      method: 'POST',
      body: JSON.stringify({ message, phone, chat_history: chatHistory }),
    });
    return data.data?.reply || '❌ Sem resposta';
  }, [apiFetch]);

  return { quickReplies, clientData, loading, error, fetchQuickReplies, fetchClient, saveNote, trackUsage, chatWithAnne };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HOOK: Chat com a Anne (estado local por sessão)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function useAnneChat(chatWithAnne, currentPhone) {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: 'Olá! Sou a **Anne** 🤖 Posso te ajudar com sugestões de resposta, estratégias de venda, cupons e análise do cliente aberto. Como posso ajudar?', ts: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  // Rolar para o fim quando chegar nova mensagem
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Limpar histórico quando troca de contato
  const prevPhoneRef = useRef(currentPhone);
  useEffect(() => {
    if (prevPhoneRef.current !== currentPhone) {
      prevPhoneRef.current = currentPhone;
      setMessages([
        { role: 'assistant', content: '🔄 Novo contato detectado! Estou pronto para ajudar com este cliente.', ts: Date.now() }
      ]);
    }
  }, [currentPhone]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    const userMsg = { role: 'user', content: text, ts: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setLoading(true);
    try {
      // Enviar histórico sem o campo ts (a API não precisa)
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .slice(-10)
        .map(m => ({ role: m.role, content: m.content }));
      const reply = await chatWithAnne(text, currentPhone, history);
      setMessages(prev => [...prev, { role: 'assistant', content: reply, ts: Date.now() }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `❌ Erro: ${e.message}`, ts: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, chatWithAnne, currentPhone]);

  return { messages, input, setInput, loading, send, bottomRef };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTE: Tela de Login
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function LoginScreen({ onLogin }) {
  const [crmUrl, setCrmUrl]   = useState('https://vexxcrm.netlify.app');
  const [email, setEmail]     = useState('');
  const [password, setPass]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${crmUrl}/api/auth/extension-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Credenciais inválidas');
      onLogin(data.token, data.tenantId, crmUrl);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return React.createElement('div', { className: 'h-full flex flex-col items-center justify-center p-6 bg-white' },
    React.createElement('div', { className: 'w-full max-w-xs' },
      // Logo
      React.createElement('div', { className: 'text-center mb-8' },
        React.createElement('div', { className: 'w-16 h-16 rounded-2xl bg-brand flex items-center justify-center mx-auto mb-3' },
          React.createElement('span', { className: 'text-white text-2xl font-bold' }, 'V')
        ),
        React.createElement('h1', { className: 'text-xl font-bold text-gray-900' }, 'VEXX CRM'),
        React.createElement('p', { className: 'text-sm text-gray-500 mt-1' }, 'Central de Atendimento')
      ),
      // Formulário
      React.createElement('form', { onSubmit: handleLogin, className: 'space-y-4' },
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-xs font-medium text-gray-700 mb-1' }, 'URL do CRM'),
          React.createElement('input', {
            type: 'url',
            value: crmUrl,
            onChange: e => setCrmUrl(e.target.value),
            className: 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30',
            required: true,
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-xs font-medium text-gray-700 mb-1' }, 'E-mail'),
          React.createElement('input', {
            type: 'email',
            value: email,
            onChange: e => setEmail(e.target.value),
            placeholder: 'seu@email.com',
            className: 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30',
            required: true,
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { className: 'block text-xs font-medium text-gray-700 mb-1' }, 'Senha'),
          React.createElement('input', {
            type: 'password',
            value: password,
            onChange: e => setPass(e.target.value),
            placeholder: '••••••••',
            className: 'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30',
            required: true,
          })
        ),
        error && React.createElement('p', { className: 'text-xs text-red-500 bg-red-50 px-3 py-2 rounded-lg' }, error),
        React.createElement('button', {
          type: 'submit',
          disabled: loading,
          className: 'w-full py-2.5 text-sm font-semibold text-white rounded-lg transition-all ' +
            (loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-brand hover:bg-brand-light active:scale-95'),
        }, loading ? 'Entrando...' : 'Entrar no CRM')
      )
    )
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTE: Card de Resposta Rápida
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function QuickReplyCard({ reply, onInsert }) {
  const [copied, setCopied] = useState(false);

  function handleInsert() {
    onInsert(reply.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return React.createElement('div', {
    className: 'bg-white rounded-xl border border-gray-100 p-3 hover:border-brand/30 hover:shadow-sm transition-all group fade-in',
  },
    React.createElement('div', { className: 'flex items-start justify-between gap-2' },
      React.createElement('div', { className: 'flex-1 min-w-0' },
        React.createElement('div', { className: 'flex items-center gap-2 mb-1' },
          React.createElement('span', { className: 'text-xs font-mono text-brand bg-brand/10 px-1.5 py-0.5 rounded' },
            reply.shortcut
          ),
          reply.category && reply.category !== 'general' && React.createElement('span', {
            className: 'text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded capitalize'
          }, reply.category)
        ),
        React.createElement('p', { className: 'text-xs font-medium text-gray-800 mb-1' }, reply.title),
        React.createElement('p', { className: 'text-xs text-gray-500 line-clamp-2 leading-relaxed' }, reply.content)
      ),
      React.createElement('button', {
        onClick: handleInsert,
        className: 'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition-all ' +
          (copied
            ? 'bg-success text-white'
            : 'bg-gray-100 text-gray-500 hover:bg-brand hover:text-white group-hover:bg-brand group-hover:text-white'
          ),
        title: 'Inserir no WhatsApp',
      },
        copied
          ? React.createElement('span', null, '✓')
          : React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5 },
              React.createElement('line', { x1: '22', y1: '2', x2: '11', y2: '13' }),
              React.createElement('polygon', { points: '22 2 15 22 11 13 2 9 22 2' })
            )
      )
    )
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTE: Aba de Respostas Rápidas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function QuickRepliesTab({ quickReplies, loading, error, onInsert, onRefresh }) {
  const [search, setSearch] = useState('');

  const filtered = quickReplies.filter(r =>
    !search ||
    r.title.toLowerCase().includes(search.toLowerCase()) ||
    r.shortcut.toLowerCase().includes(search.toLowerCase()) ||
    r.content.toLowerCase().includes(search.toLowerCase()) ||
    (r.category || '').toLowerCase().includes(search.toLowerCase())
  );

  // Agrupar por categoria
  const groups = filtered.reduce((acc, r) => {
    const cat = r.category || 'Geral';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(r);
    return acc;
  }, {});

  return React.createElement('div', { className: 'flex flex-col h-full' },
    // Barra de busca
    React.createElement('div', { className: 'p-3 border-b border-gray-100' },
      React.createElement('div', { className: 'relative' },
        React.createElement('svg', {
          className: 'absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400',
          width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2
        },
          React.createElement('circle', { cx: 11, cy: 11, r: 8 }),
          React.createElement('line', { x1: 21, y1: 21, x2: 16.65, y2: 16.65 })
        ),
        React.createElement('input', {
          type: 'text',
          value: search,
          onChange: e => setSearch(e.target.value),
          placeholder: 'Buscar respostas ou /atalho...',
          className: 'w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30',
        })
      )
    ),

    // Lista
    React.createElement('div', { className: 'flex-1 overflow-y-auto scrollbar-thin p-3 space-y-4' },
      loading && React.createElement('div', { className: 'flex items-center justify-center h-32' },
        React.createElement('div', { className: 'w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin' })
      ),

      error && React.createElement('div', { className: 'bg-red-50 border border-red-100 rounded-xl p-4 text-center' },
        React.createElement('p', { className: 'text-sm text-red-600 mb-2' }, '⚠️ ' + error),
        React.createElement('button', {
          onClick: onRefresh,
          className: 'text-xs text-brand underline'
        }, 'Tentar novamente')
      ),

      !loading && !error && filtered.length === 0 && React.createElement('div', { className: 'text-center py-10 text-gray-400' },
        React.createElement('p', { className: 'text-3xl mb-2' }, '⚡'),
        React.createElement('p', { className: 'text-sm' }, search ? 'Nenhuma resposta encontrada' : 'Nenhuma resposta rápida cadastrada'),
        !search && React.createElement('a', {
          href: '#',
          onClick: (e) => { e.preventDefault(); window.parent.postMessage({ type: 'VEXX_OPEN_CRM_QUICK_REPLIES' }, '*'); },
          className: 'text-xs text-brand underline mt-1 block'
        }, 'Criar no CRM')
      ),

      !loading && !error && Object.entries(groups).map(([category, replies]) =>
        React.createElement('div', { key: category },
          React.createElement('p', { className: 'text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2 px-1' }, category),
          React.createElement('div', { className: 'space-y-2' },
            replies.map(reply =>
              React.createElement(QuickReplyCard, { key: reply.id, reply, onInsert })
            )
          )
        )
      )
    ),

    // Rodapé
    React.createElement('div', { className: 'p-3 border-t border-gray-100 text-center' },
      React.createElement('p', { className: 'text-xs text-gray-400' },
        `${quickReplies.length} resposta${quickReplies.length !== 1 ? 's' : ''} cadastrada${quickReplies.length !== 1 ? 's' : ''}`
      )
    )
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTE: Aba do Cliente
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function ClientTab({ contact, clientData, loading, crmUrl }) {
  if (!contact?.name && !contact?.phone) {
    return React.createElement('div', { className: 'flex flex-col items-center justify-center h-full text-gray-400 p-6' },
      React.createElement('p', { className: 'text-4xl mb-3' }, '👆'),
      React.createElement('p', { className: 'text-sm text-center' }, 'Abra uma conversa no WhatsApp para ver os dados do cliente')
    );
  }

  const orders   = clientData?.recentOrders || [];
  const stats    = clientData?.stats || {};
  const analyses = clientData?.analyses || [];

  // Urgência → cor do badge
  const urgencyClass = (u) => ({ critical: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', medium: 'bg-yellow-100 text-yellow-700', low: 'bg-gray-100 text-gray-600' }[u] || 'bg-gray-100 text-gray-600');
  const urgencyIcon  = (u) => ({ critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[u] || '⚪');

  function openInCRM() {
    const url = crmUrl || 'https://vexxcrm.netlify.app';
    // Abre na Central de Atendimento — o CRM lida com o roteamento
    window.open(`${url}/central`, '_blank');
  }

  return React.createElement('div', { className: 'flex flex-col h-full overflow-y-auto scrollbar-thin p-4 space-y-4' },
    // Card do cliente
    React.createElement('div', { className: 'bg-white rounded-xl border border-gray-100 p-4' },
      React.createElement('div', { className: 'flex items-start gap-3 mb-3' },
        React.createElement('div', { className: 'relative shrink-0' },
          contact.avatar
            ? React.createElement('img', { src: contact.avatar, className: 'w-12 h-12 rounded-full object-cover', alt: '' })
            : React.createElement('div', { className: 'w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-lg' },
                (contact.name || '?').charAt(0).toUpperCase()
              ),
          clientData?.rfm_segment && React.createElement('span', {
            className: 'absolute -bottom-1 -right-1 text-[10px] bg-white rounded-full px-1 border border-gray-100 shadow-sm',
            title: 'Segmento RFM',
          }, clientData.rfm_segment === 'vip' ? '👑' : clientData.rfm_segment === 'champion' ? '🏆' : clientData.rfm_segment === 'at_risk' ? '⚠️' : '🏷️')
        ),
        React.createElement('div', { className: 'flex-1 min-w-0' },
          React.createElement('p', { className: 'font-semibold text-gray-900 text-sm truncate' }, clientData?.name || contact.name || 'Desconhecido'),
          React.createElement('p', { className: 'text-xs text-gray-500' }, contact.phone || '—'),
          clientData?.email && React.createElement('p', { className: 'text-xs text-gray-400 truncate' }, clientData.email),
          clientData?.rfm_segment && React.createElement('span', {
            className: 'inline-block mt-1 text-[10px] px-2 py-0.5 rounded-full bg-brand/10 text-brand font-medium capitalize'
          }, clientData.rfm_segment)
        ),
        // Botão abrir no CRM
        React.createElement('button', {
          onClick: openInCRM,
          title: 'Abrir no CRM',
          className: 'shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-brand hover:text-white text-gray-500 transition-all',
        },
          React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2 },
            React.createElement('path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }),
            React.createElement('polyline', { points: '15 3 21 3 21 9' }),
            React.createElement('line', { x1: 10, y1: 14, x2: 21, y2: 3 })
          )
        )
      ),
      // Stats
      React.createElement('div', { className: 'grid grid-cols-3 gap-2 pt-3 border-t border-gray-50' },
        [
          { label: 'Pedidos', value: stats.totalOrders ?? '—' },
          { label: 'Gasto total', value: stats.totalSpent ? `R$ ${Number(stats.totalSpent).toFixed(0)}` : '—' },
          { label: 'Ticket médio', value: stats.avgTicket ? `R$ ${Number(stats.avgTicket).toFixed(0)}` : '—' },
        ].map(s =>
          React.createElement('div', { key: s.label, className: 'text-center' },
            React.createElement('p', { className: 'text-sm font-bold text-brand' }, s.value),
            React.createElement('p', { className: 'text-[10px] text-gray-400' }, s.label)
          )
        )
      )
    ),

    // ── Alertas Sentinela (Anne Intelligence) ──
    analyses.length > 0 && React.createElement('div', null,
      React.createElement('p', { className: 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1' },
        '🧠 Alertas Anne',
        React.createElement('span', { className: 'ml-1 text-[10px] px-1.5 py-0.5 bg-brand/10 text-brand rounded-full font-bold' }, analyses.length)
      ),
      React.createElement('div', { className: 'space-y-2' },
        analyses.map((a, i) =>
          React.createElement('div', { key: i, className: 'bg-white rounded-xl border border-gray-100 p-3 flex gap-2 items-start' },
            React.createElement('span', { className: 'text-sm shrink-0 mt-0.5' }, urgencyIcon(a.urgency)),
            React.createElement('div', { className: 'flex-1 min-w-0' },
              React.createElement('p', { className: 'text-xs font-semibold text-gray-800' }, a.title),
              React.createElement('p', { className: 'text-xs text-gray-500 mt-0.5 line-clamp-2' }, a.description),
              React.createElement('span', { className: 'inline-block mt-1.5 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize ' + urgencyClass(a.urgency) }, a.urgency)
            )
          )
        )
      )
    ),

    // ── Pedidos recentes ──
    orders.length > 0 && React.createElement('div', null,
      React.createElement('p', { className: 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2' }, 'Últimos pedidos'),
      React.createElement('div', { className: 'space-y-2' },
        orders.slice(0, 5).map(order =>
          React.createElement('div', { key: order.id, className: 'bg-white rounded-xl border border-gray-100 p-3' },
            React.createElement('div', { className: 'flex justify-between items-start' },
              React.createElement('div', null,
                React.createElement('p', { className: 'text-xs font-semibold text-gray-800' }, `#${order.order_number}`),
                React.createElement('p', { className: 'text-xs text-gray-500' },
                  new Date(order.created_at).toLocaleDateString('pt-BR')
                )
              ),
              React.createElement('span', {
                className: 'text-xs px-2 py-0.5 rounded-full font-medium ' + getStatusClass(order.status)
              }, getStatusLabel(order.status))
            ),
            order.tracking_code && React.createElement('p', { className: 'text-xs text-brand mt-1 font-mono' },
              '📦 ' + order.tracking_code
            )
          )
        )
      )
    ),

    !clientData && !loading && React.createElement('div', { className: 'bg-amber-50 border border-amber-100 rounded-xl p-3 text-center' },
      React.createElement('p', { className: 'text-xs text-amber-700' }, '⚠️ Cliente não encontrado no CRM'),
      React.createElement('p', { className: 'text-[10px] text-amber-500 mt-1' }, 'O número pode não ter pedidos cadastrados')
    ),

    loading && React.createElement('div', { className: 'flex justify-center py-4' },
      React.createElement('div', { className: 'w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin' })
    )
  );
}

function getStatusLabel(status) {
  const map = { pending: 'Pendente', confirmed: 'Confirmado', processing: 'Processando', shipped: 'Despachado', delivered: 'Entregue', cancelled: 'Cancelado' };
  return map[status] || status;
}
function getStatusClass(status) {
  const map = { pending: 'bg-yellow-100 text-yellow-700', confirmed: 'bg-blue-100 text-blue-700', processing: 'bg-purple-100 text-purple-700', shipped: 'bg-indigo-100 text-indigo-700', delivered: 'bg-green-100 text-green-700', cancelled: 'bg-red-100 text-red-700' };
  return map[status] || 'bg-gray-100 text-gray-600';
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTE: Aba de Notas
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function NotesTab({ clientData, onSaveNote }) {
  const [note, setNote]       = useState('');
  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);

  const notes = clientData?.notes || [];

  async function handleSave() {
    if (!note.trim() || !clientData?.id) return;
    setSaving(true);
    try {
      await onSaveNote(clientData.id, note.trim());
      setNote('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 2000);
    } catch {
      // silencioso
    } finally {
      setSaving(false);
    }
  }

  return React.createElement('div', { className: 'flex flex-col h-full' },
    // Input de nova nota
    React.createElement('div', { className: 'p-4 border-b border-gray-100' },
      React.createElement('textarea', {
        value: note,
        onChange: e => setNote(e.target.value),
        placeholder: 'Adicionar observação sobre este cliente...',
        rows: 3,
        className: 'w-full text-xs border border-gray-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30',
        disabled: !clientData?.id,
      }),
      React.createElement('button', {
        onClick: handleSave,
        disabled: !note.trim() || !clientData?.id || saving,
        className: 'mt-2 w-full py-2 text-xs font-semibold rounded-lg transition-all ' +
          (!note.trim() || !clientData?.id ? 'bg-gray-100 text-gray-400 cursor-not-allowed' :
            success ? 'bg-success text-white' : 'bg-brand text-white hover:bg-brand-light'),
      }, success ? '✓ Salvo!' : saving ? 'Salvando...' : 'Salvar Nota')
    ),

    // Lista de notas existentes
    React.createElement('div', { className: 'flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3' },
      notes.length === 0
        ? React.createElement('div', { className: 'text-center py-8 text-gray-400' },
            React.createElement('p', { className: 'text-3xl mb-2' }, '📝'),
            React.createElement('p', { className: 'text-xs' }, 'Nenhuma nota cadastrada')
          )
        : notes.map((n, i) =>
            React.createElement('div', { key: i, className: 'bg-white rounded-xl border border-gray-100 p-3' },
              React.createElement('p', { className: 'text-xs text-gray-700 leading-relaxed' }, n.content),
              React.createElement('p', { className: 'text-xs text-gray-400 mt-1.5' },
                new Date(n.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
              )
            )
          )
    )
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTE: Aba Anne (Chat com IA)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Renderiza markdown simples: **negrito**, _itálico_, quebras de linha
function renderMarkdown(text) {
  const parts = [];
  let rest = text || '';
  let i = 0;
  while (rest.length > 0) {
    const boldIdx = rest.indexOf('**');
    const italicIdx = rest.indexOf('_');
    const brIdx = rest.indexOf('\n');
    const indices = [boldIdx, italicIdx, brIdx].filter(x => x >= 0);
    const next = indices.length > 0 ? Math.min(...indices) : -1;

    if (next === -1) {
      parts.push(React.createElement('span', { key: i++ }, rest));
      break;
    }
    if (next > 0) {
      parts.push(React.createElement('span', { key: i++ }, rest.slice(0, next)));
      rest = rest.slice(next);
    }
    if (rest.startsWith('**')) {
      const end = rest.indexOf('**', 2);
      if (end === -1) { parts.push(React.createElement('span', { key: i++ }, rest)); break; }
      parts.push(React.createElement('strong', { key: i++ }, rest.slice(2, end)));
      rest = rest.slice(end + 2);
    } else if (rest.startsWith('_')) {
      const end = rest.indexOf('_', 1);
      if (end === -1) { parts.push(React.createElement('span', { key: i++ }, rest)); break; }
      parts.push(React.createElement('em', { key: i++ }, rest.slice(1, end)));
      rest = rest.slice(end + 1);
    } else if (rest.startsWith('\n')) {
      parts.push(React.createElement('br', { key: i++ }));
      rest = rest.slice(1);
    }
  }
  return parts;
}

function AnneChatBubble({ msg }) {
  const isUser = msg.role === 'user';
  return React.createElement('div', {
    className: 'flex ' + (isUser ? 'justify-end' : 'justify-start') + ' mb-2 fade-in',
  },
    React.createElement('div', {
      className: 'max-w-[88%] px-3 py-2 rounded-2xl text-xs leading-relaxed ' +
        (isUser
          ? 'bg-brand text-white rounded-tr-sm'
          : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm shadow-sm'),
    },
      isUser
        ? msg.content
        : React.createElement('span', null, ...renderMarkdown(msg.content))
    )
  );
}

function AnneTab({ contact, chatWithAnne }) {
  const anne = useAnneChat(chatWithAnne, contact?.phone);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      anne.send();
    }
  };

  return React.createElement('div', { className: 'flex flex-col h-full' },
    // Header informativo
    React.createElement('div', { className: 'px-4 py-2.5 bg-brand/5 border-b border-brand/10' },
      React.createElement('p', { className: 'text-xs text-brand font-medium flex items-center gap-1.5' },
        React.createElement('span', null, '🤖'),
        contact?.name
          ? `Anne analisando: ${contact.name}`
          : 'Anne — IA Assistente de Vendas'
      ),
      React.createElement('p', { className: 'text-[10px] text-gray-400 mt-0.5' },
        'Contexto do cliente é enviado automaticamente'
      )
    ),

    // Histórico de mensagens
    React.createElement('div', { className: 'flex-1 overflow-y-auto scrollbar-thin p-4' },
      anne.messages.map((msg, i) =>
        React.createElement(AnneChatBubble, { key: i, msg })
      ),
      anne.loading && React.createElement('div', { className: 'flex justify-start mb-2' },
        React.createElement('div', { className: 'bg-white border border-gray-100 rounded-2xl rounded-tl-sm px-4 py-2.5 shadow-sm' },
          React.createElement('div', { className: 'flex items-center gap-1.5' },
            [0,1,2].map(j =>
              React.createElement('div', {
                key: j,
                className: 'w-1.5 h-1.5 bg-brand/50 rounded-full animate-bounce',
                style: { animationDelay: `${j * 0.15}s` }
              })
            )
          )
        )
      ),
      React.createElement('div', { ref: anne.bottomRef })
    ),

    // Input de mensagem
    React.createElement('div', { className: 'p-3 border-t border-gray-100 bg-white' },
      React.createElement('div', { className: 'flex items-end gap-2 bg-gray-50 rounded-2xl px-3 py-2 border border-gray-200 focus-within:border-brand/40 focus-within:ring-2 focus-within:ring-brand/10 transition-all' },
        React.createElement('textarea', {
          value: anne.input,
          onChange: e => anne.setInput(e.target.value),
          onKeyDown: handleKeyDown,
          placeholder: 'Pergunte à Anne... (Enter para enviar)',
          rows: 1,
          className: 'flex-1 text-xs bg-transparent outline-none resize-none text-gray-800 placeholder:text-gray-400 max-h-20',
          disabled: anne.loading,
        }),
        React.createElement('button', {
          onClick: anne.send,
          disabled: !anne.input.trim() || anne.loading,
          className: 'shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-all ' +
            (anne.input.trim() && !anne.loading ? 'bg-brand text-white hover:bg-brand-light' : 'bg-gray-200 text-gray-400 cursor-not-allowed'),
        },
          React.createElement('svg', { width: 13, height: 13, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5 },
            React.createElement('line', { x1: 22, y1: 2, x2: 11, y2: 13 }),
            React.createElement('polygon', { points: '22 2 15 22 11 13 2 9 22 2' })
          )
        )
      ),
      React.createElement('p', { className: 'text-[10px] text-gray-400 text-center mt-1.5' },
        'Anne usa o contexto do cliente aberto automaticamente'
      )
    )
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// COMPONENTE: App Principal
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function App() {
  const [activeTab, setActiveTab] = useState('quick-replies');
  const [authData, setAuthData]   = useState(null); // { token, tenantId, crmUrl }

  const bridge = useContentScriptBridge();
  const api    = useCrmApi(authData?.crmUrl, authData?.token, authData?.tenantId);

  // Receber dados de auth do content script (vindos do chrome.storage)
  useEffect(() => {
    if (bridge.initData?.token) {
      setAuthData({
        token:    bridge.initData.token,
        tenantId: bridge.initData.tenantId,
        crmUrl:   bridge.initData.crmUrl,
      });
    }
  }, [bridge.initData]);

  // Carregar respostas rápidas quando autenticado
  useEffect(() => {
    if (authData?.token) {
      api.fetchQuickReplies();
    }
  }, [authData]);

  // Carregar dados do cliente quando o contato muda
  useEffect(() => {
    if (authData?.token && bridge.contact?.phone) {
      api.fetchClient(bridge.contact.phone);
    }
  }, [bridge.contact?.phone, authData]);

  function handleLogin(token, tenantId, crmUrl) {
    setAuthData({ token, tenantId, crmUrl });
    bridge.saveToken(token, tenantId, crmUrl);
  }

  function handleInsertQuickReply(content) {
    bridge.insertQuickReply(content);
  }

  // Não autenticado → tela de login
  if (!authData?.token) {
    return React.createElement(LoginScreen, { onLogin: handleLogin });
  }

  return React.createElement('div', { className: 'h-full flex flex-col bg-gray-50' },
    // Header
    React.createElement('header', { className: 'bg-brand text-white px-4 py-3 flex items-center justify-between shrink-0' },
      React.createElement('div', { className: 'flex items-center gap-2' },
        React.createElement('div', { className: 'w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center' },
          React.createElement('span', { className: 'text-sm font-bold' }, 'V')
        ),
        React.createElement('div', null,
          React.createElement('p', { className: 'text-sm font-semibold leading-none' }, 'VEXX CRM'),
          bridge.contact?.name && React.createElement('p', { className: 'text-xs text-white/60 mt-0.5 truncate max-w-[160px]' }, bridge.contact.name)
        )
      ),
      React.createElement('button', {
        onClick: () => bridge.closeSidebar(),
        className: 'w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors',
        title: 'Fechar',
      },
        React.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.5 },
          React.createElement('line', { x1: 18, y1: 6, x2: 6, y2: 18 }),
          React.createElement('line', { x1: 6, y1: 6, x2: 18, y2: 18 })
        )
      )
    ),

    // Tabs
    React.createElement('nav', { className: 'bg-white border-b border-gray-100 flex shrink-0' },
      TABS.map(tab =>
        React.createElement('button', {
          key: tab.id,
          onClick: () => setActiveTab(tab.id),
          className: 'flex-1 py-2.5 text-xs font-medium transition-all border-b-2 ' +
            (activeTab === tab.id
              ? 'text-brand border-brand bg-brand/5'
              : 'text-gray-500 border-transparent hover:text-gray-700'),
        }, tab.label)
      )
    ),

    // Conteúdo
    React.createElement('main', { className: 'flex-1 overflow-hidden' },
      activeTab === 'quick-replies' && React.createElement(QuickRepliesTab, {
        quickReplies: api.quickReplies,
        loading: api.loading,
        error: api.error,
        onInsert: handleInsertQuickReply,
        onRefresh: api.fetchQuickReplies,
      }),
      activeTab === 'client' && React.createElement(ClientTab, {
        contact: bridge.contact,
        clientData: api.clientData,
        loading: api.loading,
        crmUrl: authData?.crmUrl,
      }),
      activeTab === 'notes' && React.createElement(NotesTab, {
        clientData: api.clientData,
        onSaveNote: api.saveNote,
      }),
      activeTab === 'anne' && React.createElement(AnneTab, {
        contact: bridge.contact,
        chatWithAnne: api.chatWithAnne,
      })
    )
  );
}

// ━━━ BOOTSTRAP ━━━
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
