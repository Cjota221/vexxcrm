'use client';

import { useState } from 'react';
import { Users, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface ResultadoPublicos {
  ok: boolean;
  publicos: {
    engajamento: { id?: string; status: string };
    visitantes:  { id?: string; status: string };
    lookalike:   { id?: string; status: string };
  };
  mensagem: string;
}

export function InicializadorPublicos() {
  const [loading, setLoading]     = useState(false);
  const [resultado, setResultado] = useState<ResultadoPublicos | null>(null);

  async function inicializar() {
    setLoading(true);
    try {
      const res = await fetch('/api/meta/publicos/inicializar', { method: 'POST' });
      const data = await res.json() as ResultadoPublicos;
      setResultado(data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 pt-6 border-t border-gray-100">
      <h3 className="font-semibold text-gray-900 text-sm mb-1">
        Públicos de alta performance
      </h3>
      <p className="text-xs text-gray-500 mb-4">
        Cria automaticamente os públicos de engajamento, visitantes do site e
        Lookalike dos seus clientes no Meta. Execute uma vez antes de rodar campanhas.
      </p>

      {resultado && (
        <div className="mb-4 space-y-2">
          {Object.entries(resultado.publicos).map(([tipo, pub]) => (
            <div key={tipo} className="flex items-center gap-2 text-sm">
              {pub.status === 'criado'
                ? <CheckCircle size={14} className="text-green-500" />
                : <AlertCircle size={14} className="text-red-400" />
              }
              <span className="capitalize text-gray-600">{tipo}:</span>
              <span className={pub.status === 'criado' ? 'text-green-600' : 'text-red-500'}>
                {pub.status === 'criado' ? `ID ${pub.id?.substring(0, 12)}...` : 'Erro ao criar'}
              </span>
            </div>
          ))}
          <p className="text-xs text-gray-400 mt-2">{resultado.mensagem}</p>
        </div>
      )}

      <button
        onClick={inicializar}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2.5 bg-[#1e3a5f] text-white text-sm font-medium rounded-xl hover:bg-[#16304f] disabled:opacity-50 transition-colors"
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> Criando públicos...</>
          : <><Users size={14} /> Inicializar públicos</>
        }
      </button>
    </div>
  );
}
