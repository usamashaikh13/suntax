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
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { BRAND } from '@/lib/brand'
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
  User,
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
  titleDe: string
  titleEn: string
  shortLabelDe: string
  shortLabelEn: string
  subtitleDe: string
  subtitleEn: string
}

const STEPS_CONFIG: StepConfig[] = [
  {
    id: 'start',
    stepNum: 1,
    titleDe: 'Kurz zu dir',
    titleEn: 'About you',
    shortLabelDe: 'Start',
    shortLabelEn: 'Start',
    subtitleDe: 'Wohnort, Zivilstand und Eignung – damit wir die richtigen kantonalen Steuerregeln anwenden.',
    subtitleEn: 'Residence, civil status, and eligibility – so we apply the right cantonal tax rules.',
  },
  {
    id: 'documents',
    stepNum: 2,
    titleDe: 'Lade alles hoch, was du hast',
    titleEn: 'Upload your documents',
    shortLabelDe: 'Dokumente',
    shortLabelEn: 'Documents',
    subtitleDe: 'Lohnausweis, Bankauszug, Belege – wir lesen sie aus und ordnen alles der richtigen Stelle zu.',
    subtitleEn: 'Salary certificate, bank statements, receipts – we extract and assign everything automatically.',
  },
  {
    id: 'questions',
    stepNum: 3,
    titleDe: 'Nur noch ein paar Fragen',
    titleEn: 'A few quick questions',
    shortLabelDe: 'Fragen',
    shortLabelEn: 'Questions',
    subtitleDe: 'Das steht in keinem Dokument – Arbeitsweg, Homeoffice, Mittagessen und Sorgerecht.',
    subtitleEn: 'Details not found on documents – commute, home office, meals, and custody.',
  },
  {
    id: 'complete',
    stepNum: 4,
    titleDe: 'Haben wir etwas vergessen?',
    titleEn: 'Complete your profile',
    shortLabelDe: 'Ergänzen',
    shortLabelEn: 'Complete',
    subtitleDe: 'Ergänze fehlende Einkünfte, Abzüge oder dein Wertschriften- und Guthabenverzeichnis.',
    subtitleEn: 'Add any additional income, deductions, or securities and accounts.',
  },
  {
    id: 'review',
    stepNum: 5,
    titleDe: 'Deine Steuererklärung',
    titleEn: 'Tax calculation review',
    shortLabelDe: 'Kontrolle',
    shortLabelEn: 'Review',
    subtitleDe: 'Gegenüberstellung für Kanton und Bund auf einen Blick. Jeder Wert lässt sich anpassen.',
    subtitleEn: 'Comparison of cantonal and federal tax at a glance. Every value can be adjusted.',
  },
  {
    id: 'submit',
    stepNum: 6,
    titleDe: 'Bestätigen und einreichen',
    titleEn: 'Confirm and submit',
    shortLabelDe: 'Einreichen',
    shortLabelEn: 'Submit',
    subtitleDe: 'Rechtsgültige Bestätigung nach Art. 110 & 113 DBG, Bezahlung CHF 39 und offizieller eCH-0119 Export.',
    subtitleEn: 'Legally binding declaration under Art. 110 & 113 DBG, CHF 39 fee, and official eCH-0119 export.',
  },
]

