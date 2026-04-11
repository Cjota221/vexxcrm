'use client'

import { useMemo } from 'react'
import { TrendingUp, TrendingDown } from 'lucide-react'

/* ─── Tipos ──────────────────────────────────────────────────────────────── */

interface FunilMetrica {
  label: string
  valor: number | string
  variacao?: number
  prefixo?: string
  sufixo?: string
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
    <div className={[
      'flex items-center justify-center gap-0.5',
      small ? 'text-[9px]' : 'text-xs',
      positivo ? 'text-green-400' : 'text-red-400',
    ].join(' ')}>
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
    <div className="bg-[#1e3a5f] rounded-lg px-1.5 py-1 sm:px-2 sm:py-1.5 text-center min-w-0">
      <p className="text-[8px] sm:text-[9px] text-blue-300 uppercase tracking-wide truncate leading-tight">
        {metrica.label}
      </p>
      <p className="text-[11px] sm:text-sm font-bold text-white leading-tight mt-0.5 truncate">
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
 *     { nome: 'Impressões',  valor: 39704047, metricaEsquerda: { label: 'CPM', valor: 12.75, prefixo: 'R$ ' } },
 *     { nome: 'Cliques',     valor: 182654,   metricaDireita:  { label: 'CTR', valor: 0.46,  sufixo: '%'  } },
 *     { nome: 'Leads',       valor: 330,      metricaDireita:  { label: 'CPL', valor: 1533,  prefixo: 'R$ ' } },
 *     { nome: 'Compras',     valor: 756,      metricaEsquerda: { label: 'CAC', valor: 669,   prefixo: 'R$ ' } },
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
    () => Math.max(...etapas.map((e) => e.valor), 1),
    [etapas]
  )

  /* Largura visual: 35% (mínimo) a 100% */
  const larguras = useMemo(
    () => etapas.map((e) => 35 + (e.valor / maxValor) * 65),
    [etapas, maxValor]
  )

  return (
    <div className="bg-[#161b24] rounded-2xl p-4 sm:p-6 w-full mx-auto">

      {/* ─── Header: Total Gasto ─── */}
      <div className="text-center mb-5">
        <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">
          Total Gasto
        </p>
        <p className="text-2xl sm:text-3xl font-bold text-white">
          {formatarMoeda(totalGasto)}
        </p>
        {variacaoGasto !== undefined && <Variacao valor={variacaoGasto} />}
      </div>

      {/* ─── Funil ─── */}
      <div className="flex flex-col items-center gap-1">
        {etapas.map((etapa, i) => {
          const larguraAtual = larguras[i]
          const larguraProx  = larguras[i + 1] ?? larguraAtual

          /*
           * clipPath trapézio: fundo da barra afunila até a largura da próxima etapa.
           * Inset em % do elemento = diferença absoluta entre as larguras / 2,
           * porque ambas as larguras são % do mesmo flex-1.
           */
          const inset = (larguraAtual - larguraProx) / 2
          const clipPathValue =
            i < etapas.length - 1
              ? `polygon(0 0, 100% 0, ${100 - inset}% 100%, ${inset}% 100%)`
              : 'none'

          return (
            <div key={etapa.nome} className="w-full flex items-center gap-2">

              {/* Métrica esquerda — largura fixa responsiva */}
              <div className="w-14 sm:w-24 flex-shrink-0">
                {etapa.metricaEsquerda
                  ? <CardMetrica metrica={etapa.metricaEsquerda} />
                  : <div className="w-full" />
                }
              </div>

              {/* Barra do funil */}
              <div className="flex-1 min-w-0 flex flex-col items-center overflow-hidden">
                <div
                  className="flex flex-col items-center justify-center py-2.5 sm:py-3 transition-all duration-500"
                  style={{
                    width: `${larguraAtual}%`,
                    background: 'linear-gradient(135deg, #1e3a5f, #2563eb)',
                    clipPath: clipPathValue,
                    borderRadius: i === etapas.length - 1 ? '4px' : undefined,
                  }}
                >
                  <span className="text-[9px] sm:text-[10px] text-blue-200 uppercase tracking-wider px-2 text-center">
                    {etapa.nome}
                  </span>
                  <span className="text-sm sm:text-lg font-bold text-white">
                    {formatarValor(etapa.valor)}
                  </span>
                  {etapa.variacao !== undefined && (
                    <Variacao valor={etapa.variacao} small />
                  )}
                </div>
              </div>

              {/* Métrica direita — largura fixa responsiva */}
              <div className="w-14 sm:w-24 flex-shrink-0">
                {etapa.metricaDireita
                  ? <CardMetrica metrica={etapa.metricaDireita} />
                  : <div className="w-full" />
                }
              </div>
            </div>
          )
        })}
      </div>

      {/* ─── Footer: Total de Vendas + ROAS ─── */}
      {(totalVendas !== undefined || roas !== undefined) && (
        <div className="flex justify-center gap-3 mt-5">
          {totalVendas !== undefined && (
            <div className="bg-[#1c2333] rounded-xl px-3 py-2 text-center">
              <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider">
                Total de Vendas
              </p>
              <p className="text-base sm:text-lg font-bold text-green-400">
                {formatarMoeda(totalVendas)}
              </p>
            </div>
          )}
          {roas !== undefined && (
            <div className="bg-[#1c2333] rounded-xl px-3 py-2 text-center">
              <p className="text-[9px] sm:text-[10px] text-gray-400 uppercase tracking-wider">
                ROAS
              </p>
              <p className="text-base sm:text-lg font-bold text-blue-400">
                {roas.toFixed(2)}x
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
