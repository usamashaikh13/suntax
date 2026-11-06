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
    <div className={`p-4 rounded-xl border bg-white shadow-xs space-y-1 ${color}`}>
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-[11px] font-bold uppercase tracking-wider">{label}</span>
        <Icon className="h-4 w-4 opacity-70" />
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
  const [calculating, setCalculating] = useState(false)
  const [showDetailedForm, setShowDetailedForm] = useState(false)

  const handleCalculate = async () => {
    setCalculating(true)
    try {
      await api.taxEngine.calculate(taxReturnId)
      toast({
        title: 'Berechnung aktualisiert',
        description: 'Deine Steuerfaktoren und Abzüge wurden neu berechnet.',
      })
      onCalculate?.()
    } catch (error: any) {
      toast({
        title: 'Berechnung fehlgeschlagen',
        description:
          error?.response?.data?.detail ||
          'Bitte überprüfe, ob alle erforderlichen Angaben vorhanden sind.',
        variant: 'destructive',
      })
    } finally {
      setCalculating(false)
    }
  }

  if (!calculation) {
    return (
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="py-14 text-center space-y-4">
          <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
            <Calculator className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-slate-900 text-base">Noch keine Steuerberechnung vorhanden</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Lade deine Dokumente hoch oder beantworte die Steuerfragen, um eine provisorische Steuerrechnung zu erstellen.
            </p>
          </div>
          <Button
            onClick={handleCalculate}
            disabled={calculating}
            className="bg-primary hover:bg-primary-700 text-white font-bold text-xs h-9 px-4 shadow-sm"
          >
            {calculating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Berechne Steuern ...
              </>
            ) : (
              <>
                <Calculator className="h-4 w-4 mr-2" />
                Steuern jetzt berechnen
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

  // Deductions from calculation or breakdown
  const details = calculation.calculation_details || {}
  const pData = profile?.personal_data || {}
  const incData = profile?.income_data || {}
  const dedData = profile?.deductions_data || {}
  const wData = profile?.wealth_data || {}

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
  const totalDeductions = p3a + commute + health + care + edu + donations

  return (
    <div className="space-y-6">
      {/* ── Top Overview Banner: Total Estimated Tax (Art. 110 DBG) ── */}
      <div className="bg-primary text-white rounded-2xl p-6 shadow-md flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-white/20 px-2.5 py-0.5 rounded-full">
              Kanton {cantonCode} & Bund
            </span>
            <span className="text-xs opacity-90 font-medium">Unverbindliche Schätzung</span>
          </div>
          <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight mt-1">
            « ca. CHF {Math.round(totalTax).toLocaleString('de-CH')} »
          </div>
          <p className="text-xs opacity-80 max-w-xl">
            Gemäss Art. 110 DBG (Selbstdeklaration) stellt diese Berechnung eine Annäherung dar. Die definitive Steuerveranlagung erfolgt durch das kantonale Steueramt.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col items-start md:items-end gap-2 text-xs font-mono opacity-90">
          <div>Steuerbares Einkommen: <strong>CHF {Math.round(taxableIncome).toLocaleString('de-CH')}</strong></div>
          <div>Steuerbares Vermögen: <strong>CHF {Math.round(taxableWealth).toLocaleString('de-CH')}</strong></div>
          {calculation.rule_version && (
            <div className="text-[11px] opacity-75 font-sans">Regel-Version: {calculation.rule_version}</div>
          )}
        </div>
      </div>

      {/* ── 4 Component Tax Breakdown Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TaxSummaryCard
          label="Bundessteuer"
          amount={fedTax}
          color="border-slate-200"
          icon={Landmark}
        />
        <TaxSummaryCard
          label={`Kantonssteuer (${cantonCode})`}
          amount={canTax}
          color="border-slate-200"
          icon={Building}
        />
        <TaxSummaryCard
          label="Gemeindesteuer"
          amount={munTax}
          color="border-slate-200"
          icon={Building}
        />
        <TaxSummaryCard
          label="Vermögenssteuer"
          amount={wealthTax}
          color="border-slate-200"
          icon={PiggyBank}
        />
      </div>

      {/* ── Side-by-Side Comparison: Kanton vs. Bund (Redesign Schritt 5) ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              <span>Gegenüberstellung: Kanton {cantonCode} vs. Bund</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500 mt-0.5">
              Alle Positionen auf einen Blick mit Herkunftsnachweis.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCalculate}
              disabled={calculating}
              className="h-8 text-xs font-semibold text-slate-700"
            >
              {calculating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              )}
              Neu berechnen
            </Button>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-100/70 text-slate-600 font-bold">
                  <th className="text-left py-2.5 px-4">Position</th>
                  <th className="text-left py-2.5 px-3">Herkunft</th>
                  <th className="text-right py-2.5 px-4 font-mono">Kanton {cantonCode}</th>
                  <th className="text-right py-2.5 px-4 font-mono">Bund (DBG)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {/* 1. Einkünfte */}
                <tr className="bg-slate-50/60 font-bold text-slate-800">
                  <td colSpan={4} className="py-2 px-4 uppercase text-[10px] tracking-wider text-slate-500">
                    1. Einkünfte
                  </td>
                </tr>
                <tr>
                  <td className="py-2 px-4 font-medium text-slate-900">Haupterwerb (Lohn)</td>
                  <td className="py-2 px-3 text-slate-500">Lohnausweis</td>
                  <td className="py-2 px-4 text-right font-mono font-semibold">CHF {grossSalary.toLocaleString('de-CH')}</td>
                  <td className="py-2 px-4 text-right font-mono font-semibold">CHF {grossSalary.toLocaleString('de-CH')}</td>
                </tr>
                {sideIncome > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Nebenerwerb</td>
                    <td className="py-2 px-3 text-slate-500">deine Angabe</td>
                    <td className="py-2 px-4 text-right font-mono">CHF {sideIncome.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono">CHF {sideIncome.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {secIncome > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Ertrag aus Wertschriften & Guthaben</td>
                    <td className="py-2 px-3 text-slate-500">Bank-/Steuerauszug</td>
                    <td className="py-2 px-4 text-right font-mono">CHF {secIncome.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono">CHF {secIncome.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold text-slate-900 border-t border-b">
                  <td className="py-2 px-4">Total der Einkünfte</td>
                  <td className="py-2 px-3 text-slate-400">–</td>
                  <td className="py-2 px-4 text-right font-mono">CHF {totalIncome.toLocaleString('de-CH')}</td>
                  <td className="py-2 px-4 text-right font-mono">CHF {totalIncome.toLocaleString('de-CH')}</td>
                </tr>

                {/* 2. Abzüge */}
                <tr className="bg-slate-50/60 font-bold text-slate-800">
                  <td colSpan={4} className="py-2 px-4 uppercase text-[10px] tracking-wider text-slate-500">
                    2. Abzüge
                  </td>
                </tr>
                {commute > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Arbeitsweg (Fahrkosten)</td>
                    <td className="py-2 px-3 text-slate-500">deine Angabe</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {commute.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {Math.min(commute, 3300).toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {p3a > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Säule 3a</td>
                    <td className="py-2 px-3 text-slate-500">Bescheinigung</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {p3a.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {p3a.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {health > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Krankenkassen-Prämien & Sparzinsen</td>
                    <td className="py-2 px-3 text-slate-500">deine Angabe</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {health.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {health.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {care > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Drittbetreuung Kinder (Kita/Hort)</td>
                    <td className="py-2 px-3 text-slate-500">Beleg</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {care.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {Math.min(care, 25800).toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {edu > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Aus- und Weiterbildungskosten</td>
                    <td className="py-2 px-3 text-slate-500">Beleg</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {edu.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {Math.min(edu, 13000).toLocaleString('de-CH')}</td>
                  </tr>
                )}
                {donations > 0 && (
                  <tr>
                    <td className="py-2 px-4 font-medium text-slate-900">Gemeinnützige Spenden</td>
                    <td className="py-2 px-3 text-slate-500">Spendenquittung</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {donations.toLocaleString('de-CH')}</td>
                    <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {donations.toLocaleString('de-CH')}</td>
                  </tr>
                )}
                <tr className="bg-slate-50 font-bold text-slate-900 border-t border-b">
                  <td className="py-2 px-4">Total der Abzüge</td>
                  <td className="py-2 px-3 text-slate-400">–</td>
                  <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {totalDeductions.toLocaleString('de-CH')}</td>
                  <td className="py-2 px-4 text-right font-mono text-emerald-700">− CHF {totalDeductions.toLocaleString('de-CH')}</td>
                </tr>

                {/* 3. Steuerbare Faktoren */}
                <tr className="bg-emerald-50/60 font-black text-slate-900">
                  <td className="py-3 px-4 text-sm">Steuerbares Einkommen</td>
                  <td className="py-3 px-3 text-emerald-800 text-[11px] font-sans">gerundet auf 100 CHF</td>
                  <td className="py-3 px-4 text-right font-mono text-sm font-extrabold text-slate-900">
                    CHF {Math.round(taxableIncome).toLocaleString('de-CH')}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-sm font-extrabold text-slate-900">
                    CHF {Math.round(taxableIncome).toLocaleString('de-CH')}
                  </td>
                </tr>
                <tr className="bg-slate-50 font-bold text-slate-900">
                  <td className="py-2.5 px-4">Steuerbares Vermögen</td>
                  <td className="py-2.5 px-3 text-slate-500 text-[11px] font-sans">nur Kanton</td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900">
                    CHF {Math.round(taxableWealth).toLocaleString('de-CH')}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono text-slate-400">– (keine Bundessteuer)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
