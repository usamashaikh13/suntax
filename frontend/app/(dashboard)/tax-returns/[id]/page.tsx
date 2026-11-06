'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { api, cantonsApi } from '@/lib/api'
import { TaxReturn, TaxProfile, Document } from '@/types'
import { DocumentUploader } from '@/components/document-upload/DocumentUploader'
import { DocumentList } from '@/components/document-upload/DocumentList'
import { TaxProfileViewer } from '@/components/tax-profile/TaxProfileViewer'
import { TaxQuestions } from '@/components/tax-profile/TaxQuestions'
import { TaxCalculationDisplay } from '@/components/calculation/TaxCalculationDisplay'
import { LiveTaxCounter } from '@/components/calculation/LiveTaxCounter'
import { FinalReview } from '@/components/review/FinalReview'
import { TaxAssistant } from '@/components/tax-assistant/TaxAssistant'
import {
  Loader2,
  AlertCircle,
  Sparkles,
  MessageCircle,
  ChevronRight,
  ShieldCheck,
  FileText,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Check,
  Lock,
  Calendar,
  MapPin,
  Users,
  AlertTriangle,
  HelpCircle,
  Building
} from 'lucide-react'
import { cn } from '@/lib/utils'

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zürich', ZG: 'Zug', SZ: 'Schwyz', SG: 'St. Gallen',
  AG: 'Aargau', BE: 'Bern', BS: 'Basel-Stadt', LU: 'Luzern',
  UR: 'Uri', OW: 'Obwalden', NW: 'Nidwalden', GL: 'Glarus',
  FR: 'Freiburg', SO: 'Solothurn', BL: 'Basel-Landschaft',
  SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden',
  GR: 'Graubünden', TG: 'Thurgau', TI: 'Tessin', VD: 'Waadt',
  VS: 'Wallis', NE: 'Neuenburg', GE: 'Genf', JU: 'Jura',
}

export type FlowStep = 'start' | 'documents' | 'questions' | 'complete' | 'review' | 'submit'

interface StepConfig {
  id: FlowStep
  stepNum: number
  title: string
  shortLabel: string
  subtitle: string
}

const STEPS: StepConfig[] = [
  {
    id: 'start',
    stepNum: 1,
    title: 'Kurz zu dir',
    shortLabel: 'Start',
    subtitle: 'Wohnort, Zivilstand und Eignung – damit wir die richtigen kantonalen Steuerregeln anwenden.',
  },
  {
    id: 'documents',
    stepNum: 2,
    title: 'Lade alles hoch, was du hast',
    shortLabel: 'Dokumente',
    subtitle: 'Lohnausweis, Bankauszug, Belege – wir lesen sie aus und ordnen alles der richtigen Stelle zu.',
  },
  {
    id: 'questions',
    stepNum: 3,
    title: 'Nur noch ein paar Fragen',
    shortLabel: 'Fragen',
    subtitle: 'Das steht in keinem Dokument – Arbeitsweg, Homeoffice, Mittagessen und Sorgerecht.',
  },
  {
    id: 'complete',
    stepNum: 4,
    title: 'Haben wir etwas vergessen?',
    shortLabel: 'Ergänzen',
    subtitle: 'Ergänze fehlende Einkünfte, Abzüge oder dein Wertschriften- und Guthabenverzeichnis.',
  },
  {
    id: 'review',
    stepNum: 5,
    title: 'Deine Steuererklärung',
    shortLabel: 'Kontrolle',
    subtitle: 'Gegenüberstellung für Kanton und Bund auf einen Blick. Jeder Wert lässt sich anpassen.',
  },
  {
    id: 'submit',
    stepNum: 6,
    title: 'Bestätigen und einreichen',
    shortLabel: 'Einreichen',
    subtitle: 'Rechtsgültige Bestätigung nach Art. 110 & 113 DBG, Bezahlung CHF 39 und offizieller eCH-0119 Export.',
  },
]

