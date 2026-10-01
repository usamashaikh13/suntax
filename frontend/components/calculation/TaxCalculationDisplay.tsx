'use client'

import { useState } from 'react'
import { Calculator, ChevronDown, ChevronUp, Loader2, RefreshCw } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

interface Props {
  taxReturnId: string
  calculation: any
  onCalculate?: () => void
}

function TaxCard({ label, amount, color }: { label: string; amount: number; color: string }) {
  return (
    <div className={`p-4 rounded-xl border-2 ${color}`}>
      <p className="text-xs uppercase tracking-wide opacity-70 mb-1">{label}</p>
      <p className="text-xl font-bold">{formatCurrency(amount)}</p>
    </div>
  )
}

export function TaxCalculationDisplay({ taxReturnId, calculation, onCalculate }: Props) {
  const { toast } = useToast()
  const [calculating, setCalculating] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const handleCalculate = async () => {
    setCalculating(true)
    try {
      await api.taxEngine.calculate(taxReturnId)
      toast({ title: 'Steuerberechnung abgeschlossen' })
      onCalculate?.()
    } catch (error: any) {
      toast({
        title: 'Calculation failed',
        description: error?.response?.data?.detail || 'Make sure all required information is complete.',
        variant: 'destructive',
      })
    } finally {
      setCalculating(false)
    }
  }

  if (!calculation) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-4">
          <Calculator className="h-12 w-12 text-gray-300 mx-auto" />
          <div>
            <p className="font-medium text-gray-900 mb-1">No tax calculation yet</p>
            <p className="text-sm text-gray-500">
              Upload your documents and answer all questions first.
            </p>
          </div>
          <Button onClick={handleCalculate} disabled={calculating} className="bg-red-600 hover:bg-red-700">
            {calculating
              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Calculating...</>
              : <><Calculator className="h-4 w-4 mr-2" />Calculate tax</>
            }
          </Button>
        </CardContent>
      </Card>
    )
  }

  const r = calculation.results || {}

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TaxCard label="Federal income tax" amount={r.federal_income_tax || 0} color="border-blue-200 bg-blue-50 text-blue-900" />
        <TaxCard label="Cantonal tax" amount={r.cantonal_income_tax || 0} color="border-purple-200 bg-purple-50 text-purple-900" />
        <TaxCard label="Municipal tax" amount={r.municipal_income_tax || 0} color="border-orange-200 bg-orange-50 text-orange-900" />
        <TaxCard
          label="Wealth tax"
          amount={Number(r.wealth_tax ?? (Number(r.wealth_tax_canton || 0) + Number(r.wealth_tax_municipal || 0)))}
          color="border-teal-200 bg-teal-50 text-teal-900"
        />
      </div>

      {/* Total */}
      <div className="bg-red-600 text-white rounded-xl p-5 flex justify-between items-center">
        <div>
          <p className="text-sm opacity-80">Total estimated tax</p>
          <p className="text-3xl font-bold mt-1">{formatCurrency(r.total_tax || 0)}</p>
        </div>
        <div className="text-right text-sm opacity-75 space-y-1">
          <p>Taxable income: {formatCurrency(r.taxable_income || 0)}</p>
          <p>Taxable wealth: {formatCurrency(r.taxable_wealth || 0)}</p>
          <p className="text-xs">Rule version: {calculation.rule_version}</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={handleCalculate} disabled={calculating}>
          {calculating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          <span className="ml-2">Recalculate</span>
        </Button>
        <Button variant="outline" onClick={() => setShowBreakdown(!showBreakdown)}>
          {showBreakdown ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          <span className="ml-2">{showBreakdown ? 'Hide details' : 'Show details'}</span>
        </Button>
      </div>

      {/* Breakdown */}
      {showBreakdown && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Calculation details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="text-left py-2 pr-4">Item</th>
                    <th className="text-right py-2 pr-4">Amount</th>
                    <th className="text-left py-2 text-gray-400">Rule reference</th>
                  </tr>
                </thead>
                <tbody>
                  {(calculation.breakdown || []).map((item: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 pr-4">{item.label}</td>
                      <td className={`py-2 pr-4 text-right font-mono ${(item.amount || 0) < 0 ? 'text-green-600' : 'text-gray-800'}`}>
                        {formatCurrency(item.amount || 0)}
                      </td>
                      <td className="py-2 text-xs text-gray-400">{item.rule_key}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Last calculated */}
      <p className="text-xs text-gray-400 text-right">
        Calculated: {new Date(calculation.calculated_at).toLocaleString('en-CH')}
        {calculation.is_final && ' · Finalised'}
      </p>
    </div>
  )
}