export default function TaxReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { toast } = useToast()
  const { isGerman, dict } = useTranslation()

  const [taxReturn, setTaxReturn] = useState<TaxReturn | null>(null)
  const [profile, setProfile] = useState<TaxProfile | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [calculation, setCalculation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Six-step state
  const [currentStep, setCurrentStep] = useState<FlowStep>('start')
  const [assistantPrompt, setAssistantPrompt] = useState<string | null>(null)
  const [questionsValid, setQuestionsValid] = useState<boolean>(true)
  const [questionsMissingHint, setQuestionsMissingHint] = useState<string>('')

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
  const [startDob, setStartDob] = useState<string>('')
  const [startAhv, setStartAhv] = useState<string>('')
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
          if (pd.date_of_birth || pd.birth_date) setStartDob(pd.date_of_birth || pd.birth_date)
          if (pd.ahv_number || pd.vn) setStartAhv(pd.ahv_number || pd.vn)
        }
      } catch {}

      try {
        const calc = await api.taxEngine.getCalculation(id)
        setCalculation(calc)
      } catch {}
    } catch {
      toast({
        title: isGerman ? 'Steuererklärung konnte nicht geladen werden' : 'Could not load tax return',
        variant: 'destructive',
      })
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
    if (urlStep && STEPS_CONFIG.some(s => s.id === urlStep)) {
      setCurrentStep(urlStep)
      return
    }

    try {
      const savedStep = localStorage.getItem(`suntax_step_${id}`) as FlowStep | null
      if (savedStep && STEPS_CONFIG.some(s => s.id === savedStep)) {
        setCurrentStep(savedStep)
      }
    } catch {}
  }, [id, searchParams])

  // Save step on change
  const navigateToStep = (step: FlowStep | string) => {
    const target = STEPS_CONFIG.some(s => s.id === step) ? (step as FlowStep) : 'start'
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
        title: isGerman ? 'Nicht unterstützter Steuerfall' : 'Unsupported tax scenario',
        description: isGerman
          ? `${BRAND.name} unterstützt aktuell nur unselbstständig Erwerbstätige und Rentner ohne ausserkantonale Liegenschaften.`
          : `${BRAND.name} currently supports only employed persons and pensioners without out-of-canton properties.`,
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
          ...(startDob ? { date_of_birth: startDob } : {}),
          ...(startAhv ? { ahv_number: startAhv } : {}),
        },
      } as any)

      await loadData()
      toast({
        title: isGerman ? 'Angaben aktualisiert' : 'Details saved',
        description: isGerman ? 'Deine Startangaben wurden gespeichert.' : 'Your initial details have been saved.',
      })
      navigateToStep('documents')
    } catch (err: any) {
      toast({
        title: isGerman ? 'Speichern fehlgeschlagen' : 'Save failed',
        description: err?.response?.data?.detail || (isGerman ? 'Bitte überprüfe deine Angaben.' : 'Please check your inputs.'),
        variant: 'destructive',
      })
    } finally {
      setSavingStart(false)
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-3">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-[#1E7B52] border-t-transparent" />
        <p className="text-xs font-semibold text-slate-500">
          {isGerman ? 'Steuererklärung wird geladen ...' : 'Loading tax return ...'}
        </p>
      </div>
    )
  }

  if (!taxReturn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] gap-3 text-slate-800">
        <AlertCircle className="h-9 w-9 text-red-600" />
        <p className="text-sm font-bold">
          {isGerman ? 'Steuererklärung nicht gefunden.' : 'Tax return not found.'}
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/tax-returns">
            {isGerman ? 'Zurück zur Übersicht' : 'Back to overview'}
          </Link>
        </Button>
      </div>
    )
  }

  const cantonName = CANTON_NAMES[taxReturn.canton_code] || taxReturn.canton_code
  const currentStepConfig = STEPS_CONFIG.find(s => s.id === currentStep) ?? STEPS_CONFIG[0]!
  const currentStepIndex = STEPS_CONFIG.findIndex(s => s.id === currentStep)

  // Next disabled logic and clear hints
  const hasReadingDocs = documents.some(d => d.processing_status === 'processing' || d.processing_status === 'queued')
  const isFit = startFit[0] && startFit[1] && startFit[2]

  let nextDisabled = false
  let nextDisabledHint = ''

  if (currentStep === 'start') {
    if (!isFit) {
      nextDisabled = true
      nextDisabledHint = isGerman
        ? `Für diesen Fall ist ${BRAND.name} noch nicht gemacht. Bitte überprüfe die Eignungskriterien.`
        : `${BRAND.name} is not yet available for this scenario. Please review eligibility criteria.`
    }
  } else if (currentStep === 'documents') {
    if (hasReadingDocs) {
      nextDisabled = true
      nextDisabledHint = isGerman
        ? 'Einen Moment bitte – deine Dokumente werden noch eingelesen.'
        : 'Please wait – your documents are still being processed.'
    }
  } else if (currentStep === 'questions' && !questionsValid) {
    nextDisabled = true
    nextDisabledHint = questionsMissingHint
  }

  const handleGoNext = () => {
    if (currentStepIndex < STEPS_CONFIG.length - 1) {
      if (currentStep === 'start') {
        handleSaveStart()
      } else {
        const nextStep = STEPS_CONFIG[currentStepIndex + 1]
        if (nextStep) navigateToStep(nextStep.id)
      }
    }
  }

  const handleGoPrev = () => {
    if (currentStepIndex > 0) {
      const prevStep = STEPS_CONFIG[currentStepIndex - 1]
      if (prevStep) navigateToStep(prevStep.id)
    }
  }

  const nextStepConfig = currentStepIndex < STEPS_CONFIG.length - 1 ? STEPS_CONFIG[currentStepIndex + 1] : null

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-20">
      {/* ── Breadcrumb ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <Link href="/tax-returns" className="hover:text-slate-900 transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> {isGerman ? 'Meine Steuererklärungen' : 'My Tax Returns'}
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-semibold">{cantonName} {taxReturn.tax_year}</span>
        <span>/</span>
        <span className="text-[#1E7B52] font-bold">
          {isGerman ? currentStepConfig.shortLabelDe : currentStepConfig.shortLabelEn}
        </span>
      </div>

      {/* ── Sub-header: Horizontal 6-Step Stepper (app_rendered.html Lines 467-481) ── */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-[#ECE8DF] shadow-xs">
        {/* Desktop 6-step progress */}
        <div className="hidden sm:grid grid-cols-6 gap-3">
          {STEPS_CONFIG.map((s, idx) => {
            const isDone = idx < currentStepIndex
            const isCurrent = idx === currentStepIndex
            const label = isGerman ? s.shortLabelDe : s.shortLabelEn
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => navigateToStep(s.id)}
                className="group text-left block w-full focus:outline-none transition-all cursor-pointer"
              >
                {/* 4px bar indicator */}
                <div
                  className={cn(
                    'h-1 rounded-sm w-full transition-all duration-200',
                    isDone
                      ? 'bg-[#145C3B]'
                      : isCurrent
                      ? 'bg-[#1E7B52]'
                      : 'bg-[#E4E4E2]'
                  )}
                />
                {/* Badge and Title */}
                <div className="flex items-center gap-1.5 mt-2.5 truncate">
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full inline-flex items-center justify-center text-[10.5px] font-bold flex-shrink-0 transition-all',
                      isDone
                        ? 'bg-[#145C3B] text-white'
                        : isCurrent
                        ? 'bg-[#1E7B52] text-white'
                        : 'bg-[#EEEEEE] text-slate-500'
                    )}
                  >
                    {isDone ? '✓' : s.stepNum}
                  </span>
                  <span
                    className={cn(
                      'text-xs truncate transition-colors',
                      isCurrent
                        ? 'font-bold text-slate-900'
                        : isDone
                        ? 'font-semibold text-slate-800'
                        : 'font-medium text-slate-400 group-hover:text-slate-600'
                    )}
                  >
                    {label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>

        {/* Mobile progress indicator */}
        <div className="block sm:hidden">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-bold text-slate-900">
              {isGerman ? `Schritt ${currentStepConfig.stepNum} von 6` : `Step ${currentStepConfig.stepNum} of 6`}
            </span>
            <span className="font-semibold text-[#1E7B52]">
              {isGerman ? currentStepConfig.titleDe : currentStepConfig.titleEn}
            </span>
          </div>
          <div className="grid grid-cols-6 gap-1.5">
            {STEPS_CONFIG.map((s, idx) => (
              <div
                key={s.id}
                className={cn(
                  'h-1 rounded-sm',
                  idx < currentStepIndex
                    ? 'bg-[#145C3B]'
                    : idx === currentStepIndex
                    ? 'bg-[#1E7B52]'
                    : 'bg-[#E4E4E2]'
                )}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── TWO-COLUMN MAIN CONTENT (app_rendered.html Lines 603-608) ──────── */}
      <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* ── LEFT COLUMN: Active Step Form (Flex 999 1 600px) ──────────────── */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Step Header */}
          <div className="space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-[#1E7B52]">
              {isGerman ? `Schritt ${currentStepConfig.stepNum} von 6` : `Step ${currentStepConfig.stepNum} of 6`}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {isGerman ? currentStepConfig.titleDe : currentStepConfig.titleEn}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl">
              {isGerman ? currentStepConfig.subtitleDe : currentStepConfig.subtitleEn}
            </p>
          </div>

          {/* ── Step 1: Start («Kurz zu dir») ──────────────────────────────── */}
          {currentStep === 'start' && (
            <div className="space-y-5">
              {/* Wohnort */}
              <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#1E7B52]" />
                    <span>{isGerman ? '1. Wo hast du am 31. Dezember gewohnt?' : '1. Where did you reside on December 31st?'}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isGerman
                      ? 'Daraus ermitteln wir deinen Steuerkanton und deine Wohngemeinde für die definitive Veranlagung.'
                      : 'Determines your cantonal and municipal tax authority for the official tax assessment.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-4 text-xs">
                  <div className="max-w-xs space-y-1.5">
                    <label className="font-bold text-slate-800 block text-xs">
                      {isGerman ? 'Postleitzahl (4 Ziffern)' : 'Postal Code (4 digits)'}
                    </label>
                    <div className="relative">
                      <Input
                        value={startPlz}
                        maxLength={4}
                        onChange={e => setStartPlz(e.target.value.replace(/\D/g, ''))}
                        placeholder="z. B. 8001"
                        className="h-10 text-sm font-mono font-bold bg-white rounded-xl border-slate-300 focus:border-[#1E7B52]"
                      />
                      {startPlzLoading && (
                        <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3 text-slate-400" />
                      )}
                    </div>

                    {startPlzResult && (
                      <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-950 text-xs flex items-center gap-2 mt-2">
                        <Check className="h-4 w-4 text-emerald-700 flex-shrink-0" />
                        <span>
                          {isGerman ? 'Kanton' : 'Canton'}{' '}
                          <strong>{CANTON_NAMES[startPlzResult.default_canton] || startPlzResult.default_canton} ({startPlzResult.default_canton})</strong> · {startPlzResult.municipalities.length} {isGerman ? 'Gemeinde(n)' : 'municipalities'}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Zivilstand */}
              <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="h-4 w-4 text-[#1E7B52]" />
                    <span>{isGerman ? '2. Zivilstand per 31. Dezember' : '2. Civil status as of December 31st'}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isGerman
                      ? 'Verheiratete und eingetragene Partnerschaften werden gemeinsam veranlagt (Art. 9 DBG).'
                      : 'Married couples and registered partnerships are taxed jointly (Art. 9 DBG).'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    {[
                      { id: 'single', labelDe: 'Ledig', labelEn: 'Single' },
                      { id: 'married', labelDe: 'Verheiratet / Partnerschaft', labelEn: 'Married / Partnership' },
                      { id: 'divorced', labelDe: 'Geschieden / getrennt', labelEn: 'Divorced / separated' },
                      { id: 'widowed', labelDe: 'Verwitwet', labelEn: 'Widowed' },
                    ].map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setStartCivilStatus(c.id)}
                        className={cn(
                          'p-3.5 rounded-xl border text-center font-bold transition-all cursor-pointer',
                          startCivilStatus === c.id
                            ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] shadow-xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        )}
                      >
                        {isGerman ? c.labelDe : c.labelEn}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Kinder */}
              <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="h-4 w-4 text-[#1E7B52]" />
                    <span>{isGerman ? '3. Wie viele Kinder hast du?' : '3. How many children do you have?'}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isGerman
                      ? 'Minderjährig oder in Erstausbildung, für die du Anspruch auf Kinderabzug hast.'
                      : 'Minors or in initial education qualifying for child tax deductions.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-6 gap-2">
                    {[0, 1, 2, 3, 4, 5].map(k => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setStartKids(k)}
                        className={cn(
                          'py-3 rounded-xl border text-center font-black transition-all text-xs cursor-pointer',
                          startKids === k
                            ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] shadow-xs'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                        )}
                      >
                        {k === 0 ? (isGerman ? 'Keine' : 'None') : k === 5 ? '5+' : k}
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Persönliche Angaben / AHV & Geburtsdatum */}
              <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <User className="h-4 w-4 text-[#1E7B52]" />
                    <span>{isGerman ? '4. Persönliche Angaben (AHV-Nummer & Geburtsdatum)' : '4. Personal Details (AHV number & Date of birth)'}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isGerman
                      ? 'Diese Angaben sind für den offiziellen Steuer-Export (eCH-0119) und den PDF-Auszug erforderlich.'
                      : 'Required for official cantonal tax export (eCH-0119) and the PDF tax summary.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-800 block text-xs">
                        {isGerman ? 'Geburtsdatum' : 'Date of Birth'}
                      </label>
                      <Input
                        type="date"
                        value={startDob}
                        onChange={e => setStartDob(e.target.value)}
                        className="h-10 text-xs font-mono font-medium bg-white rounded-xl border-slate-300 focus:border-[#1E7B52]"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-bold text-slate-800 block text-xs">
                        {isGerman ? 'AHV-Nummer (756.xxxx.xxxx.xx)' : 'AHV / OASI Number'}
                      </label>
                      <Input
                        type="text"
                        value={startAhv}
                        onChange={e => setStartAhv(e.target.value)}
                        placeholder="756.0000.0000.00"
                        className="h-10 text-xs font-mono font-medium bg-white rounded-xl border-slate-300 focus:border-[#1E7B52]"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Eignungsprüfung */}
              <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
                <CardHeader className="pb-3 border-b border-slate-100">
                  <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-[#1E7B52]" />
                    <span>{isGerman ? `5. Passt ${BRAND.name} für dich?` : `5. Is ${BRAND.name} right for your tax profile?`}</span>
                  </CardTitle>
                  <CardDescription className="text-xs text-slate-500">
                    {isGerman
                      ? 'Um fehlerhafte Deklarationen zu vermeiden, prüfen wir deine Voraussetzungen vorab:'
                      : 'To prevent incorrect filings, we verify your eligibility before payment:'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="pt-4 space-y-2.5 text-xs">
                  {[
                    {
                      de: 'Ich bin angestellt oder pensioniert – nicht selbstständig',
                      en: 'I am employed or retired – not self-employed',
                    },
                    {
                      de: 'Ich vermiete keine Liegenschaft und habe keine in einem anderen Kanton oder im Ausland',
                      en: 'I do not rent out properties and have no real estate in other cantons or abroad',
                    },
                    {
                      de: 'Mein Lohn wird nicht an der Quelle besteuert',
                      en: 'My salary is not taxed at source (withholding tax)',
                    },
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
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E7B52] focus:ring-[#1E7B52]"
                      />
                      <span className="font-semibold text-slate-800">
                        {isGerman ? crit.de : crit.en}
                      </span>
                    </label>
                  ))}

                  {!isFit && (
                    <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2.5 mt-2">
                      <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                      <div>
                        <strong>{isGerman ? 'Nicht unterstützter Fall:' : 'Unsupported scenario:'}</strong>{' '}
                        {isGerman
                          ? `Für Selbstständigkeit, ausserkantonale Liegenschaften oder Quellensteuer ist ${BRAND.name} aktuell noch nicht freigegeben. Wir erheben dafür keine Gebühr.`
                          : `${BRAND.name} is not yet certified for self-employment, out-of-canton properties, or source tax. No fee is charged.`}
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

              <DocumentList documents={documents} onDelete={loadData} onRefresh={loadData} />

              {/* Manual entry option */}
              <div className="p-4 rounded-2xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="text-slate-600">
                  {isGerman
                    ? 'Keine PDF-Belege zur Hand? Du kannst alle Zahlen in den nächsten Schritten auch manuell erfassen.'
                    : 'No digital PDF slips available? You can manually enter all numbers in the next steps.'}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigateToStep('questions')}
                  className="text-xs font-semibold text-slate-700 hover:text-[#1E7B52] whitespace-nowrap"
                >
                  {isGerman ? 'Alles manuell eingeben →' : 'Enter everything manually →'}
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
              calculation={calculation}
              onUpdate={loadData}
              onNavigateTab={navigateToStep}
              onValidationChange={(valid, hint) => {
                setQuestionsValid(valid)
                setQuestionsMissingHint(hint)
              }}
            />
          )}

          {/* ── Step 4: Ergänzen («Haben wir etwas vergessen?») ─────────── */}
          {currentStep === 'complete' && (
            <TaxProfileViewer
              profile={profile || { personal_data: {}, income_data: {}, deductions_data: {}, wealth_data: {} } as any}
              taxReturnId={id}
              cantonCode={taxReturn.canton_code}
              taxYear={taxReturn.tax_year}
              calculation={calculation}
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

          {/* ── STEP NAVIGATION BAR (IN-FLOW, NON-OBSTRUCTIVE) ─────────────── */}
          <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={currentStepIndex === 0}
              onClick={handleGoPrev}
              className="text-xs font-bold text-slate-700 h-11 px-5 rounded-xl w-full sm:w-auto"
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              {isGerman ? 'Zurück' : 'Back'}
            </Button>

            {nextDisabledHint && (
              <p className="text-xs font-medium text-amber-700 text-center sm:text-right">
                {nextDisabledHint}
              </p>
            )}

            {currentStepIndex < STEPS_CONFIG.length - 1 && nextStepConfig ? (
              <Button
                type="button"
                disabled={nextDisabled || savingStart}
                onClick={handleGoNext}
                className="bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-11 px-7 rounded-xl shadow-sm w-full sm:w-auto flex items-center justify-center gap-2"
              >
                {savingStart ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                <span>
                  {isGerman
                    ? `Weiter zu ${nextStepConfig.shortLabelDe}`
                    : `Continue to ${nextStepConfig.shortLabelEn}`}
                </span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <span className="text-xs text-emerald-800 font-bold hidden sm:inline">
                {isGerman ? 'Schritt 6 von 6 erreicht' : 'Step 6 of 6 reached'}
              </span>
            )}
          </div>
        </div>

        {/* ── RIGHT COLUMN: Live Summary Aside & Tips (Flex 1 1 300px) ──────── */}
        <aside className="w-full lg:w-80 flex-shrink-0 lg:sticky lg:top-20 space-y-4">
          <LiveTaxCounter
            taxReturnId={id}
            cantonDeductionsTotal={
              calculation?.results?.canton_deductions_total ??
              calculation?.canton_deductions_total ??
              (calculation?.breakdown || [])
                .filter((b: any) => Number(b.amount) < 0 && b.rule_key !== 'wealth_social_deduction' && b.rule_key !== 'liabilities')
                .reduce((acc: number, item: any) => acc + Math.abs(Number(item.amount)), 0)
            }
            federalDeductionsTotal={
              calculation?.results?.federal_deductions_total ??
              calculation?.federal_deductions_total ??
              (calculation?.breakdown || [])
                .filter((b: any) => Number(b.amount) < 0 && b.rule_key !== 'wealth_social_deduction' && b.rule_key !== 'liabilities')
                .reduce((acc: number, item: any) => acc + Math.abs(Number(item.amount)), 0)
            }
            grossIncome={
              calculation?.gross_income ??
              Number((profile?.income_data as any)?.employment_income || (profile?.income_data as any)?.gross_salary || 0)
            }
            taxableIncome={calculation?.results?.taxable_income ?? calculation?.taxable_income ?? null}
            taxableWealth={calculation?.results?.taxable_wealth ?? calculation?.taxable_wealth ?? null}
            federalTax={calculation?.results?.federal_income_tax ?? calculation?.federal_income_tax ?? null}
            cantonalTax={
              (calculation?.results?.cantonal_income_tax ?? calculation?.cantonal_income_tax ?? null) !== null
                ? Number(calculation?.results?.cantonal_income_tax ?? calculation?.cantonal_income_tax ?? 0) +
                  Number(calculation?.results?.municipal_income_tax ?? calculation?.municipal_income_tax ?? 0)
                : null
            }
            totalTax={calculation?.total_tax ?? calculation?.results?.total_tax ?? null}
            vstRefund={calculation?.vst_refund ?? 0}
            cantonCode={taxReturn.canton_code}
            savingsAnalysis={calculation?.savings_analysis ?? calculation?.results?.savings_analysis ?? null}
          />

          {/* AI Assistant Help Trigger */}
          <div className="bg-white rounded-2xl p-4 border border-[#ECE8DF] shadow-xs">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                setAssistantPrompt(
                  isGerman
                    ? `Wie funktioniert die Einreichung im Kanton ${cantonName}?`
                    : `How does tax filing work in Canton ${cantonName}?`
                )
              }
              className="w-full border-[#1E7B52]/30 text-[#1E7B52] bg-[#1E7B52]/5 hover:bg-[#1E7B52]/10 flex items-center justify-center gap-1.5 text-xs font-bold h-10 rounded-xl"
            >
              <MessageCircle className="h-4 w-4 text-[#1E7B52]" />
              {isGerman ? 'Frage zu dieser Seite' : 'Questions about this step?'}
            </Button>
          </div>
        </aside>
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
