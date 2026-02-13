'use client';

import { useMemo } from 'react';
import { ArrowRight, Sparkles, X } from 'lucide-react';

/**
 * Campos do CRM disponíveis para mapeamento
 */
const CRM_FIELDS = [
  { value: '', label: '— Ignorar coluna —' },
  { value: 'name', label: 'Nome' },
  { value: 'phone', label: 'Telefone' },
  { value: 'email', label: 'E-mail' },
  { value: 'cpf', label: 'CPF' },
  { value: 'birthday', label: 'Data de Nascimento' },
  { value: 'address_street', label: 'Rua' },
  { value: 'address_number', label: 'Número' },
  { value: 'address_complement', label: 'Complemento' },
  { value: 'address_neighborhood', label: 'Bairro' },
  { value: 'address_city', label: 'Cidade' },
  { value: 'address_state', label: 'Estado' },
  { value: 'address_zip', label: 'CEP' },
  { value: 'ltv', label: 'LTV (Valor Total Gasto)' },
  { value: 'total_pedidos', label: 'Total de Pedidos' },
  { value: 'tags', label: 'Tags' },
  { value: 'notes', label: 'Observações / Notas' },
  { value: 'source', label: 'Origem' },
];

interface PreviewData {
  columns: string[];
  sample: Record<string, unknown>[];
  suggestedMapping: Record<string, string>;
  totalRows: number;
  fileName: string;
  fileSize: number;
}

interface ColumnMapperProps {
  preview: PreviewData;
  mapping: Record<string, string>;
  onMappingChange: (mapping: Record<string, string>) => void;
}

/**
 * Componente de mapeamento visual de colunas do arquivo → campos do CRM.
 * Mostra preview dos dados e permite confirmar/ajustar mapeamento sugerido.
 */
export function ColumnMapper({ preview, mapping, onMappingChange }: ColumnMapperProps) {
  const { columns, sample, suggestedMapping } = preview;

  // Campos já mapeados (para evitar duplicatas)
  const usedFields = useMemo(() => {
    const used = new Set<string>();
    Object.values(mapping).forEach((v) => {
      if (v) used.add(v);
    });
    return used;
  }, [mapping]);

  // Quantidade de colunas mapeadas
  const mappedCount = useMemo(
    () => Object.values(mapping).filter((v) => v && v !== '').length,
    [mapping]
  );

  const handleFieldChange = (column: string, crmField: string) => {
    onMappingChange({ ...mapping, [column]: crmField });
  };

  const clearMapping = (column: string) => {
    onMappingChange({ ...mapping, [column]: '' });
  };

  const autoSuggested = (column: string) => {
    return suggestedMapping[column] && suggestedMapping[column] === mapping[column];
  };

  return (
    <div className="space-y-5">
      {/* Info bar */}
      <div className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-xl">
        <p className="text-xs text-blue-700">
          <strong>{preview.totalRows}</strong> linhas encontradas em <strong>{preview.fileName}</strong>.
          {' '}{mappedCount} de {columns.length} colunas mapeadas.
        </p>
        {mappedCount > 0 && (
          <span className="text-xs font-semibold text-blue-600 bg-blue-100 px-2 py-1 rounded-lg">
            {mappedCount} mapeadas
          </span>
        )}
      </div>

      {/* Mapping rows */}
      <div className="space-y-2">
        {columns.map((col) => {
          const sampleValues = sample
            .map((row) => {
              const v = row[col];
              return v != null && v !== '' ? String(v) : null;
            })
            .filter(Boolean)
            .slice(0, 3);

          const isMapped = mapping[col] && mapping[col] !== '';

          return (
            <div
              key={col}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${
                isMapped
                  ? 'bg-green-50 border-green-200'
                  : 'bg-white border-slate-100 hover:border-slate-200'
              }`}
            >
              {/* Coluna do arquivo */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-medium text-txt-primary truncate">{col}</p>
                  {autoSuggested(col) && (
                    <Sparkles size={12} className="text-amber-500" />
                  )}
                </div>
                {sampleValues.length > 0 && (
                  <p className="text-[11px] text-txt-muted truncate mt-0.5">
                    Ex: {sampleValues.join(' | ')}
                  </p>
                )}
              </div>

              {/* Arrow */}
              <ArrowRight size={16} className="text-slate-300 shrink-0" />

              {/* Select CRM field */}
              <div className="flex items-center gap-1.5 flex-1">
                <select
                  value={mapping[col] || ''}
                  onChange={(e) => handleFieldChange(col, e.target.value)}
                  className={`flex-1 text-sm px-3 py-2 rounded-lg border transition-colors outline-none ${
                    isMapped
                      ? 'border-green-300 bg-white text-green-700'
                      : 'border-slate-200 bg-white text-txt-primary'
                  }`}
                >
                  {CRM_FIELDS.map((f) => (
                    <option
                      key={f.value}
                      value={f.value}
                      disabled={f.value !== '' && f.value !== mapping[col] && usedFields.has(f.value)}
                    >
                      {f.label}
                      {f.value !== '' && f.value !== mapping[col] && usedFields.has(f.value) ? ' (já usado)' : ''}
                    </option>
                  ))}
                </select>

                {isMapped && (
                  <button
                    onClick={() => clearMapping(col)}
                    className="p-1 rounded-md hover:bg-red-100 transition-colors"
                    title="Remover mapeamento"
                  >
                    <X size={14} className="text-red-400" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Warnings */}
      {!Object.values(mapping).includes('phone') && !Object.values(mapping).includes('cpf') && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-700">
            ⚠️ Nenhuma coluna mapeada para <strong>Telefone</strong> ou <strong>CPF</strong>.
            Sem esses campos, não será possível fazer a deduplicação com clientes existentes.
          </p>
        </div>
      )}
    </div>
  );
}
