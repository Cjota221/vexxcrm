'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Search,
  MessageSquarePlus,
  Megaphone,
  Brain,
  X,
  ChevronDown,
  Plus,
  Trash2,
  GripVertical,
  Link2,
  MousePointerClick,
  Image as ImageIcon,
  Type,
  AlertCircle,
  Loader2,
  Activity,
  Power,
  PowerOff,
  Video,
  Mic,
  FileText,
  Copy,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { useChatsStore } from '@/store/chats';
import { useDebounce } from '@/hooks/useDebounce';
import { api } from '@/lib/api';
import type { TemplateBlock, TemplateBlockType } from '@/types';

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   TIPOS INTERNOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type ActiveTool = 'search' | 'templates' | 'campaign' | 'anne-monitor' | null;

interface CentralToolbarProps {
  /** Estado do toggle da Anne para a conversa ativa */
  anneEnabled: boolean;
  onAnneToggle: (enabled: boolean) => void;
  /** Callback para abrir painel de campanha */
  onOpenCampaign: () => void;
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   ATALHOS DE TECLADO
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const SHORTCUTS: Record<string, ActiveTool> = {
  F1: 'search',
  F2: 'templates',
  F3: 'campaign',
  F4: 'anne-monitor',
};

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   BLOCO DE TEMPLATE — item da lista de blocos
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

const BLOCK_TYPE_CONFIG: Record<
  TemplateBlockType,
  { label: string; icon: typeof Type; placeholder: string }
> = {
  text:      { label: 'Texto',        icon: Type,              placeholder: 'Digite o conteúdo do bloco...' },
  image:     { label: 'Imagem',       icon: ImageIcon,         placeholder: 'https://... (URL da imagem)' },
  video:     { label: 'Vídeo',        icon: Video,             placeholder: 'https://... (URL do vídeo)' },
  audio:     { label: 'Áudio',        icon: Mic,               placeholder: 'https://... (URL do áudio)' },
  document:  { label: 'Documento',    icon: FileText,          placeholder: 'https://... (URL do documento)' },
  link:      { label: 'Link',         icon: Link2,             placeholder: 'https://...' },
  cta:       { label: 'Botão',        icon: MousePointerClick, placeholder: 'Texto do botão' },
  copy_code: { label: 'Copiar Código', icon: Copy,             placeholder: 'Ex: CUPOM20 ou código de rastreio' },
};

function TemplateBlockItem({
  block,
  index,
  onUpdate,
  onRemove,
}: {
  block: TemplateBlock;
  index: number;
  onUpdate: (id: string, patch: Partial<TemplateBlock>) => void;
  onRemove: (id: string) => void;
}) {
  const config = BLOCK_TYPE_CONFIG[block.type];
  const Icon = config.icon;

  return (
    <div className="flex gap-2 items-start p-2 bg-surface-50 rounded-lg border border-surface-200 group">
      {/* Drag handle */}
      <div className="mt-1 cursor-grab text-surface-300 hover:text-surface-500">
        <GripVertical size={14} />
      </div>

      {/* Ícone do tipo */}
      <div className="mt-1 shrink-0">
        <Icon size={13} className="text-txt-secondary" />
      </div>

      {/* Conteúdo */}
      <div className="flex-1 min-w-0">
        {block.type === 'text' && (
          <textarea
            className="w-full text-xs resize-none bg-transparent border-none outline-none text-txt-primary placeholder:text-txt-muted min-h-10"
            placeholder={config.placeholder}
            value={block.content ?? ''}
            onChange={e => onUpdate(block.id, { content: e.target.value })}
            rows={2}
          />
        )}
        {block.type === 'image' && (
          <input
            className="w-full text-xs bg-transparent border-none outline-none text-txt-primary placeholder:text-txt-muted"
            placeholder={config.placeholder}
            value={block.image_url ?? ''}
            onChange={e => onUpdate(block.id, { image_url: e.target.value })}
          />
        )}
        {block.type === 'link' && (
          <div className="flex flex-col gap-1">
            <input
              className="w-full text-xs bg-transparent border-none outline-none text-txt-primary placeholder:text-txt-muted"
              placeholder="Título do link"
              value={block.link_title ?? ''}
              onChange={e => onUpdate(block.id, { link_title: e.target.value })}
            />
            <input
              className="w-full text-xs bg-transparent border-none outline-none text-txt-secondary placeholder:text-txt-muted"
              placeholder="https://..."
              value={block.link_url ?? ''}
              onChange={e => onUpdate(block.id, { link_url: e.target.value })}
            />
          </div>
        )}
        {block.type === 'cta' && (
          <div className="flex flex-col gap-1">
            <input
              className="w-full text-xs bg-transparent border-none outline-none text-txt-primary placeholder:text-txt-muted"
              placeholder="Texto do botão (ex: Ver oferta)"
              value={block.cta_label ?? ''}
              onChange={e => onUpdate(block.id, { cta_label: e.target.value })}
            />
            <input
              className="w-full text-xs bg-transparent border-none outline-none text-txt-secondary placeholder:text-txt-muted"
              placeholder="URL destino + UTM"
              value={block.cta_url ?? ''}
              onChange={e => onUpdate(block.id, { cta_url: e.target.value })}
            />
          </div>
        )}

        {/* Badge de variáveis detectadas */}
        {block.type === 'text' && block.content && /\{\{/.test(block.content) && (
          <div className="flex flex-wrap gap-1 mt-1">
            {[...block.content.matchAll(/\{\{(\w+)\}\}/g)].map((m, i) => (
              <span key={i} className="px-1 py-0.5 bg-crm-primary/10 text-crm-primary rounded text-[10px] font-mono">
                {`{{${m[1]}}}`}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Remover */}
      <button
        onClick={() => onRemove(block.id)}
        className="mt-0.5 opacity-0 group-hover:opacity-100 p-1 rounded text-red-400 hover:bg-red-50 transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PAINEL F1 — BUSCA AVANÇADA
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function SearchPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounce(query, 300);
  const { setSearchQuery, setFilter } = useChatsStore();

  useEffect(() => {
    if (debouncedQuery) {
      setSearchQuery(debouncedQuery);
      onClose();
    }
  }, [debouncedQuery, setSearchQuery, onClose]);

  const QUICK_FILTERS = [
    { label: 'tag:pago', desc: 'Clientes pagos' },
    { label: 'tag:risco_churn', desc: 'Em risco de churn' },
    { label: 'tag:lead_quente', desc: 'Leads quentes' },
    { label: 'tag:inativo', desc: 'Inativos' },
  ];

  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center gap-2 px-3 py-2 bg-surface-50 rounded-lg border border-surface-200 focus-within:border-crm-primary transition-colors">
        <Search size={14} className="text-txt-muted shrink-0" />
        <input
          autoFocus
          className="flex-1 text-sm bg-transparent outline-none placeholder:text-txt-muted text-txt-primary"
          placeholder='Buscar por nome, tag ou operador (ex: tag:pago)'
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Escape' && onClose()}
        />
        {query && (
          <button onClick={() => setQuery('')}>
            <X size={12} className="text-txt-muted" />
          </button>
        )}
      </div>

      <div>
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">Filtros rápidos</p>
        <div className="space-y-1">
          {QUICK_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => {
                setQuery(f.label);
                setSearchQuery(f.label);
                onClose();
              }}
              className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg hover:bg-surface-100 transition-colors text-left"
            >
              <span className="text-xs font-mono text-crm-primary">{f.label}</span>
              <span className="text-[11px] text-txt-muted">{f.desc}</span>
            </button>
          ))}
        </div>
      </div>

      <p className="text-[10px] text-txt-muted">
        Sintaxe: <span className="font-mono">tag:nome</span> · <span className="font-mono">data:{'>'}30d</span> · <span className="font-mono">AND</span> / <span className="font-mono">OR</span>
      </p>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PAINEL F2 — TEMPLATES COMPOSTOS
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

function TemplatesPanel({ onClose }: { onClose: () => void }) {
  const [templateName, setTemplateName] = useState('');
  const [blocks, setBlocks] = useState<TemplateBlock[]>([
    { id: '1', type: 'text', order: 0, content: 'Olá {{nome}}! ' },
  ]);
  const [saving, setSaving] = useState(false);

  const addBlock = useCallback((type: TemplateBlockType) => {
    setBlocks(prev => [
      ...prev,
      { id: Date.now().toString(), type, order: prev.length },
    ]);
  }, []);

  const updateBlock = useCallback((id: string, patch: Partial<TemplateBlock>) => {
    setBlocks(prev => prev.map(b => b.id === id ? { ...b, ...patch } : b));
  }, []);

  const removeBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
  }, []);

  // Variáveis detectadas em todos os blocos de texto
  const allVars = blocks
    .filter(b => b.type === 'text' && b.content)
    .flatMap(b => [...(b.content ?? '').matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]));
  const uniqueVars = [...new Set(allVars)];
  const hasUnresolvedVars = uniqueVars.length > 0;

  const handleSave = async () => {
    if (!templateName.trim() || blocks.length === 0) return;
    setSaving(true);
    await api.post('/api/templates', { name: templateName, blocks, variables: uniqueVars });
    setSaving(false);
    onClose();
  };

  return (
    <div className="p-3 space-y-3">
      <input
        autoFocus
        className="w-full text-sm px-3 py-2 bg-surface-50 border border-surface-200 rounded-lg outline-none focus:border-crm-primary placeholder:text-txt-muted text-txt-primary transition-colors"
        placeholder="Nome do template (ex: Boas-vindas Premium)"
        value={templateName}
        onChange={e => setTemplateName(e.target.value)}
      />

      {/* Lista de blocos */}
      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
        {blocks.map((block, i) => (
          <TemplateBlockItem
            key={block.id}
            block={block}
            index={i}
            onUpdate={updateBlock}
            onRemove={removeBlock}
          />
        ))}
      </div>

      {/* Adicionar bloco */}
      <div className="flex flex-wrap gap-1.5">
        {(Object.keys(BLOCK_TYPE_CONFIG) as TemplateBlockType[]).map(type => {
          const { label, icon: Icon } = BLOCK_TYPE_CONFIG[type];
          return (
            <button
              key={type}
              onClick={() => addBlock(type)}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-txt-secondary border border-surface-200 rounded-lg hover:bg-surface-100 hover:border-crm-primary/40 transition-colors"
            >
              <Plus size={10} />
              <Icon size={10} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Aviso de variáveis */}
      {hasUnresolvedVars && (
        <div className="flex items-start gap-1.5 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle size={12} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-[11px] text-amber-700">
            Variáveis detectadas: {uniqueVars.map(v => `{{${v}}}`).join(', ')} — serão substituídas no envio.
          </p>
        </div>
      )}

      {/* Ações */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onClose}
          className="flex-1 py-1.5 text-xs text-txt-secondary border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          onClick={handleSave}
          disabled={!templateName.trim() || blocks.length === 0 || saving}
          className="flex-1 py-1.5 text-xs font-semibold text-white bg-crm-primary rounded-lg hover:bg-crm-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
        >
          {saving ? <Loader2 size={12} className="animate-spin" /> : null}
          Salvar template
        </button>
      </div>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   PAINEL F4 — MONITOR DE STATUS DA ANNE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

type AnneStatus = 'ATIVA' | 'EM_ANALISE' | 'AGUARDANDO_INPUT' | 'PAUSADA';

const ANNE_STATUS_CONFIG: Record<
  AnneStatus,
  { label: string; color: string; dot: string }
> = {
  ATIVA:             { label: 'Ativa',              color: 'text-emerald-700 bg-emerald-50',  dot: 'bg-emerald-500 animate-pulse' },
  EM_ANALISE:        { label: 'Em Análise',          color: 'text-amber-700 bg-amber-50',     dot: 'bg-amber-500 animate-pulse' },
  AGUARDANDO_INPUT:  { label: 'Aguardando Input',    color: 'text-orange-700 bg-orange-50',   dot: 'bg-orange-500' },
  PAUSADA:           { label: 'Pausada',             color: 'text-gray-600 bg-gray-50',       dot: 'bg-gray-400' },
};

function AnneMonitorPanel({
  anneEnabled,
  onAnneToggle,
  onClose,
}: {
  anneEnabled: boolean;
  onAnneToggle: (v: boolean) => void;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['anne-log-stats'],
    queryFn: async () => {
      const res = await api.get<{ stats: { gatilhos_24h: number; executados_24h: number; escalados_24h: number; taxa_automacao: string } }>(
        '/api/v2/anne/log?dias=1'
      );
      return res.data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const stats = data?.stats;
  const anneStatus: AnneStatus = anneEnabled ? 'ATIVA' : 'PAUSADA';
  const statusConfig = ANNE_STATUS_CONFIG[anneStatus];

  return (
    <div className="p-3 space-y-3">
      {/* Status badge */}
      <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg', statusConfig.color)}>
        <span className={cn('w-2 h-2 rounded-full shrink-0', statusConfig.dot)} />
        <span className="text-xs font-semibold">{statusConfig.label}</span>
        <span className="ml-auto text-[11px] opacity-70">nesta conversa</span>
      </div>

      {/* Toggle */}
      <div className="flex items-center justify-between px-1">
        <div>
          <p className="text-xs font-medium text-txt-primary">Anne nesta conversa</p>
          <p className="text-[11px] text-txt-muted">Desativar não afeta outras conversas</p>
        </div>
        <button
          onClick={() => onAnneToggle(!anneEnabled)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
            anneEnabled
              ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          )}
        >
          {anneEnabled ? <Power size={12} /> : <PowerOff size={12} />}
          {anneEnabled ? 'Ativa' : 'Pausada'}
        </button>
      </div>

      {/* Stats 24h */}
      <div>
        <p className="text-[10px] font-semibold text-txt-muted uppercase tracking-wider mb-2">
          Últimas 24h
        </p>
        {isLoading ? (
          <div className="flex justify-center py-3">
            <Loader2 size={14} className="animate-spin text-txt-muted" />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Gatilhos', value: stats?.gatilhos_24h ?? '—' },
              { label: 'Executados', value: stats?.executados_24h ?? '—' },
              { label: 'Escalados', value: stats?.escalados_24h ?? '—' },
              { label: 'Taxa Auto.', value: stats?.taxa_automacao ?? '—' },
            ].map(item => (
              <div key={item.label} className="bg-surface-50 rounded-lg p-2 border border-surface-200">
                <p className="text-[10px] text-txt-muted">{item.label}</p>
                <p className="text-sm font-bold text-txt-primary">{String(item.value)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <button
        onClick={onClose}
        className="w-full py-1.5 text-xs text-txt-secondary border border-surface-200 rounded-lg hover:bg-surface-50 transition-colors"
      >
        Fechar
      </button>
    </div>
  );
}

/* ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   COMPONENTE PRINCIPAL — CentralToolbar
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */

export function CentralToolbar({ anneEnabled, onAnneToggle, onOpenCampaign }: CentralToolbarProps) {
  const [activeTool, setActiveTool] = useState<ActiveTool>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Atalhos de teclado F1–F4
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tool = SHORTCUTS[e.key];
      if (!tool) return;
      e.preventDefault();
      if (tool === 'campaign') {
        onOpenCampaign();
        return;
      }
      setActiveTool(prev => (prev === tool ? null : tool));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpenCampaign]);

  // Fechar ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setActiveTool(null);
      }
    };
    if (activeTool) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [activeTool]);

  const toggle = useCallback((tool: ActiveTool) => {
    if (tool === 'campaign') {
      onOpenCampaign();
      return;
    }
    setActiveTool(prev => (prev === tool ? null : tool));
  }, [onOpenCampaign]);

  // Badge de gatilhos 24h para o ícone da Anne
  const { data: anneBadge } = useQuery({
    queryKey: ['anne-badge'],
    queryFn: async () => {
      const res = await api.get<{ stats: { gatilhos_24h: number } }>('/api/v2/anne/log?dias=1');
      return res.data?.stats?.gatilhos_24h ?? 0;
    },
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  const tools = [
    {
      id: 'search' as ActiveTool,
      icon: Search,
      label: 'Busca',
      shortcut: 'F1',
      badge: null,
    },
    {
      id: 'templates' as ActiveTool,
      icon: MessageSquarePlus,
      label: 'Templates',
      shortcut: 'F2',
      badge: null,
    },
    {
      id: 'campaign' as ActiveTool,
      icon: Megaphone,
      label: 'Campanha',
      shortcut: 'F3',
      badge: null,
    },
    {
      id: 'anne-monitor' as ActiveTool,
      icon: Brain,
      label: 'Anne',
      shortcut: 'F4',
      badge: anneBadge && anneBadge > 0 ? anneBadge : null,
    },
  ];

  return (
    <div ref={panelRef} className="relative">
      {/* ── Barra de ferramentas ── */}
      <div className="flex items-center gap-0.5 px-2 py-2 bg-white border-b border-surface-200">
        {tools.map(tool => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <button
              key={tool.id}
              onClick={() => toggle(tool.id)}
              title={`${tool.label} (${tool.shortcut})`}
              className={cn(
                'relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all',
                isActive
                  ? 'bg-crm-primary text-white'
                  : 'text-txt-secondary hover:bg-surface-100',
                tool.id === 'anne-monitor' && anneEnabled && !isActive
                  ? 'text-emerald-600'
                  : ''
              )}
            >
              <Icon size={13} />
              <span className="hidden sm:inline">{tool.label}</span>
              <span className={cn(
                'hidden text-[9px] opacity-60 font-mono',
                'lg:inline'
              )}>
                {tool.shortcut}
              </span>

              {/* Badge de gatilhos */}
              {tool.badge !== null && (
                <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center">
                  {tool.badge}
                </span>
              )}

              {/* Dot de status Anne */}
              {tool.id === 'anne-monitor' && (
                <span className={cn(
                  'absolute bottom-0.5 right-0.5 w-1.5 h-1.5 rounded-full',
                  anneEnabled ? 'bg-emerald-500' : 'bg-gray-400',
                  !isActive ? 'block' : 'hidden'
                )} />
              )}
            </button>
          );
        })}

        {/* Indicador de status Anne (inline, à direita) */}
        <div className="ml-auto flex items-center gap-1.5 text-[11px] text-txt-muted">
          <Activity size={10} className={cn(anneEnabled ? 'text-emerald-500' : 'text-gray-400')} />
          <span className={cn(anneEnabled ? 'text-emerald-600' : 'text-gray-400')}>
            {anneEnabled ? 'Anne ativa' : 'Anne pausada'}
          </span>
        </div>
      </div>

      {/* ── Painel flutuante ── */}
      {activeTool && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-surface-200 shadow-xl rounded-b-xl overflow-hidden">
          {/* Header do painel */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-surface-200 bg-surface-50">
            <div className="flex items-center gap-1.5">
              {activeTool === 'search' && <Search size={13} className="text-crm-primary" />}
              {activeTool === 'templates' && <MessageSquarePlus size={13} className="text-crm-primary" />}
              {activeTool === 'anne-monitor' && <Brain size={13} className="text-crm-primary" />}
              <span className="text-xs font-semibold text-txt-primary">
                {activeTool === 'search' && 'Busca Avançada'}
                {activeTool === 'templates' && 'Novo Template Composto'}
                {activeTool === 'anne-monitor' && 'Monitor da Anne'}
              </span>
            </div>
            <button
              onClick={() => setActiveTool(null)}
              className="p-1 rounded text-txt-muted hover:bg-surface-200 transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          {/* Conteúdo */}
          {activeTool === 'search' && (
            <SearchPanel onClose={() => setActiveTool(null)} />
          )}
          {activeTool === 'templates' && (
            <TemplatesPanel onClose={() => setActiveTool(null)} />
          )}
          {activeTool === 'anne-monitor' && (
            <AnneMonitorPanel
              anneEnabled={anneEnabled}
              onAnneToggle={onAnneToggle}
              onClose={() => setActiveTool(null)}
            />
          )}
        </div>
      )}
    </div>
  );
}
