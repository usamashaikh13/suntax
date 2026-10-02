'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle, Download, FileText, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxReturn, TaxProfile } from '@/types'
import { formatCurrency, formatDate } from '@/lib/utils'

interface Props {
  taxReturn: TaxReturn
  profile: TaxProfile | null
  calculation: any
  onConfirm?: () => void
}

const CONFIRMATION_TEXT =
  'I have reviewed my tax return and confirm that all information provided is complete and accurate. I accept full responsibility for the information submitted.'

export function FinalReview({ taxReturn, profile, calculation, onConfirm }: Props) {
  const { toast } = useToast()
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [exporting, setExporting] = useState<'pdf' | 'xml' | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const isReady = !!profile && !!calculation
  const isAlreadyConfirmed = taxReturn.status === 'confirmed'

  const pd = (profile?.personal_data || {}) as any
  const r = calculation?.results || {}

  const handleExport = async (type: 'pdf' | 'xml') => {
    setExporting(type)
    try {
      const blob =
        type === 'pdf'
          ? await api.taxEngine.exportPdf(taxReturn.id)
          : await api.taxEngine.exportXml(taxReturn.id)

      const ext = type === 'pdf' ? 'pdf' : 'xml'
      const mime = type === 'pdf' ? 'application/pdf' : 'application/xml'
      const url = URL.createObjectURL(new Blob([blob], { type: mime }))
      const a = document.createElement('a')
      a.href = url
      a.download = `SunTax_${taxReturn.canton_code}_${taxReturn.tax_year}.${ext}`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      toast({ title: 'Export failed', variant: 'destructive' })
    } finally {
      setExporting(null)
    }
  }

  const handleConfirm = async () => {
    setSubmitting(true)
    try {
      await api.taxEngine.confirm(taxReturn.id, CONFIRMATION_TEXT)
      toast({
        title: 'Tax return confirmed',
        description: 'Your tax return has been completed successfully.',
      })
      setShowConfirmDialog(false)
      onConfirm?.()
    } catch (error: any) {
      toast({
        title: 'Confirmation failed',
        description: error?.response?.data?.detail || 'Please try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  if (!isReady) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-yellow-400 mx-auto" />
          <p className="font-medium text-gray-900">Review not available yet</p>
          <p className="text-sm text-gray-500">
            Please upload your documents and complete the tax calculation first.
          </p>
        </CardContent>
      </Card>
    )
  }

  if (isAlreadyConfirmed) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
          <p className="text-2xl font-bold text-gray-900">Tax return confirmed</p>
          <p className="text-gray-500">
            Confirmed on {taxReturn.confirmed_at ? formatDate(taxReturn.confirmed_at) : '–'}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={exporting === 'pdf'}
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('xml')}
              disabled={exporting === 'xml'}
            >
              {exporting === 'xml' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Export XML
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Tax Return Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">
                Personal Details
              </h4>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-gray-500">Name:</span>{' '}
                  <strong>{pd.name || '–'}</strong>
                </p>
                <p>
                  <span className="text-gray-500">Address:</span>{' '}
                  <strong>{pd.address || '–'}</strong>
                </p>
                <p>
                  <span className="text-gray-500">Marital status:</span>{' '}
                  <strong>{pd.marital_status || '–'}</strong>
                </p>
              </div>

              <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide pt-2">
                Tax Return Details
              </h4>
              <div className="space-y-1 text-sm">
                <p>
                  <span className="text-gray-500">Canton:</span>{' '}
                  <strong>{taxReturn.canton_code}</strong>
                </p>
                <p>
                  <span className="text-gray-500">Municipality:</span>{' '}
                  <strong>{taxReturn.municipality_name}</strong>
                </p>
                <p>
                  <span className="text-gray-500">Tax year:</span>{' '}
                  <strong>{taxReturn.tax_year}</strong>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-semibold text-sm text-gray-500 uppercase tracking-wide">
                Tax Calculation
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Taxable income</span>
                  <strong>{formatCurrency(r.taxable_income || 0)}</strong>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Federal income tax</span>
                  <strong>{formatCurrency(r.federal_income_tax || 0)}</strong>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Cantonal tax</span>
                  <strong>{formatCurrency(r.cantonal_income_tax || 0)}</strong>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Municipal tax</span>
                  <strong>{formatCurrency(r.municipal_income_tax || 0)}</strong>
                </div>
                <div className="flex justify-between py-1 border-b">
                  <span className="text-gray-500">Wealth tax</span>
                  <strong>{formatCurrency(r.wealth_tax || 0)}</strong>
                </div>
                <div className="flex justify-between py-2 text-base font-bold text-red-700 border-t-2 border-red-200">
                  <span>TOTAL</span>
                  <span>{formatCurrency(r.total_tax || 0)}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Export */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Export</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-500 mb-4">
            Download your tax return as PDF or XML for submission to the cantonal tax authority.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={!!exporting}
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              Download PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('xml')}
              disabled={!!exporting}
            >
              {exporting === 'xml' ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileText className="h-4 w-4 mr-2" />
              )}
              Export XML (eCH-0196)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Legal confirmation */}
      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-base">Legal Declaration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <AlertTriangle className="h-4 w-4 inline mr-2" />
            By confirming, you legally declare that all information provided is complete and
            accurate. This tax return cannot be edited after confirmation.
          </div>

          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="mt-1 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
            />
            <span className="text-sm text-gray-700">{CONFIRMATION_TEXT}</span>
          </label>

          <Button
            onClick={() => setShowConfirmDialog(true)}
            disabled={!confirmed}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4 mr-2" />
            Confirm &amp; Submit Tax Return
          </Button>
        </CardContent>
      </Card>

      {/* Confirm dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-lg font-bold">Are you sure?</h3>
            <p className="text-sm text-gray-600">
              Once confirmed, this tax return can no longer be edited. Please ensure all
              information is correct before proceeding.
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowConfirmDialog(false)}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Yes, confirm tax return
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
