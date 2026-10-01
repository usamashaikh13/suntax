'use client'

import { useState } from 'react'
import { Edit2, Save, X, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxProfile } from '@/types'
import { formatCurrency } from '@/lib/utils'

interface Props {
  profile: TaxProfile
  taxReturnId: string
  onUpdate?: () => void
}

function ConfidenceDot({ score }: { score?: number }) {
  if (score === undefined) return null
  const color = score >= 0.8 ? 'bg-green-500' : score >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
  const label = score >= 0.8 ? 'High' : score >= 0.5 ? 'Medium' : 'Low'
  return (
    <span title={`Confidence: ${label} (${Math.round(score * 100)}%)`}
      className={`inline-block w-2 h-2 rounded-full ${color} ml-1`} />
  )
}

function EditableField({
  label, value, onSave
}: { label: string; value: any; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))

  const handleSave = () => {
    onSave(draft)
    setEditing(false)
  }

  return (
    <div className="py-2 border-b border-gray-100 last:border-0">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      {editing ? (
        <div className="flex gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            autoFocus
          />
          <button onClick={handleSave} className="text-green-600 hover:text-green-700">
            <Save className="h-4 w-4" />
          </button>
          <button onClick={() => { setDraft(String(value ?? '')); setEditing(false) }}
            className="text-gray-400 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between group">
          <span className="text-sm font-medium text-gray-800">
            {value !== undefined && value !== null && value !== '' ? String(value) : <span className="text-gray-400 italic">Not provided</span>}
          </span>
          <button onClick={() => setEditing(true)}
            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-600 transition-opacity">
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export function TaxProfileViewer({ profile, taxReturnId, onUpdate }: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [localProfile, setLocalProfile] = useState(profile)

  const updateField = (section: keyof TaxProfile, key: string, value: string) => {
    setLocalProfile(prev => ({
      ...prev,
      [section]: { ...(prev[section] as any), [key]: value },
    }))
  }

  const saveChanges = async () => {
    setSaving(true)
    try {
      await api.taxProfile.update(taxReturnId, localProfile)
      toast({ title: 'Profile saved' })
      onUpdate?.()
    } catch {
      toast({ title: 'Could not save profile', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const flags = (localProfile.flags || []) as any[]
  const conflicts = flags.filter((f: any) => f.type === 'conflict')

  const pd = (localProfile.personal_data || {}) as any
  const inc = (localProfile.income || {}) as any
  const wealth = (localProfile.wealth || {}) as any
  const ded = (localProfile.deductions || {}) as any
  const liab = (localProfile.liabilities || {}) as any

  return (
    <div className="space-y-4">
      {/* Conflict warnings */}
      {conflicts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2 text-yellow-800 font-medium">
            <AlertTriangle className="h-5 w-5" />
            {conflicts.length} conflict{conflicts.length === 1 ? '' : 's'} detected
          </div>
          {conflicts.map((c: any, i: number) => (
            <p key={i} className="text-sm text-yellow-700 ml-7">• {c.message}</p>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Personal data */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <span>Personal details</span>
              {pd.name && <CheckCircle className="h-4 w-4 text-green-500" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <EditableField label="Name" value={pd.name} onSave={v => updateField('personal_data', 'name', v)} />
            <EditableField label="Address" value={pd.address} onSave={v => updateField('personal_data', 'address', v)} />
            <EditableField label="Date of birth" value={pd.date_of_birth} onSave={v => updateField('personal_data', 'date_of_birth', v)} />
            <EditableField label="Marital status" value={pd.marital_status} onSave={v => updateField('personal_data', 'marital_status', v)} />
            <EditableField label="AHV-Nummer" value={pd.ahv_number} onSave={v => updateField('personal_data', 'ahv_number', v)} />
          </CardContent>
        </Card>

        {/* Income */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Income</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Total gross salary</p>
              <p className="text-sm font-medium">
                {inc.total_employment_income
                  ? formatCurrency(inc.total_employment_income)
                  : <span className="text-gray-400 italic">Not provided</span>}
              </p>
            </div>
            {(inc.employers || []).map((emp: any, i: number) => (
              <div key={i} className="py-2 border-b border-gray-100 last:border-0">
                <p className="text-xs text-gray-500">{emp.employer_name || `Arbeitgeber ${i + 1}`}</p>
                <p className="text-sm font-medium">{formatCurrency(emp.gross_salary)}</p>
              </div>
            ))}
            <div className="py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Bank interest</p>
              <p className="text-sm font-medium">{formatCurrency(inc.bank_interest || 0)}</p>
            </div>
            <div className="py-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Dividends</p>
              <p className="text-sm font-medium">{formatCurrency(inc.dividends || 0)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Deductions */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Deductions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-0">
            <div className="py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Pillar 3a</p>
              <p className="text-sm font-medium">{formatCurrency(ded.pillar3a_total || 0)}</p>
            </div>
            <div className="py-2 border-b border-gray-100">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Donations</p>
              <p className="text-sm font-medium">{formatCurrency(ded.donations_total || 0)}</p>
            </div>
            <div className="py-2">
              <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Mortgage interest</p>
              <p className="text-sm font-medium">{formatCurrency(ded.mortgage_interest || 0)}</p>
            </div>
          </CardContent>
        </Card>

        {/* Wealth */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Wealth</CardTitle>
          </CardHeader>
          <CardContent>
            {(wealth.bank_accounts || []).map((acc: any, i: number) => (
              <div key={i} className="py-2 border-b border-gray-100 last:border-0">
                <p className="text-xs text-gray-500">{acc.bank_name || `Konto ${i + 1}`} {acc.iban ? `(${acc.iban})` : ''}</p>
                <p className="text-sm font-medium">{formatCurrency(acc.balance || 0)} {acc.currency || 'CHF'}</p>
              </div>
            ))}
            {(wealth.bank_accounts || []).length === 0 && (
              <p className="text-sm text-gray-400 italic">No bank accounts recorded</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Securities */}
      {(localProfile.securities || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Securities ({(localProfile.securities || []).length} positions)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs text-gray-500">
                    <th className="text-left py-2">Name</th>
                    <th className="text-left py-2">ISIN</th>
                    <th className="text-right py-2">Quantity</th>
                    <th className="text-right py-2">Value</th>
                    <th className="text-right py-2">Dividend</th>
                  </tr>
                </thead>
                <tbody>
                  {(localProfile.securities || []).map((s: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100 last:border-0">
                      <td className="py-2 font-medium">{s.name || '–'}</td>
                      <td className="py-2 text-gray-500 font-mono text-xs">{s.isin || s.valor || '–'}</td>
                      <td className="py-2 text-right">{s.quantity}</td>
                      <td className="py-2 text-right">{formatCurrency(s.value || 0)}</td>
                      <td className="py-2 text-right">{s.dividend ? formatCurrency(s.dividend) : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={saveChanges} disabled={saving} className="bg-red-600 hover:bg-red-700">
          {saving ? 'Saving...' : 'Save changes'}
        </Button>
      </div>
    </div>
  )
}
