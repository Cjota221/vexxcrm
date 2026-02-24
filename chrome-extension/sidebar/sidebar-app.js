/**
 * VEXX CRM — Sidebar App (React sem bundler, UMD)
 * 
 * Roda dentro do iframe isolado injetado no WhatsApp Web.
 * Comunica com o content script via window.postMessage.
 * 
 * Funcionalidades:
 * - Login com token do CRM
 * - Dados do cliente ativo (nome, telefone, histórico)
 * - Respostas rápidas com busca e inserção 1-click
 * - Notas rápidas sobre o cliente
 */

const { useState, useEffect, useCallback, useRef } = React;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONSTANTES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const TABS = [
  { id: 'quick-replies', label: '⚡ Respostas', icon: '⚡' },
  { id: 'client',        label: '👤 Cliente',   icon: '👤' },
  { id: 'notes',         label: '📝 Notas',     icon: '📝' },
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

  return { quickReplies, clientData, loading, error, fetchQuickReplies, fetchClient, saveNote, trackUsage };
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

function ClientTab({ contact, clientData, loading }) {
  if (!contact?.name && !contact?.phone) {
    return React.createElement('div', { className: 'flex flex-col items-center justify-center h-full text-gray-400 p-6' },
      React.createElement('p', { className: 'text-4xl mb-3' }, '👆'),
      React.createElement('p', { className: 'text-sm text-center' }, 'Abra uma conversa no WhatsApp para ver os dados do cliente')
    );
  }

  const orders = clientData?.recentOrders || [];
  const stats  = clientData?.stats || {};

  return React.createElement('div', { className: 'flex flex-col h-full overflow-y-auto scrollbar-thin p-4 space-y-4' },
    // Card do cliente
    React.createElement('div', { className: 'bg-white rounded-xl border border-gray-100 p-4' },
      React.createElement('div', { className: 'flex items-center gap-3 mb-3' },
        contact.avatar
          ? React.createElement('img', { src: contact.avatar, className: 'w-12 h-12 rounded-full object-cover', alt: '' })
          : React.createElement('div', { className: 'w-12 h-12 rounded-full bg-brand/10 flex items-center justify-center text-brand font-bold text-lg' },
              (contact.name || '?').charAt(0).toUpperCase()
            ),
        React.createElement('div', null,
          React.createElement('p', { className: 'font-semibold text-gray-900 text-sm' }, clientData?.name || contact.name || 'Desconhecido'),
          React.createElement('p', { className: 'text-xs text-gray-500' }, contact.phone || '—'),
          clientData?.email && React.createElement('p', { className: 'text-xs text-gray-400' }, clientData.email)
        )
      ),
      // Stats
      stats && React.createElement('div', { className: 'grid grid-cols-3 gap-2 pt-3 border-t border-gray-50' },
        [
          { label: 'Pedidos', value: stats.totalOrders ?? '—' },
          { label: 'Total gasto', value: stats.totalSpent ? `R$ ${(stats.totalSpent/100).toFixed(0)}` : '—' },
          { label: 'Ticket médio', value: stats.avgTicket ? `R$ ${(stats.avgTicket/100).toFixed(0)}` : '—' },
        ].map(s =>
          React.createElement('div', { key: s.label, className: 'text-center' },
            React.createElement('p', { className: 'text-base font-bold text-brand' }, s.value),
            React.createElement('p', { className: 'text-xs text-gray-400' }, s.label)
          )
        )
      )
    ),

    // Pedidos recentes
    orders.length > 0 && React.createElement('div', null,
      React.createElement('p', { className: 'text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2' }, 'Últimos pedidos'),
      React.createElement('div', { className: 'space-y-2' },
        orders.slice(0, 5).map(order =>
          React.createElement('div', { key: order.id, className: 'bg-white rounded-xl border border-gray-100 p-3' },
            React.createElement('div', { className: 'flex justify-between items-start' },
              React.createElement('div', null,
                React.createElement('p', { className: 'text-xs font-semibold text-gray-800' }, `Pedido #${order.order_number}`),
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
      }),
      activeTab === 'notes' && React.createElement(NotesTab, {
        clientData: api.clientData,
        onSaveNote: api.saveNote,
      })
    )
  );
}

// ━━━ BOOTSTRAP ━━━
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
