'use client'

import React from 'react'
import { Sparkles, TrendingDown, ArrowUpRight, ShieldCheck } from 'lucide-react'

interface Props {
  cantonDeductionsTotal?: number | null
  totalTax?: number | null
  cantonCode?: string
}

export function LiveTaxCounter({
  cantonDeductionsTotal = 0,
  totalTax = null,
  cantonCode = 'ZH',
}: Props) {
  const deductions = Number(cantonDeductionsTotal || 0)
  // Average Swiss marginal tax rate ~22% for mid-incomes
  const estimatedSavings = Math.round(deductions * 0.22)

  const formattedDeductions = deductions.toLocaleString('de-CH')
  const formattedSavings = estimatedSavings.toLocaleString('de-CH')
  const formattedTax = totalTax !== null && totalTax !== undefined
    ? Math.round(Number(totalTax)).toLocaleString('de-CH')
    : null

  return (
    <div className="sticky top-2 z-30 mb-4 p-3 sm:p-4 rounded-2xl bg-slate-900/95 backdrop-blur-md text-white border border-slate-700/80 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-red-600/30 border border-red-500/40 text-red-400 flex items-center justify-center font-bold flex-shrink-0">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            Live-Abzugsrechner (Kanton {cantonCode})
          </div>
          <div className="text-xs sm:text-sm font-semibold text-slate-200">
            Ihre Abzüge bisher:{' '}
            <strong className="text-white font-mono text-sm sm:text-base">
              CHF {formattedDeductions}
            </strong>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-6 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800">
        <div className="text-left sm:text-right">
          <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400 flex items-center sm:justify-end gap-1">
            <TrendingDown className="h-3 w-3" /> Sie sparen ca.
          </div>
          <div className="text-base sm:text-lg font-black font-mono text-emerald-400">
            « ca. CHF {formattedSavings} »
          </div>
        </div>

        {formattedTax && (
          <div className="text-left sm:text-right border-l pl-3 sm:pl-6 border-slate-800">
            <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
              Geschätzte Steuer
            </div>
            <div className="text-xs sm:text-sm font-bold font-mono text-slate-300">
              « ca. CHF {formattedTax} »
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
