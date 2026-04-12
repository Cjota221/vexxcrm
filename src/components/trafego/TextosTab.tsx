'use client';

import { useState } from 'react';
import { Copy } from 'lucide-react';

// Copies padrão CJ Rasteirinhas
const COPIES_PADRAO = [
  {
    campanha: 'Atacado',
    titulo: 'Direto da fábrica pra você revender',
    texto: 'Rasteirinhas de R$25 a R$49,90 — mínimo 5 pares\nSortido à sua escolha | Parcele em 12x | Entrega Brasil',
    cta: 'Quero comprar no atacado',
  },
  {
    campanha: 'C4 Franquias',
    titulo: 'Seu site de moda pronto hoje',
    texto: 'Com a C4 você tem site + produtos + suporte.\nSem estoque. Sem complicação.',
    cta: 'Quero ser franqueada',
  },
  {
    campanha: 'Remarketing',
    titulo: 'Ainda pensando? A fábrica tá esperando 👡',
    texto: 'Mais de 500 revendedoras já compram com a CJ.\nRasteirinhas que vendem — a partir de 5 pares.',
    cta: 'Falar com a equipe',
  },
];

export function TextosTab({ copies }: { copies: Array<{ headline: string; texto_principal: string; cta: string; justificativa?: string; id: string }> }) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyText(id: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-gray-900">Textos para Anúncios</h2>
        <a href="/time-ia" className="text-sm text-crm-primary hover:underline">
          Pedir novo ao Jarvis →
        </a>
      </div>

      {/* Copies gerados pelo Cláudio */}
      {copies.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Do Jarvis (aguardando uso)</h3>
          {copies.map((copy) => (
            <div key={copy.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="font-semibold text-gray-900">{copy.headline}</div>
              <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">{copy.texto_principal}</div>
              <div className="text-xs text-gray-400 mt-1">Botão: {copy.cta}</div>
              {copy.justificativa && (
                <div className="mt-2 text-xs text-crm-primary bg-blue-50 rounded-lg px-3 py-2">
                  💡 {copy.justificativa}
                </div>
              )}
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => copyText(copy.id, `${copy.headline}\n\n${copy.texto_principal}\n\n${copy.cta}`)}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                >
                  <Copy size={12} />
                  {copied === copy.id ? 'Copiado!' : 'Copiar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Copies padrão da CJ */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Textos padrão CJ Rasteirinhas</h3>
        {COPIES_PADRAO.map((copy) => (
          <div key={copy.campanha} className="bg-white rounded-2xl border border-gray-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                {copy.campanha}
              </span>
            </div>
            <div className="font-semibold text-gray-900">{copy.titulo}</div>
            <div className="text-sm text-gray-600 mt-1 whitespace-pre-line">{copy.texto}</div>
            <div className="text-xs text-gray-400 mt-1">Botão: {copy.cta}</div>
            <button
              onClick={() => copyText(`padrao-${copy.campanha}`, `${copy.titulo}\n\n${copy.texto}\n\n${copy.cta}`)}
              className="flex items-center gap-1.5 text-xs mt-3 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              <Copy size={12} />
              {copied === `padrao-${copy.campanha}` ? 'Copiado!' : 'Copiar texto'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
