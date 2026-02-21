'use client';

/**
 * VariablePicker — Seletor de variáveis de template
 *
 * Exibe botões clicáveis para cada variável disponível.
 * Ao clicar, insere a variável na posição atual do cursor
 * dentro do textarea referenciado.
 *
 * Uso:
 *   const textareaRef = useRef<HTMLTextAreaElement>(null);
 *   const [text, setText] = useState('');
 *
 *   <textarea ref={textareaRef} value={text} onChange={e => setText(e.target.value)} />
 *   <VariablePicker textareaRef={textareaRef} value={text} onChange={setText} />
 */

import { RefObject } from 'react';
import { Braces } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TemplateVariable {
  /** Identificador usado no template, ex: "nome" → insere {nome} */
  key: string;
  /** Rótulo exibido no botão */
  label: string;
  /** Descrição curta (tooltip / hint) */
  description: string;
}

/** Variáveis básicas disponíveis em todos os contextos */
export const BASIC_VARIABLES: TemplateVariable[] = [
  { key: 'nome',      label: 'Nome',       description: 'Primeiro nome do cliente' },
  { key: 'nome_completo', label: 'Nome completo', description: 'Nome completo do cliente' },
  { key: 'link',      label: 'Link',        description: 'Link personalizado ou da loja' },
];

/** Variáveis estendidas para campanhas / disparos em massa */
export const CAMPAIGN_VARIABLES: TemplateVariable[] = [
  ...BASIC_VARIABLES,
  { key: 'pedido',    label: 'Nº Pedido',  description: 'Número do último pedido' },
  { key: 'total',     label: 'Total',      description: 'Valor total do último pedido' },
  { key: 'data_pedido', label: 'Data pedido', description: 'Data do último pedido' },
  { key: 'rastreio',  label: 'Rastreio',   description: 'Código de rastreamento' },
  { key: 'telefone',  label: 'Telefone',   description: 'Telefone do cliente' },
];

interface VariablePickerProps {
  /** Ref do textarea onde a variável será inserida */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  /** Valor atual do textarea (controlled) */
  value: string;
  /** Setter do valor (controlled) */
  onChange: (value: string) => void;
  /** Conjunto de variáveis a exibir — padrão: BASIC_VARIABLES */
  variables?: TemplateVariable[];
  /** Classes CSS adicionais no container */
  className?: string;
}

export function VariablePicker({
  textareaRef,
  value,
  onChange,
  variables = BASIC_VARIABLES,
  className,
}: VariablePickerProps) {
  const insertVariable = (key: string) => {
    const token = `{${key}}`;
    const el = textareaRef.current;

    if (el) {
      const start = el.selectionStart ?? value.length;
      const end   = el.selectionEnd   ?? value.length;
      const newValue = value.slice(0, start) + token + value.slice(end);
      onChange(newValue);

      // Reposicionar cursor após o token inserido
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      // Sem ref disponível — adiciona ao final
      onChange(value + token);
    }
  };

  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)}>
      <div className="flex items-center gap-1 mr-0.5">
        <Braces size={11} className="text-gray-400" />
        <span className="text-[10px] text-gray-400 font-medium">Inserir variável:</span>
      </div>
      {variables.map((v) => (
        <button
          key={v.key}
          type="button"
          title={v.description}
          onClick={() => insertVariable(v.key)}
          className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5',
            'text-[11px] font-mono font-medium',
            'rounded-md border border-dashed',
            'border-crm-primary/40 text-crm-primary bg-crm-primary/5',
            'hover:bg-crm-primary/10 hover:border-crm-primary',
            'active:scale-95 transition-all duration-100',
          )}
        >
          {`{${v.key}}`}
        </button>
      ))}
    </div>
  );
}
