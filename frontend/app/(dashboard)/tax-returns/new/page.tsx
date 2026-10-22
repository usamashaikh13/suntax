'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, ChevronRight, Loader2, Search, ArrowLeft,
  Building2, Calendar, ShieldCheck, Sparkles, MapPin,
  HelpCircle, AlertTriangle, CheckCircle2, XCircle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Canton, Municipality } from '@/types'
import { cn } from '@/lib/utils'

const STEPS = [
  'Eignungsprüfung',
  'Kanton & Gemeinde',
  'Steuerjahr',
  'Zusammenfassung',
]

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zürich', BE: 'Bern', LU: 'Luzern', UR: 'Uri', SZ: 'Schwyz', OW: 'Obwalden',
  NW: 'Nidwalden', GL: 'Glarus', ZG: 'Zug', FR: 'Freiburg', SO: 'Solothurn',
  BS: 'Basel-Stadt', BL: 'Basel-Landschaft', SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden',
  AI: 'Appenzell Innerrhoden', SG: 'St. Gallen', GR: 'Graubünden', AG: 'Aargau',
  TG: 'Thurgau', TI: 'Tessin', VD: 'Waadt', VS: 'Wallis', NE: 'Neuenburg',
  GE: 'Genf', JU: 'Jura',
}

export default function NewTaxReturnPage() {
  const router = useRouter()
  const { toast } = useToast()

  // Pre-check state (Part B2: «Passt SunTax zu Ihnen?»)
  const [preCheckAnswers, setPreCheckAnswers] = useState({
    employed: true,
    no_quellensteuer: true,
    no_real_estate: true,
    no_self_employed: true,
  })
  const [preCheckPassed, setPreCheckPassed] = useState(false)

  const [step, setStep] = useState(0)
  const [cantons, setCantons] = useState<Canton[]>([])
  const [cantonSearch, setCantonSearch] = useState('')

  const [municipalities, setMunicipalities] = useState<Municipality[]>([])
  const [municipalitySearch, setMunicipalitySearch] = useState('')
  const [selectedCanton, setSelectedCanton] = useState<Canton | null>(null)
  const [selectedMunicipality, setSelectedMunicipality] = useState<Municipality | null>(null)
  const [selectedYear, setSelectedYear] = useState<number>(2025)
  const [submitting, setSubmitting] = useState(false)
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(false)

  // Load defaults and cantons on mount
  useEffect(() => {
    api.cantons.list().then(setCantons).catch(console.error)

    // Load auto-suggested defaults
    api.taxReturns.suggestDefaults()
      .then(data => {
        if (data.suggested_tax_year) {
          setSelectedYear(data.suggested_tax_year)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (selectedCanton) {
      setLoadingMunicipalities(true)
      setMunicipalities([])
      setMunicipalitySearch('')
      api.cantons
        .getMunicipalities(selectedCanton.code)
        .then(mList => {
          setMunicipalities(mList)
          // Default to first municipality or capital if matching
          if (mList.length > 0) {
            const capital = mList.find(m => m.name.toLowerCase() === selectedCanton.name.toLowerCase()) || mList[0] || null
            setSelectedMunicipality(capital)
          }
        })
        .catch(console.error)
        .finally(() => setLoadingMunicipalities(false))
    }
  }, [selectedCanton])

  const filteredCantons = useMemo(() => {
    return cantons.filter(c => {
      const name = CANTON_NAMES[c.code] || c.name
      return name.toLowerCase().includes(cantonSearch.toLowerCase()) ||
             c.code.toLowerCase().includes(cantonSearch.toLowerCase())
    })
  }, [cantons, cantonSearch])

  const filteredMunicipalities = useMemo(() => {
    return municipalities.filter(m =>
      m.name.toLowerCase().includes(municipalitySearch.toLowerCase()) ||
      m.code.includes(municipalitySearch)
    )
  }, [municipalities, municipalitySearch])

  // Pre-check evaluation
  const isEligible = preCheckAnswers.employed &&
                     preCheckAnswers.no_quellensteuer &&
                     preCheckAnswers.no_real_estate &&
                     preCheckAnswers.no_self_employed

  const handlePreCheckProceed = () => {
    if (!isEligible) return
    setPreCheckPassed(true)
    // Pre-select Zurich by default per requirements
    const zh = cantons.find(c => c.code === 'ZH')
    if (zh && !selectedCanton) {
      setSelectedCanton(zh)
    }
    setStep(1)
  }

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
        title: 'Steuererklärung erfolgreich eröffnet!',
        description: `Dossier für ${selectedCanton.name} (${selectedMunicipality.name}) – Steuerjahr ${selectedYear} erstellt.`,
      })
      router.push(`/tax-returns/${tr.id}`)
    } catch (error: any) {
      toast({
        title: 'Erstellung fehlgeschlagen',
        description: error?.response?.data?.detail || 'Bitte überprüfen Sie Ihre Auswahl.',
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
        <div className="flex items-center gap-2 mb-1.5">
          <Badge variant="outline" className="text-red-600 border-red-200 text-xs">
            Offizielle ESTV-Tarife 2025
          </Badge>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-500 font-medium">Alle 26 Schweizer Kantone</span>
        </div>
        <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Neue Steuererklärung erstellen
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Schritt für Schritt zu Ihrer rechtskonformen Schweizer Steuererklärung
        </p>
      </div>

      {/* Progress Steps */}
      <div className="grid grid-cols-4 gap-2 border-b border-slate-200 pb-4">
        {STEPS.map((s, idx) => (
          <div key={s} className="space-y-1">
            <div className={cn(
              'h-1.5 rounded-full transition-all duration-300',
              step > idx ? 'bg-emerald-500' : step === idx ? 'bg-red-600' : 'bg-slate-200'
            )} />
            <span className={cn(
              'text-[11px] font-medium block truncate',
              step === idx ? 'text-red-700 font-bold' : step > idx ? 'text-emerald-700' : 'text-slate-400'
            )}>
              {idx + 1}. {s}
            </span>
          </div>
        ))}
      </div>

      {/* STEP 0: Pre-Check Questionnaire (Part B2) */}
      {step === 0 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/60 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold">
                <HelpCircle className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  Passt SunTax zu Ihnen?
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Kurzer Vorab-Check (4 Fragen), um sicherzustellen, dass SunTax optimal für Sie ist.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            {[
              {
                id: 'employed',
                question: '1. Sind Sie im Angestelltenverhältnis tätig?',
                detail: 'Lohnempfänger mit Lohnausweis (Peter Group, Migros, Banken, Gewerbe etc.)',
                current: preCheckAnswers.employed,
                expected: true,
              },
              {
                id: 'no_quellensteuer',
                question: '2. Werden Sie ordentlich veranlagt (KEINE Quellensteuer)?',
                detail: 'Schweizer Bürger oder Inhaber einer C-Niederlassungsbewilligung (oder Antrag auf NOVA)',
                current: preCheckAnswers.no_quellensteuer,
                expected: true,
              },
              {
                id: 'no_real_estate',
                question: '3. Besitzen Sie KEINE Liegenschaften oder Immobilien?',
                detail: 'Sie wohnen zur Miete und besitzen kein Wohneigentum in der Schweiz oder im Ausland',
                current: preCheckAnswers.no_real_estate,
                expected: true,
              },
              {
                id: 'no_self_employed',
                question: '4. Üben Sie KEINE selbstständige Erwerbstätigkeit aus?',
                detail: 'Keine Einzelfirma, GmbH-Geschäftsführung oder freiberufliche Praxis',
                current: preCheckAnswers.no_self_employed,
                expected: true,
              },
            ].map(item => (
              <div
                key={item.id}
                className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div>
                  <h4 className="text-xs sm:text-sm font-bold text-slate-900">{item.question}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">{item.detail}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreCheckAnswers(prev => ({ ...prev, [item.id]: true }))}
                    className={cn(
                      'px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5',
                      item.current === true
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    <Check className="h-3.5 w-3.5" /> Ja
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreCheckAnswers(prev => ({ ...prev, [item.id]: false }))}
                    className={cn(
                      'px-3.5 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5',
                      item.current === false
                        ? 'bg-red-600 text-white border-red-600 shadow-xs'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                    )}
                  >
                    <XCircle className="h-3.5 w-3.5" /> Nein
                  </button>
                </div>
              </div>
            ))}

            {/* Assessment Feedback Card */}
            {isEligible ? (
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 flex items-start gap-3 mt-4">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs sm:text-sm font-bold">Perfekt! SunTax ist ideal für Ihre Situation.</h4>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Als angestellte Person ohne Liegenschaften profitieren Sie von unserer automatischen Lohnausweis-Erkennung,
                    der Pauschaloptimierung für Pendeln und Verpflegung sowie der direkten Säule-3a-Anrechnung.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl border border-amber-200 bg-amber-50 text-amber-950 flex items-start gap-3 mt-4">
                <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs sm:text-sm font-bold">Hinweis zur Eignung</h4>
                  <p className="text-xs text-amber-900 leading-relaxed">
                    SunTax ist aktuell auf angestellte Steuerpflichtige mit einfacher bis moderater Situation fokussiert.
                    Für Selbstständige, Liegenschaftsbesitzer oder quellensteuerpflichtige Personen empfehlen wir die persönliche
                    Beratung durch einen zugelassenen Treuhänder.
                  </p>
                  <p className="text-[11px] text-amber-800 font-semibold mt-1">
                    Es entstehen Ihnen bei SunTax selbstverständlich keinerlei Kosten.
                  </p>
                </div>
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t">
              <Button asChild variant="outline" size="sm" className="text-xs">
                <Link href="/dashboard">Zurück zur Übersicht</Link>
              </Button>

              <Button
                onClick={handlePreCheckProceed}
                disabled={!isEligible}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-9 px-5"
              >
                Weiter zu Schritt 2
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 1: Canton & Municipality */}
      {step === 1 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/60 pb-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg font-bold text-slate-900">
                  Wohnsitzkanton & Gemeinde wählen
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Massgebend ist Ihr Wohnsitz per 31. Dezember des Steuerjahres.
                </CardDescription>
              </div>
              <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
                Vorschlag: Zürich (ZH)
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            {/* Canton Selector */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-900">
                  Kanton auswählen
                </label>
                <div className="relative w-48">
                  <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Kanton suchen..."
                    value={cantonSearch}
                    onChange={e => setCantonSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-red-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 max-h-56 overflow-y-auto p-1 border rounded-xl">
                {filteredCantons.map(c => {
                  const isSelected = selectedCanton?.code === c.code
                  const name = CANTON_NAMES[c.code] || c.name
                  return (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => setSelectedCanton(c)}
                      className={cn(
                        'p-2.5 rounded-lg border text-left transition-all flex items-center justify-between',
                        isSelected
                          ? 'border-red-600 bg-red-50/60 text-red-950 font-bold shadow-xs'
                          : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                      )}
                    >
                      <div className="truncate">
                        <span className="font-mono text-xs font-bold mr-1.5">{c.code}</span>
                        <span className="text-xs">{name}</span>
                      </div>
                      {isSelected && <Check className="h-3.5 w-3.5 text-red-600 flex-shrink-0" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Municipality Selector */}
            {selectedCanton && (
              <div className="space-y-2 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900">
                    Wohngemeinde im Kanton {CANTON_NAMES[selectedCanton.code] || selectedCanton.name}
                  </label>
                  <div className="relative w-48">
                    <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Gemeinde suchen..."
                      value={municipalitySearch}
                      onChange={e => setMunicipalitySearch(e.target.value)}
                      className="w-full pl-8 pr-3 py-1 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:border-red-500"
                    />
                  </div>
                </div>

                {loadingMunicipalities ? (
                  <div className="py-6 flex items-center justify-center text-xs text-slate-500 gap-2">
                    <Loader2 className="h-4 w-4 animate-spin text-red-600" />
                    Gemeinden werden geladen...
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-1 border rounded-xl">
                    {filteredMunicipalities.map(m => {
                      const isSelected = selectedMunicipality?.code === m.code
                      return (
                        <button
                          key={m.code}
                          type="button"
                          onClick={() => setSelectedMunicipality(m)}
                          className={cn(
                            'p-2 rounded-lg border text-left text-xs transition-all flex items-center justify-between truncate',
                            isSelected
                              ? 'border-red-600 bg-red-50/60 text-red-950 font-bold'
                              : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                          )}
                        >
                          <span className="truncate">{m.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono ml-1">#{m.code}</span>
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setStep(0)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Zurück
              </Button>
              <Button
                onClick={() => setStep(2)}
                disabled={!selectedCanton || !selectedMunicipality}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-9 px-5"
              >
                Weiter zum Steuerjahr
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 2: Tax Year (Default 2025) */}
      {step === 2 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/60 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">
              Steuerjahr auswählen
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              In der Regel deklarieren Sie das soeben abgelaufene Steuerjahr (2025).
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {[2025, 2024].map(year => (
                <button
                  key={year}
                  type="button"
                  onClick={() => setSelectedYear(year)}
                  className={cn(
                    'p-4 rounded-xl border text-left transition-all',
                    selectedYear === year
                      ? 'border-red-600 bg-red-50/60 text-red-950 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xl font-black">{year}</span>
                    {year === 2025 && (
                      <Badge className="bg-red-600 text-white text-[10px]">
                        Aktuelles Steuerjahr
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    {year === 2025
                      ? 'Fällig per 31. März 2026. Gültige Tarife ESTV 2025 aktiv.'
                      : 'Nachdeklaration oder Fristerstreckung für das Vorjahr.'}
                  </p>
                </button>
              ))}
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setStep(1)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Zurück
              </Button>
              <Button
                onClick={() => setStep(3)}
                className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-9 px-5"
              >
                Weiter zur Zusammenfassung
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* STEP 3: Review & Create */}
      {step === 3 && (
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/60 pb-4">
            <CardTitle className="text-lg font-bold text-slate-900">
              Steuererklärung bestätigen & eröffnen
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Überprüfen Sie Ihre Stammdaten vor dem Start des Erfassungsprozesses.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-6 space-y-6">
            <div className="grid grid-cols-3 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200 text-center">
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Kanton</p>
                <p className="text-base font-extrabold text-slate-900 mt-0.5">
                  {selectedCanton?.code} ({CANTON_NAMES[selectedCanton?.code || ''] || selectedCanton?.name})
                </p>
              </div>
              <div className="border-x border-slate-200">
                <p className="text-[11px] text-slate-400 font-medium">Wohngemeinde</p>
                <p className="text-base font-extrabold text-slate-900 mt-0.5">
                  {selectedMunicipality?.name}
                </p>
                <span className="text-[10px] text-slate-400 font-mono">BFS #{selectedMunicipality?.code}</span>
              </div>
              <div>
                <p className="text-[11px] text-slate-400 font-medium">Steuerjahr</p>
                <p className="text-base font-extrabold text-red-600 mt-0.5">
                  {selectedYear}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 text-xs text-blue-900 space-y-1">
              <h4 className="font-bold flex items-center gap-1.5">
                <Sparkles className="h-4 w-4 text-blue-600" />
                Nächster Schritt: Dokumente hochladen
              </h4>
              <p className="text-[11px] text-blue-800 leading-relaxed">
                Nach dem Erstellen können Sie Ihren Lohnausweis (PDF oder Foto) sowie Bankauszüge hochladen.
                SunTax extrahiert alle Ziffern automatisch und berechnet Ihre Abzüge nach kantonalem Recht.
              </p>
            </div>

            <div className="flex justify-between items-center pt-4 border-t">
              <Button variant="outline" size="sm" onClick={() => setStep(2)} className="text-xs">
                <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Zurück
              </Button>

              <Button
                onClick={handleCreate}
                disabled={submitting}
                className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-10 px-6 shadow-md shadow-red-600/20"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Dossier wird angelegt...
                  </>
                ) : (
                  <>
                    Steuererklärung jetzt starten
                    <ChevronRight className="h-4 w-4 ml-1.5" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
