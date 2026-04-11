'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface FunilMetrica {
  label: string
  valor: number | string
  variacao?: number   // percentual vs período anterior
  prefixo?: string    // 'R$' etc
  sufixo?: string     // '%' etc
}

interface FunilEtapa {
  nome: string
  valor: number
  variacao?: number
  metricaEsquerda?: FunilMetrica
  metricaDireita?: FunilMetrica
}

interface FunilConversaoProps {
  totalGasto: number
  variacaoGasto?: number
  etapas: FunilEtapa[]
  totalVendas?: number
  roas?: number
}

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function formatarValor(valor: number): string {
  if (valor >= 1_000_000) return `${(valor / 1_000_000).toFixed(1)}M`
  if (valor >= 1_000) return valor.toLocaleString('pt-BR')
  return valor.toString()
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/* ─── Subcomponentes ─────────────────────────────────────────────────────── */

function Variacao({ valor, small }: { valor: number; small?: boolean }) {
  const positivo = valor >= 0
  return (
    <div
      className={[
        'flex items-center justify-center gap-0.5',
        small ? 'text-[9px]' : 'text-xs',
        positivo ? 'text-green-400' : 'text-red-400',
      ].join(' ')}
    >
      {positivo
        ? <TrendingUp size={small ? 8 : 10} />
        : <TrendingDown size={small ? 8 : 10} />
      }
      <span>{positivo ? '+' : ''}{valor.toFixed(1)}%</span>
    </div>
  )
}

function CardMetrica({ metrica }: { metrica: FunilMetrica }) {
  const valorFormatado =
    typeof metrica.valor === 'number'
      ? metrica.valor.toLocaleString('pt-BR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 2,
        })
      : metrica.valor

  return (
    <div className="bg-[#1e3a5f] rounded-lg px-2 py-1.5 text-center">
      <p className="text-[9px] text-blue-300 uppercase tracking-wider truncate">
        {metrica.label}
      </p>
      <p className="text-sm font-bold text-white">
        {metrica.prefixo}{valorFormatado}{metrica.sufixo}
      </p>
      {metrica.variacao !== undefined && (
        <Variacao valor={metrica.variacao} small />
      )}
    </div>
  )
}

/* ─── Componente principal ───────────────────────────────────────────────── */

/**
 * FunilConversao
 *
 * Gráfico funil de conversão da jornada Impressão → Compra,
 * com métricas laterais (CPM, CTR, CPC, CPL, CAC, ROAS, etc).
 *
 * Paleta dark VEXX: #0d1117 / #161b24 / #1c2333 / #1e3a5f
 *
 * Uso:
 * ```tsx
 * import { FunilConversao } from '@/components/trafego/FunilConversao'
 *
 * <FunilConversao
 *   totalGasto={506181.88}
 *   variacaoGasto={823.6}
 *   etapas={[
 *     { nome: 'Impressões', valor: 39704047, metricaEsquerda: { label: 'CPM', valor: 12.75, prefixo: 'R$ ' } },
 *     { nome: 'Cliques',    valor: 182654,   metricaDireita:  { label: 'CTR', valor: 0.46,  sufixo: '%' } },
 *     // ...
 *   ]}
 *   totalVendas={1219762.10}
 *   roas={2.41}
 * />
 * ```
 */
export function FunilConversao({
  totalGasto,
  variacaoGasto,
  etapas,
  totalVendas,
  roas,
}: FunilConversaoProps) {
  const maxValor = useMemo(
    () => Math.max(...etapas.map((e) => e.valor)),
    [etapas]
  )

  /* Largura visual de cada etapa: 30% (mínimo) a 100% */
  const larguras = useMemo(
    () => etapas.map((e) => 30 + (e.valor / maxValor) * 70),
    [etapas, maxValor]
  )

  return (
    <div className="bg-[#161b24] rounded-2xl p-6 w-full max-w-3xl mx-auto">

      {/* ─── Header: Total Gasto ─── */}
      <div className="text-center mb-6">
        <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">
          Total Gasto
        </p>
        <p className="text-3xl font-bold text-white">
          {formatarMoeda(totalGasto)}
        </p>
        {variacaoGasto !== undefined && (
          <Variacao valor={variacaoGasto} />
        )}
      </div>

      {/* ─── Funil ─── */}
      <div className="flex flex-col items-center gap-1">
        {etapas.map((etapa, i) => {
          const larguraAtual  = larguras[i]
          const larguraProx   = larguras[i + 1] ?? larguraAtual

          /*
           * clipPath cria o efeito de trapézio afunilando para a próxima etapa.
           * Os valores são expressos como % do próprio elemento (larguraAtual%).
           * A diferença entre etapas determina o quanto as bordas inferiores recuam.
           */
          const inset = (larguraAtual - larguraProx) / 2
          const clipPathValue =
            i < etapas.length - 1
              ? `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`
              : 'none'

          return (
            <div key={etapa.nome} className="w-full flex items-center gap-3">

              {/* Métrica esquerda */}
              <div className="w-28 flex-shrink-0">
                {etapa.metricaEsquerda && (
                  <CardMetrica metrica={etapa.metricaEsquerda} />
                )}
              </div>

              {/* Barra do funil */}
              <div className="flex-1 flex flex-col items-center">
                <div
                  className="flex flex-col items-center justify-center py-3 transition-all duration-500"
                  style={{
                    width: `${larguraAtual}%`,
                    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                    clipPath: clipPathValue,
                    borderRadius: i === etapas.length - 1 ? '4px' : undefined,
                  }}
                >
                  <span className="text-[10px] text-blue-200 uppercase tracking-wider">
                    {etapa.nome}
                  </span>
                  <span className="text-lg font-bold text-white">
                    {formatarValor(etapa.valor)}
                  </span>
                  {etapa.variacao !== undefined && (
                    <Variacao valor={etapa.variacao} small />
                  )}
                </div>
              </div>

              {/* Métrica direita */}
              <div className="w-28 flex-shrink-0">
                {etapa.metricaDireita && (
                  <CardMetrica metrica={etapa.metricaDireita} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Footer: Total de Vendas + ROAS ─── */}
      {(totalVendas !== undefined || roas !== undefined) && (
        <div className="flex justify-center gap-4 mt-6">
          {totalVendas !== undefined && (
            <div className="bg-[#1c2333] rounded-xl px-4 py-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                Total de Vendas
              </p>
              <p className="text-lg font-bold text-green-400">
                {formatarMoeda(totalVendas)}
              </p>
            </div>
          )}
          {roas !== undefined && (
            <div className="bg-[#1c2333] rounded-xl px-4 py-2 text-center">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider">
                ROAS
              </p>
              <p className="text-lg font-bold text-blue-400">
                {roas.toFixed(2)}x
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
