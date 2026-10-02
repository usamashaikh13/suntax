'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  Check, ChevronRight, Loader2, Search, ArrowLeft,
  Building2, Calendar, ShieldCheck, Sparkles, MapPin
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Canton, Municipality } from '@/types'
import { cn } from '@/lib/utils'

const STEPS = ['Select Canton', 'Select Municipality', 'Select Tax Year', 'Review & Start']

const CANTON_LANGUAGES: Record<string, string> = {
  ZH: 'de', BE: 'de/fr', LU: 'de', UR: 'de', SZ: 'de', OW: 'de', NW: 'de',
  GL: 'de', ZG: 'de', FR: 'fr/de', SO: 'de', BS: 'de', BL: 'de', SH: 'de',
  AR: 'de', AI: 'de', SG: 'de', GR: 'de/rm/it', AG: 'de', TG: 'de', TI: 'it',
  VD: 'fr', VS: 'fr/de', NE: 'fr', GE: 'fr', JU: 'fr',
}

const LOW_TAX_CANTONS = new Set(['ZG', 'SZ', 'NW', 'OW', 'UR'])

export default function NewTaxReturnPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [step, setStep] = useState(0)
  const [cantons, setCantons] = useState<Canton[]>([])
  const [cantonSearch, setCantonSearch] = useState('')
  const [cantonFilter, setCantonFilter] = useState<'all' | 'low_tax' | 'de' | 'fr'>('all')

  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [municipalitySearch, setMunicipalitySearch] = useState('')
  const [selectedCanton, setSelectedCanton] = useState<Canton | null>(null)
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(2025)
  const [submitting, setSubmitting] = useState(false)
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false)

  useEffect(() => {
    api.cantons.list().then(setCantons).catch(console.error)
  }, [])

  useEffect(() => {
    if (selectedCanton) {
      setLoadingMunicipalities(true)
      setMunicipalities([])
      setMunicipalitySearch('')
      api.cantons
        .getMunicipalities(selectedCanton.code)
        .then(setMunicipalities)
        .catch(console.error)
        .finally(() => setLoadingMunicipalities(false))
    }
  }, [selectedCanton])

  const filteredCantons = useMemo(() => {
    return cantons.filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(cantonSearch.toLowerCase()) ||
                            c.code.toLowerCase().includes(cantonSearch.toLowerCase())
      if (!matchesSearch) return false

      if (cantonFilter === 'low_tax') return LOW_TAX_CANTONS.has(c.code)
      if (cantonFilter === 'de') return (CANTON_LANGUAGES[c.code] || '').includes('de')
      if (cantonFilter === 'fr') return (CANTON_LANGUAGES[c.code] || '').includes('fr')
      return true
    })
  }, [cantons, cantonSearch, cantonFilter])

  const filteredMunicipalities = useMemo(() => {
    return municipalities.filter(m =>
      m.name.toLowerCase().includes(municipalitySearch.toLowerCase()) ||
      m.code.includes(municipalitySearch)
    )
  }, [municipalities, municipalitySearch])

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
      toast({
        title: 'Tax return initialized!',
        description: `Created for ${selectedCanton.name} (${selectedMunicipality.name}) – ${selectedYear}.`,
      })
      router.push(`/tax-returns/${tr.id}`)
    } catch (error: any) {
      toast({
        title: 'Failed to create tax return',
        description: error?.response?.data?.detail || 'Please check your inputs and try again.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Badge variant="outline" className="text-red-600 border-red-200 text-xs">
            Official ESTV Engine
          </Badge>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-500 font-medium">All 26 Swiss Cantons Supported</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Create New Tax Declaration
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          Configure your cantonal and municipal tax residency to load deterministic statutory rules.
        </p>
      </div>

      {/* Stepper Navigation */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center justify-between">
          {STEPS.map((stepName, i) => {
            const isCompleted = i < step
            const isCurrent = i === step

            return (
              <div key={stepName} className="flex items-center flex-1 last:flex-none">
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      'h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all',
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-red-600 text-white ring-4 ring-red-100 shadow-sm'
                        : 'bg-slate-100 text-slate-400'
                    )}
                  >
                    {isCompleted ? <Check className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={cn(
                      'text-xs hidden md:block font-medium',
                      isCurrent ? 'text-slate-900 font-bold' : isCompleted ? 'text-slate-700' : 'text-slate-400'
                    )}
                  >
                    {stepName}
                  </span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 mx-3 h-0.5 bg-slate-200 hidden sm:block" />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* STEP 0: CANTON SELECTION */}
      {step === 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Select Your Tax Residence Canton</CardTitle>
            <CardDescription>
              Select the canton where you had your main tax residence on December 31st.
            </CardDescription>

            {/* Search and Filters */}
            <div className="pt-3 flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search canton name or code (e.g. Zurich, ZG, Geneva)..."
                  value={cantonSearch}
                  onChange={e => setCantonSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-600"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg flex-shrink-0">
                {[
                  { id: 'all', label: 'All (26)' },
                  { id: 'low_tax', label: 'Low-Tax' },
                  { id: 'de', label: 'German' },
                  { id: 'fr', label: 'French' },
                ].map(filter => (
                  <button
                    key={filter.id}
                    onClick={() => setCantonFilter(filter.id as any)}
                    className={cn(
                      'px-2.5 py-1 text-xs font-semibold rounded-md transition-all',
                      cantonFilter === filter.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    )}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>

          <CardContent>
            {cantons.length === 0 ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-7 w-7 animate-spin text-red-600" />
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredCantons.map(canton => {
                  const isLowTax = LOW_TAX_CANTONS.has(canton.code)
                  const isSelected = selectedCanton?.code === canton.code

                  return (
                    <button
                      key={canton.code}
                      onClick={() => {
                        setSelectedCanton(canton)
                        setStep(1)
                      }}
                      className={cn(
                        'p-3.5 rounded-xl border text-left transition-all duration-150 flex flex-col justify-between h-24 hover:scale-[1.02]',
                        isSelected
                          ? 'border-red-600 bg-red-50/70 shadow-sm ring-1 ring-red-600'
                          : 'border-slate-200/90 bg-white hover:border-slate-300 hover:shadow-xs'
                      )}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="h-7 w-8 rounded bg-slate-100 border border-slate-200/70 text-slate-900 font-extrabold text-xs flex items-center justify-center">
                          {canton.code}
                        </span>
                        {isLowTax && (
                          <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded">
                            Low Tax
                          </span>
                        )}
                      </div>
                      <p className="font-bold text-xs sm:text-sm text-slate-900 truncate">
                        {canton.name}
                      </p>
                    </button>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 1: MUNICIPALITY SELECTION */}
      {step === 1 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Select Municipality (Commune)</CardTitle>
                <CardDescription>
                  Canton: <strong className="text-slate-900">{selectedCanton?.name} ({selectedCanton?.code})</strong>
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(0)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Change Canton
              </Button>
            </div>

            <div className="relative pt-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 mt-1" />
              <input
                type="text"
                placeholder="Search municipality or BFS code (e.g. Zurich, 261)..."
                value={municipalitySearch}
                onChange={e => setMunicipalitySearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-red-600 mt-2"
                autoFocus
              />
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {loadingMunicipalities ? (
              <div className="flex flex-col items-center justify-center py-12 space-y-2">
                <Loader2 className="h-7 w-7 animate-spin text-red-600" />
                <p className="text-xs text-slate-500">Loading official BFS municipalities for {selectedCanton?.name}...</p>
              </div>
            ) : (
              <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                {filteredMunicipalities.length === 0 ? (
                  <p className="text-center text-slate-400 py-8 text-xs">
                    No municipalities found matching &quot;{municipalitySearch}&quot;.
                  </p>
                ) : (
                  filteredMunicipalities.map(m => {
                    const isSelected = selectedMunicipality?.code === m.code

                    return (
                      <button
                        key={m.code}
                        onClick={() => {
                          setSelectedMunicipality(m)
                          setStep(2)
                        }}
                        className={cn(
                          'w-full text-left px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm transition-all flex items-center justify-between',
                          isSelected
                            ? 'bg-red-50 text-red-700 border-red-300 font-bold'
                            : 'bg-white border-slate-200/80 text-slate-800 hover:bg-slate-50 hover:border-slate-300'
                        )}
                      >
                        <span className="font-medium">{m.name}</span>
                        <span className="text-[11px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          BFS #{m.code}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* STEP 2: TAX YEAR SELECTION */}
      {step === 2 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Select Tax Assessment Year</CardTitle>
                <CardDescription>
                  {selectedCanton?.name} – {selectedMunicipality?.name}
                </CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setStep(1)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
              </Button>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                {
                  year: 2025,
                  title: 'Tax Year 2025 (Active Filing)',
                  desc: 'Standard filing season. Max Pillar 3a deduction CHF 7,258. Full inflation indexation brackets.',
                  activeTag: 'Recommended'
                },
                {
                  year: 2026,
                  title: 'Tax Year 2026 (Provisional)',
                  desc: 'Advance planning and withholding tax reconciliation for calendar year 2026.',
                  activeTag: 'Advance'
                },
              ].map(item => (
                <button
                  key={item.year}
                  onClick={() => {
                    setSelectedYear(item.year)
                    setStep(3)
                  }}
                  className={cn(
                    'p-5 rounded-xl border-2 text-left transition-all duration-150 flex flex-col justify-between space-y-3',
                    selectedYear === item.year
                      ? 'border-red-600 bg-red-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl font-black text-slate-900">{item.year}</span>
                    <Badge variant="outline" className="text-xs border-slate-300">
                      {item.activeTag}
                    </Badge>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: REVIEW & CREATE */}
      {step === 3 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Review Tax Declaration Parameters</CardTitle>
            <CardDescription>
              Please verify your selected residency and tax year before initializing your file.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-5 space-y-3">
              <div className="flex justify-between items-center text-xs sm:text-sm py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Canton of Residence</span>
                <span className="font-bold text-slate-900">
                  {selectedCanton?.name} ({selectedCanton?.code})
                </span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Municipality (Commune)</span>
                <span className="font-bold text-slate-900">
                  {selectedMunicipality?.name} (BFS #{selectedMunicipality?.code})
                </span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm py-1 border-b border-slate-200/60">
                <span className="text-slate-500">Tax Assessment Year</span>
                <span className="font-bold text-red-600">{selectedYear}</span>
              </div>
              <div className="flex justify-between items-center text-xs sm:text-sm py-1">
                <span className="text-slate-500">Tax Engine Ruleset</span>
                <span className="font-semibold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="h-4 w-4" /> ESTV Verified Deterministic
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                className="flex-1 text-xs"
              >
                Back
              </Button>
              <Button
                onClick={handleCreate}
                disabled={submitting}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-10 shadow-md shadow-red-600/20"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Initializing Tax File...
                  </>
                ) : (
                  'Create Tax Return'
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
