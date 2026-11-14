'use client'

import React, { useState, useEffect } from 'react'
import { Sparkles, ShieldCheck, HelpCircle, AlertCircle } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { api } from '@/lib/api'

interface Props {
  taxReturnId?: string
  cantonDeductionsTotal?: number | null
  federalDeductionsTotal?: number | null
  grossIncome?: number | null
  taxableIncome?: number | null
  taxableWealth?: number | null
  federalTax?: number | null
  cantonalTax?: number | null
  totalTax?: number | null
  vstRefund?: number | null
  cantonCode?: string
  savingsAnalysis?: {
    total_savings_chf?: number
    summary_text?: string
    disclaimer?: string
    canton_has_exact_multipliers?: boolean
    rough_estimate_notice?: string | null
  } | null
}

export function LiveTaxCounter({
  taxReturnId,
  cantonDeductionsTotal = 0,
  federalDeductionsTotal = 0,
  grossIncome = 0,
  taxableIncome = null,
  taxableWealth = null,
  federalTax = null,
  cantonalTax = null,
  totalTax = null,
  vstRefund = 0,
  cantonCode = 'ZH',
  savingsAnalysis = null,
}: Props) {
  const { isGerman } = useTranslation()
  const [dynamicTips, setDynamicTips] = useState<any[]>([])
  const [warnings, setWarnings] = useState<any[]>([])

  useEffect(() => {
    if (!taxReturnId) return
    api.taxReturns
      .getTaxTips(taxReturnId, isGerman ? 'de' : 'en')
      .then((data: any) => {
        if (Array.isArray(data?.tips)) {
          setDynamicTips(data.tips)
        }
        if (Array.isArray(data?.warnings)) {
          setWarnings(data.warnings)
        }
      })
      .catch(() => {})
  }, [taxReturnId, isGerman])

  const dedC = Number(cantonDeductionsTotal || 0)
  const dedF = Number(federalDeductionsTotal || dedC)
  const inc = Number(grossIncome || 0)
  const hasData = inc > 0 || dedC > 0 || totalTax !== null

  // Addendum 1 § 7: Never use a flat percentage — strictly use tax engine counterfactual difference
  const estSavings =
    savingsAnalysis && typeof savingsAnalysis.total_savings_chf === 'number'
      ? Math.max(0, Math.round(savingsAnalysis.total_savings_chf))
      : null

  const fmt = (n: number | null | undefined) =>
    n !== null && n !== undefined ? Math.round(Number(n)).toLocaleString('de-CH') : '–'

  return (
    <div className="space-y-4">
      {/* ── Zwischenstand Card (Redesign Reference) ────────────────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-[#1E7B52] shadow-sm">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#1E7B52] animate-pulse" />
            <h3 className="font-bold text-sm text-[#1E7B52] uppercase tracking-wide">
              {isGerman ? 'Zwischenstand' : 'Live Summary'}
            </h3>
          </div>
          <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-[#1E7B52] border border-emerald-200">
            {cantonCode} & {isGerman ? 'Bund' : 'Federal'}
          </span>
        </div>

        {!hasData ? (
          <p className="mt-4 text-xs text-slate-500 leading-relaxed">
            {isGerman
              ? 'Sobald dein Lohnausweis gelesen ist, siehst du hier live, wie viel Steuern du ungefähr bezahlst – und wie viel du mit jedem Abzug sparst.'
              : 'As soon as your documents are processed, you will see a live estimate of your taxes and how much you save with each deduction.'}
          </p>
        ) : (
          <div className="mt-4 space-y-3 text-xs">
            {/* Header info */}
            <div className="flex justify-end text-[11px] text-slate-400 font-mono">
              {isGerman ? 'Kanton / Bund' : 'Canton / Fed.'}
            </div>

            {inc > 0 && (
              <div className="flex justify-between items-center text-slate-600">
                <span>{isGerman ? 'Einkünfte' : 'Gross Income'}</span>
                <span className="font-mono font-bold text-slate-900">CHF {fmt(inc)}</span>
              </div>
            )}

            <div className="flex justify-between items-center text-slate-600">
              <span>{isGerman ? 'Abzüge' : 'Deductions'}</span>
              <span className="font-mono font-bold text-emerald-700">
                CHF {fmt(dedC)} / {fmt(dedF)}
              </span>
            </div>

            {taxableIncome !== null && (
              <div className="flex justify-between items-center pt-2 border-t border-slate-100 font-bold text-slate-900">
                <span>{isGerman ? 'Steuerbares Einkommen' : 'Taxable Income'}</span>
                <span className="font-mono">CHF {fmt(taxableIncome)}</span>
              </div>
            )}

            {taxableWealth !== null && (
              <div className="flex justify-between items-center text-slate-600">
                <span>{isGerman ? 'Steuerbares Vermögen' : 'Taxable Wealth'}</span>
                <span className="font-mono font-bold text-slate-900">CHF {fmt(taxableWealth)}</span>
              </div>
            )}

            {/* Tax totals */}
            <div className="pt-3 border-t border-slate-200/80 space-y-2">
              {federalTax !== null && (
                <div className="flex justify-between items-center text-slate-600 text-[11px]">
                  <span>{isGerman ? 'Direkte Bundessteuer' : 'Direct Federal Tax'}</span>
                  <span className="font-mono font-medium">CHF {fmt(federalTax)}</span>
                </div>
              )}

              {cantonalTax !== null && (
                <div className="flex justify-between items-center text-slate-600 text-[11px]">
                  <span>{isGerman ? 'Kanton + Gemeinde ca.' : 'Canton + Municipality approx.'}</span>
                  <span className="font-mono font-medium">CHF {fmt(cantonalTax)}</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-1">
                <span className="font-black text-slate-900 text-sm">
                  {isGerman ? 'Steuer ca.' : 'Est. Total Tax'}
                </span>
                <span className="font-mono font-black text-[#1E7B52] text-lg">
                  {totalTax !== null ? `CHF ${fmt(totalTax)}` : '–'}
                </span>
              </div>

              {estSavings !== null && estSavings > 0 && (
                <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-emerald-950 space-y-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold text-[11px]">
                      {isGerman ? 'Dank deinen Abzügen sparst du:' : 'Savings from deductions:'}
                    </span>
                    <span className="font-mono font-bold text-xs text-emerald-800 whitespace-nowrap">
                      ca. CHF {fmt(estSavings)}
                    </span>
                  </div>
                  <p className="text-[10px] text-emerald-900/80">
                    {isGerman
                      ? 'Unverbindliche Schätzung – die definitive Steuer berechnet das Steueramt.'
                      : 'Non-binding estimate – definitive tax is assessed by the tax authority.'}
                  </p>
                </div>
              )}

              {savingsAnalysis?.rough_estimate_notice && (
                <p className="text-[10px] text-amber-700 font-medium pt-0.5 leading-snug">
                  {savingsAnalysis.rough_estimate_notice}
                </p>
              )}

              {Number(vstRefund || 0) > 0 && (
                <p className="text-[11px] text-emerald-700 font-semibold pt-1">
                  {isGerman
                    ? `Verrechnungssteuer zurück: CHF ${fmt(vstRefund)}`
                    : `Withholding tax refund: CHF ${fmt(vstRefund)}`}
                </p>
              )}

              <p className="text-[10px] text-slate-400 pt-1 leading-snug">
                {isGerman
                  ? 'Unverbindliche Schätzung gemäss Art. 110 DBG. Die definitive Steuer berechnet das kantonale Steueramt.'
                  : 'Non-binding estimate according to Art. 110 DBG. Final tax is assessed by the cantonal tax administration.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Tipps für dich Card (Addendum 1 tax_tips_de.json) ──────────────── */}
      <div className="bg-white rounded-2xl p-5 border border-[#ECE8DF] shadow-xs">
        <div className="flex items-center justify-between mb-2.5">
          <h4 className="font-bold text-xs text-slate-800">
            {isGerman ? '💡 Tipps für dich' : '💡 Tips for you'}
          </h4>
          <span className="text-[10px] text-slate-400 font-medium">
            {isGerman ? 'Rechtliche Steuer-Tipps' : 'Legal Tax Tips'}
          </span>
        </div>

        <div className="space-y-2 text-xs">
          {dynamicTips.length > 0 ? (
            dynamicTips.slice(0, 3).map((tip: any) => (
              <div
                key={tip.id}
                data-testid={`tax-tip-${tip.id}`}
                className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 transition-all hover:border-emerald-200"
              >
                <div className="flex items-center justify-between gap-1 mb-1">
                  <b className="text-[11px] font-bold text-slate-900">{tip.title}</b>
                  {tip.saving_display && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-[#1E7B52] border border-emerald-200 whitespace-nowrap">
                      {tip.saving_display}
                    </span>
                  )}
                </div>
                <span className="text-slate-600 text-[11px] leading-tight block">
                  {tip.text}
                </span>
              </div>
            ))
          ) : (
            <>
              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <b className="block text-[11px] font-bold text-slate-900 mb-0.5">
                  {isGerman ? 'Säule 3a Maximalabzug' : 'Pillar 3a Maximum'}
                </b>
                <span className="text-slate-600 text-[11px] leading-tight block">
                  {isGerman
                    ? 'Einzahlungen bis CHF 7’258 (2025/2026) können vollumfänglich von Einkommen abgezogen werden.'
                    : 'Contributions up to CHF 7,258 (2025/2026) can be fully deducted from taxable income.'}
                </span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80">
                <b className="block text-[11px] font-bold text-slate-900 mb-0.5">
                  {isGerman ? 'Alles im Blick' : 'Full overview'}
                </b>
                <span className="text-slate-600 text-[11px] leading-tight block">
                  {isGerman
                    ? 'Wir prüfen bei jedem Schritt automatisch, ob dir ein kantonaler Abzug entgeht.'
                    : 'We automatically verify at every step whether any deduction is applicable to you.'}
                </span>
              </div>
            </>
          )}

          {warnings.length > 0 && (
            <div className="mt-3 pt-2.5 border-t border-slate-100">
              <div className="flex items-center gap-1 text-[10px] text-amber-700 font-bold mb-1">
                <AlertCircle className="w-3 h-3 text-amber-600" />
                <span>{isGerman ? 'Wichtige Hinweise' : 'Important Notices'}</span>
              </div>
              <ul className="space-y-1 text-[10px] text-slate-500 leading-snug">
                {warnings.map((w: any) => (
                  <li key={w.id} className="flex items-start gap-1">
                    <span className="text-amber-500 font-bold">•</span>
                    <span>
                      <strong className="text-slate-700">{w.title}:</strong> {w.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
