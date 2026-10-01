'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Canton, Municipality } from '@/types'

const STEPS = ['Canton', 'Municipality', 'Tax year', 'Confirmation']

const CANTON_COLORS: Record<string, string> = {
  ZH: 'bg-blue-100 text-blue-800 border-blue-200',
  ZG: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  SZ: 'bg-red-100 text-red-800 border-red-200',
  SG: 'bg-green-100 text-green-800 border-green-200',
  AG: 'bg-purple-100 text-purple-800 border-purple-200',
  BE: 'bg-orange-100 text-orange-800 border-orange-200',
  BS: 'bg-teal-100 text-teal-800 border-teal-200',
}

export default function NewTaxReturnPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [cantons, setCantons] = useState<Canton[]>([])
  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [municipalitySearch, setMunicipalitySearch] = useState('')
  const [selectedCanton, setSelectedCanton] = useState<Canton | null>(null)
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null)
  const [selectedYear, setSelectedYear] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    api.cantons.list().then(setCantons).catch(console.error)
  }, [])

  useEffect(() => {
    if (selectedCanton) {
      api.cantons.getMunicipalities(selectedCanton.code).then(setMunicipalities)
    }
  }, [selectedCanton])

  const filteredMunicipalities = municipalities.filter(m =>
    m.name.toLowerCase().includes(municipalitySearch.toLowerCase())
  )

  const handleCreate = async () => {
    if (!selectedCanton || !selectedMunicipality || !selectedYear) return
    setSubmitting(true)
    try {
      const tr = await api.taxReturns.create({
        canton_code: selectedCanton.code,
        municipality_code: selectedMunicipality.code,
        municipality_name: selectedMunicipality.name,
        tax_year: selectedYear,
      })
      toast({ title: 'Tax return created', description: 'You can now upload your documents.' })
      router.push(`/tax-returns/${tr.id}`)
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error?.response?.data?.detail || 'The tax return could not be created.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold">New tax return</h2>
        <p className="text-gray-500">Choose your canton, municipality, and tax year.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-bold
              ${i < step ? 'bg-green-500 text-white' : i === step ? 'bg-red-600 text-white' : 'bg-gray-200 text-gray-500'}`}>
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span className={`text-sm hidden sm:block ${i === step ? 'font-medium text-gray-900' : 'text-gray-400'}`}>{s}</span>
            {i < STEPS.length - 1 && <ChevronRight className="h-4 w-4 text-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 0: Canton */}
      {step === 0 && (
        <Card>
          <CardHeader><CardTitle>Select canton</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {cantons.map(canton => (
                <button
                  key={canton.code}
                  onClick={() => { setSelectedCanton(canton); setStep(1) }}
                  className={`p-4 rounded-lg border-2 text-left transition-all hover:shadow-md
                    ${selectedCanton?.code === canton.code ? 'border-red-600 bg-red-50' : 'border-gray-200 hover:border-red-200'}`}
                >
                  <div className={`inline-block px-2 py-1 rounded text-xs font-bold mb-2 border ${CANTON_COLORS[canton.code] || 'bg-gray-100 text-gray-700'}`}>
                    {canton.code}
                  </div>
                  <p className="font-medium text-sm">{canton.name}</p>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 1: Municipality */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select municipality</CardTitle>
            <p className="text-sm text-gray-500">Canton: <strong>{selectedCanton?.name}</strong></p>
          </CardHeader>
          <CardContent className="space-y-4">
            <input
              type="text"
              placeholder="Search municipality..."
              value={municipalitySearch}
              onChange={e => setMunicipalitySearch(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {filteredMunicipalities.map(m => (
                <button
                  key={m.code}
                  onClick={() => { setSelectedMunicipality(m); setStep(2) }}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                    ${selectedMunicipality?.code === m.code ? 'bg-red-50 text-red-700 font-medium' : 'hover:bg-gray-100'}`}
                >
                  {m.name}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setStep(0)}>Back</Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Year */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Select tax year</CardTitle>
            <p className="text-sm text-gray-500">{selectedCanton?.name} – {selectedMunicipality?.name}</p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[2025, 2026].map(year => (
                <button
                  key={year}
                  onClick={() => { setSelectedYear(year); setStep(3) }}
                  className={`p-6 rounded-lg border-2 text-center text-2xl font-bold transition-all hover:shadow-md
                    ${selectedYear === year ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 hover:border-red-200'}`}
                >
                  {year}
                </button>
              ))}
            </div>
            <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Confirmation */}
      {step === 3 && (
        <Card>
          <CardHeader><CardTitle>Confirmation</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between"><span className="text-gray-500">Canton</span><strong>{selectedCanton?.name}</strong></div>
              <div className="flex justify-between"><span className="text-gray-500">Municipality</span><strong>{selectedMunicipality?.name}</strong></div>
              <div className="flex justify-between"><span className="text-gray-500">Steuerjahr</span><strong>{selectedYear}</strong></div>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">Back</Button>
              <Button onClick={handleCreate} className="flex-1 bg-red-600 hover:bg-red-700" disabled={submitting}>
                {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Creating...</> : 'Create tax return'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
