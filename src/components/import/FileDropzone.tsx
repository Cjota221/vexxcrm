'use client';

import { useCallback, useState } from 'react';
import { Upload, FileSpreadsheet, X, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onFileSelected: (file: File) => void;
  isLoading?: boolean;
  accept?: string;
}

const ACCEPTED_EXTENSIONS = ['.csv', '.xlsx', '.xls', '.xml'];
const MAX_SIZE_MB = 10;

/**
 * Zona de drag & drop para upload de arquivos de importação.
 */
export function FileDropzone({ onFileSelected, isLoading, accept }: FileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback((file: File): string | null => {
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() || '');
    if (!ACCEPTED_EXTENSIONS.includes(ext)) {
      return `Formato "${ext}" não suportado. Use CSV, XLSX ou XML.`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `Arquivo muito grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máximo: ${MAX_SIZE_MB}MB.`;
    }
    return null;
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        return;
      }
      setError(null);
      setSelectedFile(file);
      onFileSelected(file);
    },
    [validateFile, onFileSelected]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const clearFile = useCallback(() => {
    setSelectedFile(null);
    setError(null);
  }, []);

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer',
          isDragging
            ? 'border-crm-primary bg-crm-primary/5 scale-[1.02]'
            : 'border-slate-200 hover:border-crm-primary/50 hover:bg-slate-50',
          isLoading && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          type="file"
          accept={accept || ACCEPTED_EXTENSIONS.join(',')}
          onChange={handleInputChange}
          className="absolute inset-0 opacity-0 cursor-pointer"
          disabled={isLoading}
        />

        {selectedFile ? (
          <div className="flex items-center justify-center gap-3">
            <FileSpreadsheet size={32} className="text-green-500" />
            <div className="text-left">
              <p className="text-sm font-medium text-txt-primary">{selectedFile.name}</p>
              <p className="text-xs text-txt-muted">
                {(selectedFile.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                clearFile();
              }}
              className="ml-4 p-1 rounded-full hover:bg-slate-200 transition-colors"
            >
              <X size={16} className="text-txt-muted" />
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-crm-primary/10 flex items-center justify-center mx-auto">
              <Upload size={28} className="text-crm-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-txt-primary">
                Arraste um arquivo ou clique para selecionar
              </p>
              <p className="text-xs text-txt-muted mt-1">
                Formatos aceitos: CSV, XLSX, XLS, XML (até {MAX_SIZE_MB}MB)
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={16} className="text-red-500 shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}
    </div>
  );
}
