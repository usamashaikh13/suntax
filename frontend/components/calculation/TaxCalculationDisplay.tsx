'use client'

import React, { useState } from 'react'
import {
  Calculator,
  ChevronDown,
  ChevronUp,
  Loader2,
  RefreshCw,
  ShieldCheck,
  TrendingDown,
  Building,
  Landmark,
  PiggyBank,
  CheckCircle2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'

interface Props {
  taxReturnId: string
  calculation: any
  profile?: any
  cantonCode?: string
  onCalculate?: () => void
  onNavigateTab?: (tab: string) => void
}

function TaxSummaryCard({
  label,
  amount,
  color,
  icon: Icon,
}: {
  label: string
  amount: number
  color: string
  icon: any
}) {
  return (
    <div className={`p-4 rounded-2xl border bg-white shadow-xs space-y-1.5 ${color}`}>
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4 opacity-70 text-[#1E7B52]" />
      </div>
      <p className="text-xl font-extrabold font-mono text-slate-900">
        CHF {Math.round(amount || 0).toLocaleString('de-CH')}
      </p>
    </div>
  )
}

export function TaxCalculationDisplay({
  taxReturnId,
  calculation,
  profile,
  cantonCode = 'ZH',
  onCalculate,
  onNavigateTab,
}: Props) {
  const { toast } = useToast()
  const { isGerman } = useTranslation()
  const [calculating, setCalculating] = useState(false)

  const handleCalculate = async () => {
    setCalculating(true)
    try {
      await api.taxEngine.calculate(taxReturnId)
      toast({
        title: isGerman ? 'Berechnung aktualisiert' : 'Calculation updated',
        description: isGerman
          ? 'Deine Steuerfaktoren und Abzüge wurden neu berechnet.'
          : 'Your tax rates and deductions have been recalculated.',
      })
      onCalculate?.()
    } catch (error: any) {
      toast({
        title: isGerman ? 'Berechnung fehlgeschlagen' : 'Calculation failed',
        description:
          error?.response?.data?.detail ||
          (isGerman ? 'Bitte überprüfe, ob alle erforderlichen Angaben vorhanden sind.' : 'Please verify all required information is provided.'),
        variant: 'destructive',
      })
    } finally {
      setCalculating(false)
    }
  }

  if (!calculation) {
    return (
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
        <CardContent className="py-14 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-emerald-50 text-[#1E7B52] border border-emerald-100 flex items-center justify-center mx-auto">
            <Calculator className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-base">
              {isGerman ? 'Noch keine Steuerberechnung vorhanden' : 'No tax calculation available yet'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {isGerman
                ? 'Lade deine Dokumente hoch oder beantworte die Steuerfragen, um eine provisorische Steuerrechnung zu erstellen.'
                : 'Upload your documents or answer the tax questions to generate a provisional tax assessment.'}
            </p>
          </div>
          <Button
            onClick={handleCalculate}
            disabled={calculating}
            className="bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-10 px-5 rounded-xl shadow-xs"
          >
            {calculating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {isGerman ? 'Berechne Steuern ...' : 'Calculating taxes ...'}
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                {isGerman ? 'Steuern jetzt berechnen' : 'Calculate taxes now'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    )
  }

  const r = calculation.results || calculation || {}
  const fedTax = Number(r.federal_income_tax || calculation.federal_income_tax || 0)
  const canTax = Number(r.cantonal_income_tax || calculation.cantonal_income_tax || 0)
  const munTax = Number(r.municipal_income_tax || calculation.municipal_income_tax || 0)
  const wealthTax = Number(
    r.wealth_tax ??
      calculation.wealth_tax ??
      (Number(r.wealth_tax_canton || 0) + Number(r.wealth_tax_municipal || 0))
  )
  const totalTax = Number(r.total_tax ?? calculation.total_tax_due ?? (fedTax + canTax + munTax + wealthTax))
  const taxableIncome = Number(r.taxable_income ?? calculation.taxable_income ?? 0)
  const taxableWealth = Number(r.taxable_wealth ?? calculation.taxable_wealth ?? 0)

  const pData = profile?.personal_data || {}
  const incData = profile?.income_data || {}
  const dedData = profile?.deductions_data || {}

  const grossSalary = Number(incData.employment_income || incData.gross_salary || 0)
  const sideIncome = Number(incData.self_employment_income || incData.side_job_income || 0)
  const secIncome = Number(incData.dividends || 0) + Number(incData.bank_interest || 0)
  const totalIncome = grossSalary + sideIncome + secIncome

  const p3a = Number(dedData.pillar3a_contributions || 0)
  const commute = Number(dedData.travel_expenses || dedData.commute_costs || 0)
  const health = Number(dedData.health_insurance_premiums || 0)
  const care = Number(dedData.childcare_costs || 0)
  const edu = Number(dedData.education_expenses || 0)
  const donations = Number(dedData.donations || 0)
  const totalDeductions = Number(r.canton_deductions_total ?? (p3a + commute + health + care + edu + donations))

  const savingsAnalysis = r.savings_analysis || calculation.savings_analysis || null
  const savingsTotalChf = savingsAnalysis ? Math.round(Number(savingsAnalysis.total_savings_chf || 0)) : null
  const savingsItems: Array<{ key: string; label: string; savings_chf: number; display: string }> =
    Array.isArray(savingsAnalysis?.items) ? savingsAnalysis.items : []

  return (
    <div className="space-y-6">
      {/* ── Top Overview Banner: Total Estimated Tax (Art. 110 DBG) ── */}
      <div className="bg-[#1E7B52] text-white rounded-2xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
              {isGerman ? `Kanton ${cantonCode} & Bund` : `Canton ${cantonCode} & Federal`}
            </span>
            <span className="text-xs opacity-90 font-medium">
              {isGerman ? 'Unverbindliche Schätzung' : 'Non-binding estimate'}
            </span>
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight mt-1">
            « ca. CHF {Math.round(totalTax).toLocaleString('de-CH')} »
          </div>
          <p className="text-xs opacity-80 max-w-xl">
            {isGerman
              ? 'Gemäss Art. 110 DBG (Selbstdeklaration) stellt diese Berechnung eine Annäherung dar. Die definitive Steuerveranlagung erfolgt durch das kantonale Steueramt.'
              : 'According to Art. 110 DBG (self-declaration), this calculation is a close estimate. Final assessment is made exclusively by the cantonal tax administration.'}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 text-xs font-mono opacity-90">
          <div>
            {isGerman ? 'Steuerbares Einkommen:' : 'Taxable Income:'}{' '}
            <strong>CHF {Math.round(taxableIncome).toLocaleString('de-CH')}</strong>
          </div>
          <div>
            {isGerman ? 'Steuerbares Vermögen:' : 'Taxable Wealth:'}{' '}
            <strong>CHF {Math.round(taxableWealth).toLocaleString('de-CH')}</strong>
          </div>
        </div>
      </div>

      {/* ── 4 Component Tax Breakdown Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TaxSummaryCard
          label={isGerman ? 'Bundessteuer' : 'Federal Tax'}
          amount={fedTax}
          color="border-[#ECE8DF]"
          icon={Landmark}
        />
        <TaxSummaryCard
          label={isGerman ? `Kantonssteuer (${cantonCode})` : `Cantonal Tax (${cantonCode})`}
          amount={canTax}
          color="border-[#ECE8DF]"
          icon={Building}
        />
        <TaxSummaryCard
          label={isGerman ? 'Gemeindesteuer' : 'Municipal Tax'}
          amount={munTax}
          color="border-[#ECE8DF]"
          icon={Building}
        />
        <TaxSummaryCard
          label={isGerman ? 'Vermögenssteuer' : 'Wealth Tax'}
          amount={wealthTax}
          color="border-[#ECE8DF]"
          icon={PiggyBank}
        />
      </div>

      {/* ── Addendum 1 Section 7: «So viel sparst du» Counterfactual Tax Savings ── */}
      {savingsAnalysis && (
        <Card
          data-testid="so-viel-sparst-du-card"
          className="border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white rounded-2xl shadow-xs"
        >
          <CardHeader className="pb-3 border-b border-emerald-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base font-extrabold text-[#14181F] flex items-center gap-2">
                <TrendingDown className="h-5 w-5 text-[#1E7B52]" />
                <span>{isGerman ? 'So viel sparst du' : 'How much you save'}</span>
              </CardTitle>
              {savingsAnalysis.rough_estimate_notice && (
                <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-[11px]">
                  {isGerman ? 'Grobe Kantonsschätzung' : 'Rough estimate'}
                </Badge>
              )}
            </div>
            <p className="text-sm sm:text-base font-bold text-[#1E7B52] mt-1">
              {isGerman
                ? `Dank deinen Abzügen sparst du ca. CHF ${(savingsTotalChf ?? 0).toLocaleString('de-CH')}.`
                : `Thanks to your deductions, you save approx. CHF ${(savingsTotalChf ?? 0).toLocaleString('de-CH')}.`}
            </p>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {savingsItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {savingsItems.map((it) => (
                  <div
                    key={it.key}
                    className="p-2.5 rounded-xl bg-white border border-emerald-100 flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="font-medium text-slate-700">{it.label}</span>
                    <span className="font-mono font-bold text-[#1E7B52] whitespace-nowrap">
                      {isGerman
                        ? `Spart ca. CHF ${Math.round(it.savings_chf).toLocaleString('de-CH')}`
                        : `Saves approx. CHF ${Math.round(it.savings_chf).toLocaleString('de-CH')}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {savingsAnalysis.rough_estimate_notice && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl">
                {savingsAnalysis.rough_estimate_notice}
              </p>
            )}

            <p className="text-[11px] text-slate-500">
              {isGerman
                ? 'Unverbindliche Schätzung – die definitive Steuer berechnet das Steueramt.'
                : 'Non-binding estimate – the definitive tax assessment is issued by the tax authority.'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Side-by-Side Comparison: Kanton vs. Bund (Redesign Schritt 5) ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#1E7B52]" />
              <span>
                {isGerman
                  ? `Gegenüberstellung: Kanton ${cantonCode} vs. Bund`
                  : `Comparison: Canton ${cantonCode} vs. Federal`}
              </span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              {isGerman
                ? 'Alle Positionen auf einen Blick mit Herkunftsnachweis.'
                : 'All line items at a glance with origin verification.'}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCalculate}
              disabled={calculating}
              className="h-8 text-xs font-semibold text-slate-700 rounded-xl"
            >
              {calculating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              {isGerman ? 'Neu berechnen' : 'Recalculate'}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-100/70 text-slate-600 font-bold">
                  <th className="text-left py-2.5 px-4">{isGerman ? 'Position' : 'Item'}</th>
                  <th className="text-left py-2.5 px-3">{isGerman ? 'Herkunft' : 'Source'}</th>
                  <th className="text-right py-2.5 px-4 font-mono">{isGerman ? `Kanton ${cantonCode}` : `Canton ${cantonCode}`}</th>
                  <th className="text-right py-2.5 px-4 font-mono">{isGerman ? 'Bund (DBG)' : 'Federal (DBG)'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* 1. Einkünfte */}
                <tr className="bg-slate-50/60 font-bold text-slate-800">
                  <td colSpan={4} className="py-2 px-4 uppercase text-[10px] tracking-wider text-slate-500">
                    {isGerman ? '1. Einkünfte' : '1. Income'}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-900">
                    {isGerman ? 'Haupterwerb (Lohn)' : 'Primary Employment (Salary)'}
                  </td>
                  <td className="py-2 px-3 text-slate-500">
                    {isGerman ? 'Lohnausweis' : 'Salary Certificate'}
                  </td>
                  <td className="py-2 px-4 text-right font-mono font-semibold">CHF {grossSalary.toLocaleString('de-CH')}</td>
                  <td className="py-2 px-4 text-right font-mono font-semibold">CHF {grossSalary.toLocaleString('de-CH')}</td>
                </tr>
                {sideIncome > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Nebenerwerb' : 'Secondary Income'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'deine Angabe' : 'user entry'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono">CHF {sideIncome.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono">CHF {sideIncome.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {secIncome > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Ertrag aus Wertschriften & Guthaben' : 'Securities & Interest Income'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'Bank-/Steuerauszug' : 'Bank Statement'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono">CHF {secIncome.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono">CHF {secIncome.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold text-slate-900 border-t border-b">
                  <td className="py-2 px-4">{isGerman ? 'Total der Einkünfte' : 'Total Gross Income'}</td>
                  <td className="py-2 px-3 text-slate-400">–</td>
                  <td className="py-2 px-4 text-right font-mono">CHF {totalIncome.toLocaleString('de-CH')}</td>
                  <td className="py-2 px-4 text-right font-mono">CHF {totalIncome.toLocaleString('de-CH')}</td>
                </tr>

                {/* 2. Abzüge */}
                <tr className="bg-slate-50/60 font-bold text-slate-800">
                  <td colSpan={4} className="py-2 px-4 uppercase text-[10px] tracking-wider text-slate-500">
                    {isGerman ? '2. Abzüge' : '2. Deductions'}
                  </td>
                </tr>
                {commute > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Arbeitsweg (Fahrkosten)' : 'Commuting Expenses'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'deine Angabe' : 'user entry'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {commute.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {Math.min(commute, 3300).toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {p3a > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Säule 3a' : 'Pillar 3a Pension'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'Bescheinigung' : 'Certificate'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {p3a.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {p3a.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {health > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Krankenkassen-Prämien & Sparzinsen' : 'Health Insurance & Savings Interest'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'deine Angabe' : 'user entry'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {health.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {health.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {care > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Drittbetreuung Kinder (Kita/Hort)' : 'Childcare Costs'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'Beleg' : 'Receipt'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {care.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {Math.min(care, 25800).toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {edu > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Aus- und Weiterbildungskosten' : 'Continuing Education Costs'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'Beleg' : 'Receipt'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {edu.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {Math.min(edu, 13000).toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {donations > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">
                      {isGerman ? 'Gemeinnützige Spenden' : 'Charitable Donations'}
                    </td>
                    <td className="py-2 px-3 text-slate-500">
                      {isGerman ? 'Spendenquittung' : 'Donation Receipt'}
                    </td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {donations.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {donations.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold text-slate-900 border-t border-b">
                  <td className="py-2 px-4">{isGerman ? 'Total der Abzüge' : 'Total Deductions'}</td>
                  <td className="py-2 px-3 text-slate-400">–</td>
                  <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {totalDeductions.toLocaleString('de-CH')}</td>
                  <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {totalDeductions.toLocaleString('de-CH')}</td>
                </tr>

                {/* 3. Steuerbare Faktoren */}
                <tr className="bg-emerald-50/60 font-black text-slate-900">
                  <td className="py-3 px-4 text-sm">{isGerman ? 'Steuerbares Einkommen' : 'Taxable Income'}</td>
                  <td className="py-3 px-3 text-emerald-800 text-[11px] font-sans">
                    {isGerman ? 'gerundet auf 100 CHF' : 'rounded to 100 CHF'}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm font-extrabold text-slate-900">
                    CHF {Math.round(taxableIncome).toLocaleString('de-CH')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm font-extrabold text-slate-900">
                    CHF {Math.round(taxableIncome).toLocaleString('de-CH')}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="py-2.5 px-4">{isGerman ? 'Steuerbares Vermögen' : 'Taxable Wealth'}</td>
                  <td className="py-2.5 px-3 text-slate-500 text-[11px] font-sans">
                    {isGerman ? 'nur Kanton' : 'Canton only'}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                    CHF {Math.round(taxableWealth).toLocaleString('de-CH')}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-400">
                    {isGerman ? '– (keine Bundessteuer)' : '– (no federal tax)'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
