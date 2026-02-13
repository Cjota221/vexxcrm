'use client';

import { useState, useCallback } from 'react';
import { FileDropzone } from '@/components/import/FileDropzone';
import { ColumnMapper } from '@/components/import/ColumnMapper';
import { ImportProgress } from '@/components/import/ImportProgress';
import { ImportResults } from '@/components/import/ImportResults';
import {
  Upload,
  Columns3,
  Play,
  CheckCircle,
  ArrowLeft,
  ArrowRight,
  AlertCircle,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';

/* ───────── Types ───────── */

interface PreviewData {
  columns: string[];
  sample: Record<string, unknown>[];
  suggestedMapping: Record<string, string>;
  totalRows: number;
  fileName: string;
  fileSize: number;
}

interface ImportStats {
  total: number;
  merged: number;
  created: number;
  enriched: number;
  skipped: number;
  errors: number;
}

interface ImportDetail {
  row: number;
  name?: string;
  phone?: string;
  action: 'created' | 'merged' | 'enriched' | 'skipped' | 'error';
  reason?: string;
}

/* ───────── Steps ───────── */

type Step = 'upload' | 'mapping' | 'processing' | 'results';

const STEPS: { key: Step; label: string; icon: typeof Upload }[] = [
  { key: 'upload', label: 'Upload', icon: Upload },
  { key: 'mapping', label: 'Mapeamento', icon: Columns3 },
  { key: 'processing', label: 'Processar', icon: Play },
  { key: 'results', label: 'Resultado', icon: CheckCircle },
];

/* ───────── Page ───────── */

export default function ImportacaoPage() {
  const { accessToken } = useAuthStore();

  // Wizard state
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Processing
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');

  // Results
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [details, setDetails] = useState<ImportDetail[]>([]);

  const token = accessToken;

  /* ─── Step 1: Upload + Preview ─── */
  const handleFileSelected = useCallback(
    async (selectedFile: File) => {
      setFile(selectedFile);
      setError(null);
      setIsLoading(true);

      try {
        const formData = new FormData();
        formData.append('file', selectedFile);

        const res = await fetch('/api/import/preview', {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        });

        if (!res.ok) {
          const errBody = await res.json().catch(() => ({}));
          throw new Error(errBody.error || `Erro ${res.status}`);
        }

        const data = await res.json();
        setPreview(data);
        setMapping(data.suggestedMapping || {});
        setStep('mapping');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Erro ao processar arquivo';
        setError(msg);
      } finally {
        setIsLoading(false);
      }
    },
    [token]
  );

  /* ─── Step 3: Process Import ─── */
  const handleProcess = useCallback(async () => {
    if (!file || !preview) return;

    const mappedFields = Object.values(mapping).filter((v) => v !== '');
    if (mappedFields.length === 0) {
      setError('Mapeie pelo menos uma coluna antes de processar.');
      return;
    }

    setError(null);
    setStep('processing');
    setProgress(0);
    setStatusMessage('Enviando arquivo para processamento...');

    try {
      // Simular progresso durante upload
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 85) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + Math.random() * 8;
        });
      }, 500);

      setStatusMessage('Processando deduplicação e mesclagem...');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('mapping', JSON.stringify(mapping));

      const res = await fetch('/api/import/process', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });

      clearInterval(progressInterval);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Erro ${res.status}`);
      }

      const data = await res.json();

      setProgress(100);
      setStatusMessage('Concluído!');

      // Aguarda um instante antes de exibir resultados
      await new Promise((r) => setTimeout(r, 600));

      setStats(data.stats);
      setDetails(data.details || []);
      setStep('results');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar importação';
      setError(msg);
      setStep('mapping'); // volta ao mapeamento
    }
  }, [file, preview, mapping, token]);

  /* ─── Reset ─── */
  const handleReset = useCallback(() => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setMapping({});
    setProgress(0);
    setStatusMessage('');
    setStats(null);
    setDetails([]);
    setError(null);
  }, []);

  /* ─── Navigation helpers ─── */
  const canGoNext =
    (step === 'upload' && preview !== null) ||
    (step === 'mapping' && Object.values(mapping).some((v) => v !== ''));

  const stepIndex = STEPS.findIndex((s) => s.key === step);

  /* ─── Render ─── */
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold text-txt-primary">Importação de Dados</h1>
        <p className="text-sm text-txt-muted mt-1">
          Importe clientes de planilhas externas. O sistema deduplica por CPF e telefone automaticamente.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 p-1 bg-slate-50 rounded-xl">
        {STEPS.map((s, idx) => {
          const isActive = s.key === step;
          const isCompleted = idx < stepIndex;
          const Icon = s.icon;

          return (
            <div
              key={s.key}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs font-medium transition-all ${
                isActive
                  ? 'bg-white shadow-sm text-crm-primary'
                  : isCompleted
                  ? 'text-green-600'
                  : 'text-txt-muted'
              }`}
            >
              {isCompleted ? (
                <CheckCircle size={14} className="text-green-500" />
              ) : (
                <Icon size={14} />
              )}
              <span className="hidden sm:inline">{s.label}</span>
            </div>
          );
        })}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Content */}
      <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
        {step === 'upload' && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-txt-primary">
              1. Selecione o arquivo
            </h2>
            <FileDropzone onFileSelected={handleFileSelected} isLoading={isLoading} />

            {isLoading && (
              <div className="text-center text-xs text-txt-muted animate-pulse">
                Analisando arquivo...
              </div>
            )}

            {/* Info cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="p-3 bg-blue-50 rounded-xl">
                <p className="text-[11px] font-semibold text-blue-700">CPF (Prioridade 1)</p>
                <p className="text-[10px] text-blue-600 mt-0.5">
                  Deduplica clientes pelo CPF primeiro
                </p>
              </div>
              <div className="p-3 bg-green-50 rounded-xl">
                <p className="text-[11px] font-semibold text-green-700">Telefone (Prioridade 2)</p>
                <p className="text-[10px] text-green-600 mt-0.5">
                  Normaliza e compara telefones
                </p>
              </div>
              <div className="p-3 bg-amber-50 rounded-xl">
                <p className="text-[11px] font-semibold text-amber-700">Enriquecimento</p>
                <p className="text-[10px] text-amber-600 mt-0.5">
                  Preenche campos vazios automaticamente
                </p>
              </div>
            </div>
          </div>
        )}

        {step === 'mapping' && preview && (
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-txt-primary">
              2. Mapeie as colunas
            </h2>
            <p className="text-xs text-txt-muted">
              Relacione cada coluna do seu arquivo com o campo correspondente no CRM.
              O sistema já sugeriu mapeamentos automáticos (indicados com ✨).
            </p>

            <ColumnMapper
              preview={preview}
              mapping={mapping}
              onMappingChange={setMapping}
            />
          </div>
        )}

        {step === 'processing' && (
          <ImportProgress
            progress={progress}
            statusMessage={statusMessage}
            isProcessing={true}
          />
        )}

        {step === 'results' && stats && (
          <ImportResults stats={stats} details={details} onReset={handleReset} />
        )}
      </div>

      {/* Navigation buttons */}
      {(step === 'upload' || step === 'mapping') && (
        <div className="flex items-center justify-between">
          <div>
            {step === 'mapping' && (
              <button
                onClick={() => {
                  setStep('upload');
                  setPreview(null);
                  setFile(null);
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-txt-primary hover:bg-slate-50 transition-colors"
              >
                <ArrowLeft size={14} />
                Voltar
              </button>
            )}
          </div>

          <div>
            {step === 'mapping' && (
              <button
                onClick={handleProcess}
                disabled={!canGoNext}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-crm-primary text-white text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Processar Importação
                <ArrowRight size={14} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