export default function TaxReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()

  const [taxReturn, setTaxReturn] = useState<TaxReturn | null>(null)
  const [profile, setProfile] = useState<TaxProfile | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [calculation, setCalculation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Six-step state
  const [currentStep, setCurrentStep] = useState<FlowStep>('start')
  const [assistantPrompt, setAssistantPrompt] = useState<string | null>(null)

  // Step 1: Start form state
  const [startPlz, setStartPlz] = useState('')
  const [startPlzLoading, setStartPlzLoading] = useState(false)
  const [startPlzResult, setStartPlzResult] = useState<{
    plz: string
    default_canton: string
    default_bfs: string
    default_name: string
    municipalities: Array<{ bfs: string; name: string; canton: string }>
  } | null>(null)
  const [startCivilStatus, setStartCivilStatus] = useState<string>('single')
  const [startKids, setStartKids] = useState<number>(0)
  const [startFit, setStartFit] = useState<[boolean, boolean, boolean]>([true, true, true])
  const [savingStart, setSavingStart] = useState(false)

  // Load tax return & profile
  const loadData = async () => {
    try {
      const [tr, docs] = await Promise.all([
        api.taxReturns.get(id),
        api.documents.list(id),
      ])
      setTaxReturn(tr)
      setDocuments(docs)

      try {
        const prof = await api.taxProfile.get(id)
        setProfile(prof)
        if (prof?.personal_data) {
          const pd = prof.personal_data as any
          if (pd.postal_code) setStartPlz(pd.postal_code)
          if (pd.marital_status) setStartCivilStatus(pd.marital_status)
          if (pd.children_count !== undefined) setStartKids(Number(pd.children_count))
        }
      } catch {}

      try {
        const calc = await api.taxEngine.getCalculation(id)
        setCalculation(calc)
      } catch {}
    } catch {
      toast({ title: 'Steuererklärung konnte nicht geladen werden', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

  // Restore step from URL query or localStorage on initial load
  useEffect(() => {
    const urlStep = searchParams.get('step') as FlowStep | null
    if (urlStep && STEPS.some(s => s.id === urlStep)) {
      setCurrentStep(urlStep)
      return
    }

    try {
      const savedStep = localStorage.getItem(`suntax_step_${id}`) as FlowStep | null
      if (savedStep && STEPS.some(s => s.id === savedStep)) {
        setCurrentStep(savedStep)
      }
    } catch {}
  }, [id, searchParams])

  // Save step on change
  const navigateToStep = (step: FlowStep | string) => {
    const target = STEPS.some(s => s.id === step) ? (step as FlowStep) : 'start'
    setCurrentStep(target)
    try {
      localStorage.setItem(`suntax_step_${id}`, target)
    } catch {}
    const params = new URLSearchParams(window.location.search)
    params.set('step', target)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // Poll for document processing
  useEffect(() => {
    const hasActiveProcessing = documents.some(
      d =>
        d.processing_status === 'processing' ||
        d.processing_status === 'queued' ||
        d.processing_status === 'pending'
    )
    if (!hasActiveProcessing) return

    const timer = setInterval(() => {
      loadData()
    }, 2500)

    return () => clearInterval(timer)
  }, [documents, id])

  // PLZ lookup for Step 1
  useEffect(() => {
    if (startPlz.trim().length === 4) {
      setStartPlzLoading(true)
      cantonsApi
        .lookupPlz(startPlz.trim())
        .then(res => setStartPlzResult(res))
        .catch(() => setStartPlzResult(null))
        .finally(() => setStartPlzLoading(false))
    } else {
      setStartPlzResult(null)
    }
  }, [startPlz])

  // Handle saving Step 1
  const handleSaveStart = async () => {
    if (!startFit[0] || !startFit[1] || !startFit[2]) {
      toast({
        title: 'Nicht unterstützter Steuerfall',
        description: 'SunTax unterstützt aktuell nur unselbstständig Erwerbstätige und Rentner ohne ausserkantonale Liegenschaften.',
        variant: 'destructive',
      })
      return
    }

    setSavingStart(true)
    try {
      const existingPersonal = profile?.personal_data || {}
      await api.taxProfile.update(id, {
        personal_data: {
          ...existingPersonal,
          postal_code: startPlz || (existingPersonal as any)?.postal_code || (existingPersonal as any)?.address_zip,
          marital_status: startCivilStatus,
          children_count: startKids,
          canton_code: startPlzResult?.default_canton || taxReturn?.canton_code,
        },
      } as any)

      await loadData()
      toast({
        title: 'Angaben aktualisiert',
        description: 'Deine Startangaben wurden gespeichert.',
      })
      navigateToStep('documents')
    } catch (err: any) {
      toast({
        title: 'Speichern fehlgeschlagen',
        description: err?.response?.data?.detail || 'Bitte überprüfe deine Angaben.',
        variant: 'destructive',
      })
    } finally {
      setSavingStart(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-primary border-t-transparent" />
        <p className="text-xs font-semibold text-slate-500">Steuererklärung wird geladen ...</p>
      </div>
    )
  }

  if (!taxReturn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] gap-3 text-slate-800">
        <AlertCircle className="h-9 w-9 text-red-600" />
        <p className="text-sm font-bold">Steuererklärung nicht gefunden.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/tax-returns">Zurück zur Übersicht</Link>
        </Button>
      </div>
    )
  }

  const cantonName = CANTON_NAMES[taxReturn.canton_code] || taxReturn.canton_code
  const currentStepConfig: StepConfig = STEPS.find(s => s.id === currentStep) ?? STEPS[0]!
  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep)

  // Next disabled logic and clear hints
  const hasReadingDocs = documents.some(d => d.processing_status === 'processing' || d.processing_status === 'queued')
  const isFit = startFit[0] && startFit[1] && startFit[2]

  let nextDisabled = false
  let nextDisabledHint = ''

  if (currentStep === 'start') {
    if (!isFit) {
      nextDisabled = true
      nextDisabledHint = 'Für diesen Fall ist SunTax noch nicht gemacht. Bitte überprüfe die Eignungskriterien.'
    }
  } else if (currentStep === 'documents') {
    if (hasReadingDocs) {
      nextDisabled = true
      nextDisabledHint = 'Einen Moment bitte – deine Dokumente werden noch eingelesen.'
    }
  }

  const handleGoNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      if (currentStep === 'start') {
        handleSaveStart()
      } else {
        const nextStep = STEPS[currentStepIndex + 1]
        if (nextStep) navigateToStep(nextStep.id)
      }
    }
  }

  const handleGoPrev = () => {
    if (currentStepIndex > 0) {
      const prevStep = STEPS[currentStepIndex - 1]
      if (prevStep) navigateToStep(prevStep.id)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <Link href="/tax-returns" className="hover:text-slate-900 transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Meine Steuererklärungen
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-semibold">{cantonName} {taxReturn.tax_year}</span>
        <span>/</span>
        <span className="text-primary font-bold">{currentStepConfig.shortLabel}</span>
      </div>

      {/* ── Header Card ───────────────────────────────────────────────────── */}
      <div className="p-5 sm:p-6 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-primary text-white font-black text-xl flex items-center justify-center shadow-sm flex-shrink-0">
            {taxReturn.canton_code}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Steuererklärung {taxReturn.tax_year} – Kanton {cantonName}
              </h1>
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full border bg-slate-100 text-slate-700 border-slate-200">
                Gemeinde {taxReturn.municipality_name}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-500 font-medium flex-wrap">
              <span>BFS-Gemeindenummer #{taxReturn.municipality_code}</span>
              <span>•</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> ESTV KS 30 & eCH-0119 aktiv
              </span>
              <span>•</span>
              <span className="text-slate-600">
                Pauschalpreis CHF 39 (erst beim Einreichen)
              </span>
            </div>
          </div>
        </div>

        {/* AI Assistant Help Trigger */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAssistantPrompt('Wie funktioniert die Einreichung im Kanton ' + cantonName + '?')}
            className="border-primary/30 text-primary bg-primary/5 hover:bg-primary/10 flex items-center gap-1.5 text-xs font-bold h-9 px-3.5"
          >
            <MessageCircle className="h-3.5 w-3.5 text-primary" />
            Frage zu dieser Seite
          </Button>
        </div>
      </div>

      {/* ── Unified 6-Step Stepper Navigation Bar (Redesign) ──────────────── */}
      <div className="p-2 sm:p-3 rounded-2xl bg-white border border-slate-200/90 shadow-xs">
        <div className="flex items-center justify-between mb-2 px-1 text-xs font-medium text-slate-500">
          <div>
            <strong className="text-slate-900 font-bold">Schritt {currentStepConfig.stepNum} von 6</strong> · {currentStepConfig.title}
          </div>
          <div className="hidden sm:block text-slate-400">
            {currentStepConfig.subtitle}
          </div>
        </div>

        <nav className="grid grid-cols-2 sm:grid-cols-6 gap-1.5" aria-label="Steuererklärung Ablauf">
          {STEPS.map((s, idx) => {
            const isCurrent = s.id === currentStep
            const isPast = idx < currentStepIndex
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => navigateToStep(s.id)}
                className={cn(
                  'px-3 py-2.5 rounded-xl text-left transition-all duration-150 flex items-center justify-between gap-2 border text-xs font-bold cursor-pointer',
                  isCurrent
                    ? 'bg-primary text-white border-primary shadow-xs'
                    : isPast
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900 hover:bg-emerald-100/70'
                    : 'bg-slate-50/50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                )}
              >
                <div className="truncate">
                  <div className={cn('text-[10px] uppercase tracking-wider', isCurrent ? 'text-white/80' : 'text-slate-400')}>
                    {s.stepNum}. Schritt
                  </div>
                  <div className="truncate">{s.shortLabel}</div>
                </div>
                {isPast ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                ) : isCurrent ? (
                  <ChevronRight className="h-4 w-4 text-white flex-shrink-0" />
                ) : null}
              </button>
            )
          })}
        </nav>
      </div>

      {/* ── Sticky Live Deductions & Savings Counter (Part B5) ─────────────── */}
      <LiveTaxCounter
        cantonDeductionsTotal={
          calculation?.canton_deductions_total ??
          (calculation?.breakdown || [])
            .filter((b: any) => Number(b.amount) < 0 || b.rule_key?.includes('deduction'))
            .reduce((acc: number, item: any) => acc + Math.abs(Number(item.amount)), 0)
        }
        totalTax={calculation?.total_tax ?? calculation?.results?.total_tax ?? null}
        cantonCode={taxReturn.canton_code}
      />

      {/* ── MAIN CONTENT CONTAINER (Selected Step) ───────────────────────── */}
      <div className="min-h-[420px]">
        {/* ── Step 1: Start («Kurz zu dir») ──────────────────────────────── */}
        {currentStep === 'start' && (
          <div className="space-y-6">
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/70 border-b pb-4">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>1. Wo hast du am 31. Dezember gewohnt?</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Bestimmt deinen Steuerkanton und deine Wohngemeinde für die definitive Veranlagung.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-4 text-xs">
                <div className="max-w-md space-y-2">
                  <label className="font-bold text-slate-800 block">
                    Postleitzahl (4 Ziffern)
                  </label>
                  <div className="relative">
                    <Input
                      value={startPlz}
                      maxLength={4}
                      onChange={e => setStartPlz(e.target.value.replace(/\D/g, ''))}
                      placeholder="z. B. 8001"
                      className="h-10 text-sm font-mono font-bold bg-white"
                    />
                    {startPlzLoading && (
                      <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-slate-400" />
                    )}
                  </div>

                  {startPlzResult && (
                    <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2">
                      <Check className="h-4 w-4 text-emerald-700 flex-shrink-0" />
                      <span>
                        Kanton <strong>{CANTON_NAMES[startPlzResult.default_canton] || startPlzResult.default_canton} ({startPlzResult.default_canton})</strong> · {startPlzResult.municipalities.length} Gemeinde(n) zugeordnet
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Zivilstand */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/70 border-b pb-4">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>2. Zivilstand per 31. Dezember</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Verheiratete und eingetragene Partnerschaften werden gemeinsam veranlagt.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  {[
                    { id: 'single', label: 'Ledig' },
                    { id: 'married', label: 'Verheiratet / Partnerschaft' },
                    { id: 'divorced', label: 'Geschieden / getrennt' },
                    { id: 'widowed', label: 'Verwitwet' },
                  ].map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setStartCivilStatus(c.id)}
                      className={cn(
                        'p-4 rounded-xl border text-center font-bold transition-all',
                        startCivilStatus === c.id
                          ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20 shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Kinder */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/70 border-b pb-4">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>3. Wie viele Kinder hast du?</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Minderjährig oder in Erstausbildung, für die du Anspruch auf Kinderabzug hast.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5">
                <div className="grid grid-cols-6 gap-2">
                  {[0, 1, 2, 3, 4, 5].map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setStartKids(k)}
                      className={cn(
                        'py-3.5 rounded-xl border text-center font-black transition-all text-sm',
                        startKids === k
                          ? 'border-primary bg-primary/10 text-primary ring-2 ring-primary/20'
                          : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                      )}
                    >
                      {k === 0 ? 'Keine' : k}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Eignungsprüfung (Pre-payment Fit Check) */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/70 border-b pb-4">
                <CardTitle className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  <span>4. Passt SunTax für dich?</span>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Um fehlerhafte Deklarationen zu vermeiden, prüfen wir deine Voraussetzungen vorab:
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-5 space-y-3 text-xs">
                {[
                  'Ich bin angestellt oder pensioniert – nicht selbstständig',
                  'Ich vermiete keine Liegenschaft und habe keine in einem anderen Kanton oder im Ausland (selbst bewohntes Eigenheim ist okay)',
                  'Mein Lohn wird nicht an der Quelle besteuert',
                ].map((crit, idx) => (
                  <label
                    key={idx}
                    className="flex items-start gap-3 p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50/70 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={startFit[idx]}
                      onChange={e => {
                        const copy: [boolean, boolean, boolean] = [...startFit]
                        copy[idx] = e.target.checked
                        setStartFit(copy)
                      }}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                    />
                    <span className="font-semibold text-slate-800">{crit}</span>
                  </label>
                ))}

                {!isFit && (
                  <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2.5">
                    <AlertTriangle className="h-5 w-5 text-amber-700 flex-shrink-0 mt-0.5" />
                    <div>
                      <strong>Nicht unterstützter Fall:</strong> Für Selbstständigkeit, ausserkantonale Liegenschaften oder Quellensteuer ist SunTax aktuell noch nicht freigegeben. Wir erheben dafür keine Gebühr.
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Step 2: Dokumente («Lade alles hoch, was du hast») ────────── */}
        {currentStep === 'documents' && (
          <div className="space-y-6">
            <DocumentUploader
              taxReturnId={id}
              onUploadComplete={loadData}
              uploadedCategories={documents.map(d => d.document_type || '').filter(Boolean)}
            />

            {/* Checklist of core documents */}
            <Card className="border-slate-200 shadow-sm">
              <CardHeader className="bg-slate-50/70 border-b pb-3">
                <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  <span>Ist alles bereit? (Kern-Belege)</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50/50">
                  <span className="font-semibold text-slate-800">
                    Lohnausweis {startCivilStatus === 'married' ? 'Person 1' : ''} (vom Arbeitgeber)
                  </span>
                  {documents.some(d => d.document_type === 'salary_certificate') ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                      hochgeladen ✓
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-500 text-[10px]">
                      noch ausstehend
                    </Badge>
                  )}
                </div>

                {startCivilStatus === 'married' && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50/50">
                    <span className="font-semibold text-slate-800">
                      Lohnausweis Person 2 (falls erwerbstätig)
                    </span>
                    <Badge variant="outline" className="text-slate-500 text-[10px]">
                      optional
                    </Badge>
                  </div>
                )}

                <div className="flex items-center justify-between p-2.5 rounded-lg border bg-slate-50/50">
                  <span className="font-semibold text-slate-800">
                    E-Steuerauszug oder Bank- und Depotauszüge per 31.12.
                  </span>
                  {documents.some(d => d.document_type === 'bank_statement' || d.document_type === 'securities_statement') ? (
                    <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 text-[10px]">
                      hochgeladen ✓
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-500 text-[10px]">
                      im E-Banking herunterladen
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            <DocumentList documents={documents} onDelete={loadData} onRefresh={loadData} />

            {/* Manual entry option */}
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="text-slate-600">
                Keine PDF-Belege zur Hand? Du kannst alle Zahlen in den nächsten Schritten auch manuell eintippen.
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigateToStep('questions')}
                className="text-xs font-semibold text-slate-700 hover:text-primary whitespace-nowrap"
              >
                Alles manuell eingeben →
              </Button>
            </div>
          </div>
        )}

        {/* ── Step 3: Fragen («Nur noch ein paar Fragen») ──────────────── */}
        {currentStep === 'questions' && (
          <TaxQuestions
            profile={profile || { personal_data: {}, income_data: {}, deductions_data: {}, wealth_data: {} } as any}
            taxReturnId={id}
            cantonCode={taxReturn.canton_code}
            taxYear={taxReturn.tax_year}
            onUpdate={loadData}
            onNavigateTab={navigateToStep}
          />
        )}

        {/* ── Step 4: Ergänzen («Haben wir etwas vergessen?») ─────────── */}
        {currentStep === 'complete' && (
          <TaxProfileViewer
            profile={profile || { personal_data: {}, income_data: {}, deductions_data: {}, wealth_data: {} } as any}
            taxReturnId={id}
            cantonCode={taxReturn.canton_code}
            onUpdate={loadData}
            onNavigateTab={navigateToStep}
          />
        )}

        {/* ── Step 5: Kontrolle («Deine Steuererklärung») ──────────────── */}
        {currentStep === 'review' && (
          <TaxCalculationDisplay
            taxReturnId={id}
            calculation={calculation}
            profile={profile}
            cantonCode={taxReturn.canton_code}
            onCalculate={loadData}
            onNavigateTab={navigateToStep}
          />
        )}

        {/* ── Step 6: Einreichen («Bestätigen und einreichen») ─────────── */}
        {currentStep === 'submit' && (
          <FinalReview
            taxReturn={taxReturn}
            profile={profile}
            calculation={calculation}
            onConfirm={loadData}
            onNavigateTab={navigateToStep}
          />
        )}
      </div>

      {/* ── PERSISTENT STEPPER NAVIGATION FOOTER ──────────────────────────── */}
      <div className="sticky bottom-0 z-30 p-4 rounded-2xl bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Button
            type="button"
            variant="outline"
            disabled={currentStepIndex === 0}
            onClick={handleGoPrev}
            className="text-xs font-bold text-slate-700 h-10 px-4 w-1/2 sm:w-auto"
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Zurück
          </Button>

          {currentStepIndex < STEPS.length - 1 && STEPS[currentStepIndex + 1] && (
            <span className="hidden sm:inline text-xs text-slate-400">
              Nächster Schritt: <strong>{STEPS[currentStepIndex + 1]?.shortLabel}</strong>
            </span>
          )}
        </div>

        {nextDisabledHint && (
          <p className="text-xs font-medium text-amber-700 text-center sm:text-right">
            {nextDisabledHint}
          </p>
        )}

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {currentStepIndex < STEPS.length - 1 && STEPS[currentStepIndex + 1] ? (
            <Button
              type="button"
              disabled={nextDisabled || savingStart}
              onClick={handleGoNext}
              className="bg-primary hover:bg-primary-700 text-white font-bold text-xs h-10 px-6 shadow-sm w-full sm:w-auto"
            >
              {savingStart ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : null}
              Weiter zu {STEPS[currentStepIndex + 1]?.shortLabel}
              <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
            </Button>
          ) : (
            <span className="text-xs text-emerald-800 font-bold hidden sm:inline">
              Schritt 6 von 6 erreicht
            </span>
          )}
        </div>
      </div>

      {/* Floating AI Assistant Chat */}
      <TaxAssistant
        taxReturnId={id}
        initialPrompt={assistantPrompt}
        onClearInitialPrompt={() => setAssistantPrompt(null)}
        onNavigateTab={navigateToStep}
      />
    </div>
  )
}
