'use client'

import React, { useState, useEffect, useMemo } from 'react'
import {
  CheckCircle,
  Loader2,
  Sparkles,
  Save,
  Check,
  Bike,
  Car,
  Train,
  Footprints,
  Calendar,
  AlertTriangle,
  Users,
  HeartHandshake,
  ShieldCheck,
  PiggyBank,
  HeartPulse,
  ArrowRight,
  FileQuestion,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxProfile } from '@/types'
import { QuestionInfoTextData } from './ContextualInfoModal'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { formatApiError } from '@/lib/utils'

interface Props {
  profile: TaxProfile
  taxReturnId: string
  cantonCode?: string
  taxYear?: number
  calculation?: any
  onUpdate?: () => void
  onNavigateTab?: (tab: string) => void
  onValidationChange?: (isValid: boolean, missingHint: string) => void
}

function SavingsBadge({ amount, isGerman }: { amount?: number | null; isGerman: boolean }) {
  if (!amount || amount <= 0) return null
  return (
    <span
      data-testid="deduction-savings-badge"
      className="text-[11px] font-bold text-[#1E7B52] bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 whitespace-nowrap"
    >
      {isGerman ? `Spart ca. CHF ${Math.round(amount).toLocaleString('de-CH')}` : `Saves approx. CHF ${Math.round(amount).toLocaleString('de-CH')}`}
    </span>
  )
}

export function TaxQuestions({
  profile,
  taxReturnId,
  cantonCode = 'ZH',
  taxYear = 2025,
  calculation,
  onUpdate,
  onNavigateTab,
  onValidationChange,
}: Props) {
  const { toast } = useToast()
  const { isGerman } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [infoTexts, setInfoTexts] = useState<Record<string, QuestionInfoTextData>>({})
  const [catalogueCards, setCatalogueCards] = useState<any[]>([])

  // Form states based on profile data
  const deductions = (profile?.deductions_data || {}) as Record<string, any>
  const income = (profile?.income_data || {}) as Record<string, any>
  const personal = (profile?.personal_data || {}) as Record<string, any>

  // 1. Commute mode: pt, bike, car, foot
  const [commuteMode, setCommuteMode] = useState<string>(
    deductions.commute_mode || (deductions.commute_bike ? 'bike' : deductions.commute_car ? 'car' : 'pt')
  )
  const [carReason, setCarReason] = useState<string>(deductions.car_reason || '')
  const [commuteKm, setCommuteKm] = useState<number>(
    deductions.commute_km_one_way ??
      (deductions.commute_km_per_day ? Math.round(Number(deductions.commute_km_per_day) / 2) : 15)
  )
  const [workplaceAddress, setWorkplaceAddress] = useState<string>(deductions.workplace_address || '')
  const [oevCost, setOevCost] = useState<number>(deductions.oev_annual_cost || 0)

  // 2. Working days & home office
  const [homeOfficeDaysPerWeek, setHomeOfficeDaysPerWeek] = useState<number>(
    deductions.home_office_days_per_week ?? (deductions.home_office_days ? Math.round(deductions.home_office_days / 48) : 0)
  )
  const [workingDays] = useState<number>(deductions.working_days || 240)
  const [holidays] = useState<number>(deductions.holidays || 25)

  // 3. Meal
  const boxGChecked = Boolean(income.has_canteen || income.field_g_canteen || deductions.has_canteen)
  const [mealType, setMealType] = useState<string>(
    deductions.meal_type || (boxGChecked ? 'cheap' : 'out')
  )

  // 4. Unclear docs resolution
  const [hasUnsureDocs] = useState<boolean>(Boolean(deductions.has_unsure_docs))
  const [unsureDocsResolved, setUnsureDocsResolved] = useState<string>(deductions.unsure_docs_resolved || '')

  // 5 & 6. Partner 2 (if married)
  const numChildren = Number(personal.children_count || personal.number_of_children || (Array.isArray(personal.children) ? personal.children.length : 0) || 0)
  const maritalStatus = String(personal.marital_status || personal.civil_status || 'single').toLowerCase()
  const isMarried = maritalStatus === 'married' || maritalStatus === 'registered_partnership' || maritalStatus === 'verheiratet'
  const [spouseWorks, setSpouseWorks] = useState<string>(
    deductions.spouse_works || (Number(income.employment_income_spouse || 0) > 0 ? 'yes' : '')
  )
  const [spouseSalary, setSpouseSalary] = useState<number>(Number(income.employment_income_spouse || 0))
  const [commuteSpouse, setCommuteSpouse] = useState<string>(
    deductions.commute_spouse !== undefined && deductions.commute_spouse !== null && Number(deductions.commute_spouse) > 0
      ? String(deductions.commute_spouse)
      : ''
  )

  // 7–11. Children & Custody (ESTV KS 30) & Childcare
  const [custodyType, setCustodyType] = useState<string>(deductions.custody_type || personal.custody_type || '')
  const [alimonyReceived, setAlimonyReceived] = useState<string>(deductions.alimony_received_flag || '')
  const [alimonyAmount, setAlimonyAmount] = useState<number>(Number(income.alimony_received || 0))
  const [alimonyFrom, setAlimonyFrom] = useState<string>(String(personal.alimony_received_from || ''))
  const [childResidence, setChildResidence] = useState<string>(deductions.child_residence || '')
  const [higherEarner, setHigherEarner] = useState<string>(deductions.higher_earner || '')
  const [childcareCosts, setChildcareCosts] = useState<number>(Number(deductions.childcare_costs || 0))
  const [childcareType, setChildcareType] = useState<string>(
    deductions.childcare_type || (Number(deductions.childcare_costs || 0) > 0 ? 'external' : '')
  )

  // 12. Pillar 3a & 2026 Retroactive Catch-up (up to CHF 7'258)
  const [p3aAsked, setP3aAsked] = useState<string>(
    deductions.pillar3a_asked || (Number(deductions.pillar3a_contributions || 0) > 0 ? 'yes' : '')
  )
  const [p3aPaid, setP3aPaid] = useState<number>(Number(deductions.pillar3a_contributions || 0))
  const [p3aCatchup, setP3aCatchup] = useState<number>(Number(deductions.pillar3a_catchup || 0))

  // 13. Health insurance premiums
  const [healthPremiumsStr, setHealthPremiumsStr] = useState<string>(
    deductions.health_insurance_premiums !== undefined && deductions.health_insurance_premiums !== null
      ? String(deductions.health_insurance_premiums)
      : ''
  )

  // 14. Church membership (+ spouse confession when married)
  const [confession, setConfession] = useState<string>(
    personal.confession || (personal.is_church_member === false ? 'none' : 'ref')
  )
  const [confessionSpouse, setConfessionSpouse] = useState<string>(String(personal.confession_spouse || ''))

  // Fetch canonical 14-card catalog & info texts
  useEffect(() => {
    api.taxEngine
      .getInfoTexts(cantonCode, taxYear)
      .then(data => setInfoTexts(data))
      .catch(() => {})
    api.rules
      .getQuestions(taxYear, cantonCode)
      .then(data => {
        if (Array.isArray(data?.cards)) setCatalogueCards(data.cards)
      })
      .catch(() => {})
  }, [cantonCode, taxYear])

  // Counterfactual savings lookup from backend calculation (Addendum 1 § 7)
  const savingsByDed = (
    calculation?.savings_analysis?.by_deduction ||
    calculation?.results?.savings_analysis?.by_deduction ||
    {}
  ) as Record<string, number>

  const carRatePerKm = taxYear >= 2026 ? 0.75 : 0.7
  const homeOfficeDaysTotal = homeOfficeDaysPerWeek * 48
  const effectiveDays = Math.max(0, workingDays - homeOfficeDaysTotal - holidays)

  const getCommuteEstimate = () => {
    if (commuteMode === 'bike') return 700
    if (commuteMode === 'car') {
      const annual = carRatePerKm * commuteKm * 2 * effectiveDays
      return Math.min(Math.round(annual), cantonCode === 'ZH' ? 5200 : 3300)
    }
    if (commuteMode === 'pt') return oevCost || 2100
    return 0
  }

  const getMealEstimate = () => {
    if (effectiveDays <= 0 || mealType === 'none') return 0
    if (mealType === 'cheap') return 1600
    return 3200
  }

  const cardById = (id: string) =>
    catalogueCards.find(
      (c: any) => c.id === id || c.legacy_id === id || (Array.isArray(c.aliases) && c.aliases.includes(id))
    )
  const cardTitle = (id: string, numPrefix: string, fallbackEn: string, fallbackDe?: string) => {
    const c = cardById(id)
    if (!isGerman) return `${numPrefix} ${fallbackEn}`
    return c?.title ? `${numPrefix} ${c.title}` : `${numPrefix} ${fallbackDe || fallbackEn}`
  }
  const cardSub = (id: string, fallbackEn: string, fallbackDe?: string) => {
    const c = cardById(id)
    if (!isGerman) return fallbackEn
    if (isMarried && c?.subtitle_married) return c.subtitle_married
    return c?.subtitle || fallbackDe || fallbackEn
  }
  const cardOptLabel = (id: string, value: any, fallbackEn: string, fallbackDe?: string) => {
    if (!isGerman) return fallbackEn
    const opts = cardById(id)?.options || []
    const match = opts.find((o: any) => o.value === value)
    return match?.label || fallbackDe || fallbackEn
  }
  const cardOptNote = (id: string, value: any, fallbackEn: string, fallbackDe?: string) => {
    if (!isGerman) return fallbackEn
    const opts = cardById(id)?.options || []
    const match = opts.find((o: any) => o.value === value)
    return match?.note || fallbackDe || ''
  }
  const cardChipLabel = (id: string, value: string, fallbackEn: string, fallbackDe?: string) => {
    if (!isGerman) return fallbackEn
    const chips = cardById(id)?.chips || []
    const match = chips.find((ch: any) => ch.value === value)
    return match?.label || fallbackDe || fallbackEn
  }

  // Validate required active Step-3 questions directly against questions.json missing_hints
  const missingInfo = useMemo(() => {
    const missingHint = (id: string, fallbackDe: string, fallbackEn: string) => {
      const card = catalogueCards.find(
        (c: any) => c.id === id || c.legacy_id === id || (Array.isArray(c.aliases) && c.aliases.includes(id))
      )
      return isGerman ? (card?.missing_hint || fallbackDe) : fallbackEn
    }
    if (commuteMode === 'car' && !carReason && (!oevCost || oevCost <= 0)) {
      return missingHint(
        'q01_commute',
        'Bitte wähle bei «Auto» den Grund aus (oder gib die alternativen ÖV-Abo-Kosten ein).',
        'Please select why you need a car (or enter alternative public transit pass cost).'
      )
    }
    if (!mealType) {
      return missingHint(
        'q03_meals',
        'Bitte wähle eine Option für deine Mittagsverpflegung (Frage 3).',
        'Please select a lunch option (Question 3).'
      )
    }
    if (hasUnsureDocs && !unsureDocsResolved) {
      return missingHint(
        'q04_unsure_docs',
        'Bitte kläre die unklaren Belege mit Ja oder Nein (Frage 4).',
        'Please clarify unclear receipts with Yes or No (Question 4).'
      )
    }
    if (isMarried && !spouseWorks) {
      return missingHint(
        'q05_partner2_works',
        'Bitte gib an, ob deine Partnerin / dein Partner gearbeitet hat (Frage 5).',
        'Please state whether your partner worked (Question 5).'
      )
    }
    if (!isMarried && numChildren > 0) {
      if (!custodyType) {
        return missingHint('q07_custody', 'Bitte wähle die Sorgerechtsregelung aus (Frage 7).', 'Please select child custody type (Question 7).')
      }
      if (!alimonyReceived) {
        return missingHint('q08_child_alimony_in', 'Bitte beantworte die Frage zu Kinderalimenten (Frage 8).', 'Please answer child alimony question (Question 8).')
      }
      if (custodyType === 'joint' && alimonyReceived === 'no') {
        if (!childResidence) {
          return missingHint('q09_child_residence', 'Bitte gib an, wo die Kinder wohnen (Frage 9).', 'Please select child residence (Question 9).')
        }
        if (childResidence === 'alt' && !higherEarner) {
          return missingHint('q10_higher_earner', 'Bitte wähle aus, wer mehr verdient (Frage 10).', 'Please select higher earner (Question 10).')
        }
      }
    }
    if (numChildren > 0 && !childcareType) {
      return missingHint('q11_childcare', 'Bitte wähle die Kinderbetreuung aus (Frage 11).', 'Please select childcare option (Question 11).')
    }
    if (!p3aAsked) {
      return missingHint(
        'q12_pillar3a',
        'Bitte wähle bei Frage 12 (Säule 3a) «Ja» oder «Nein» aus.',
        'Please choose Yes or No for Question 12 (Pillar 3a).'
      )
    }
    if (p3aAsked === 'yes' && (!p3aPaid || p3aPaid <= 0)) {
      return missingHint(
        'q12_pillar3a',
        'Bitte gib deinen Säule-3a-Einzahlungsbetrag ein (oder wähle Nein).',
        'Please enter your Pillar 3a contribution amount (or choose No).'
      )
    }
    if (healthPremiumsStr.trim() === '') {
      return missingHint(
        'q13_health_insurance',
        'Bitte gib deine bezahlten Krankenkassen-Prämien ein (mindestens 0).',
        'Please enter your health insurance premiums paid (at least 0).'
      )
    }
    if (!confession) {
      return missingHint(
        'q14_confession',
        'Bitte wähle deine Konfession aus (Frage 14).',
        'Please select your religious affiliation (Question 14).'
      )
    }
    return ''
  }, [
    catalogueCards,
    commuteMode,
    carReason,
    oevCost,
    mealType,
    hasUnsureDocs,
    unsureDocsResolved,
    isMarried,
    spouseWorks,
    numChildren,
    custodyType,
    alimonyReceived,
    childResidence,
    higherEarner,
    childcareType,
    p3aAsked,
    p3aPaid,
    healthPremiumsStr,
    confession,
    isGerman,
  ])

  const allAnswered = missingInfo === ''

  useEffect(() => {
    onValidationChange?.(allAnswered, missingInfo)
  }, [allAnswered, missingInfo, onValidationChange])

  const buildPayload = () => {
    const parsedHealth = healthPremiumsStr.trim() === '' ? 0 : Math.max(0, Number(healthPremiumsStr) || 0)
    const updatedDeductions = {
      ...deductions,
      commute_mode: commuteMode,
      car_reason: commuteMode === 'car' ? carReason : '',
      commute_km_one_way: commuteKm,
      commute_km_per_day: commuteKm * 2,
      workplace_address: workplaceAddress,
      oev_annual_cost: oevCost,
      commute_alternative_oev: oevCost,
      home_office_days_per_week: homeOfficeDaysPerWeek,
      home_office_days: homeOfficeDaysTotal,
      working_days: workingDays,
      holidays: holidays,
      meal_type: mealType,
      has_canteen: mealType === 'cheap',
      travel_expenses: getCommuteEstimate(),
      unsure_docs_resolved: unsureDocsResolved,
      spouse_works: spouseWorks,
      commute_spouse: isMarried && spouseWorks === 'yes' ? Number(commuteSpouse || 0) : 0,
      custody_type: custodyType,
      alimony_received_flag: alimonyReceived,
      child_residence: childResidence,
      higher_earner: higherEarner,
      childcare_costs: childcareType === 'external' ? childcareCosts : 0,
      childcare_type: childcareType || 'self',
      pillar3a_asked: p3aAsked,
      pillar3a_contributions: p3aAsked === 'yes' ? Math.min(p3aPaid, 7258) : 0,
      pillar3a_catchup: taxYear >= 2026 && p3aAsked === 'yes' ? Math.min(p3aCatchup, 7258) : 0,
      health_insurance_premiums: parsedHealth,
    }

    const updatedPersonal = {
      ...personal,
      confession: confession,
      confession_spouse: isMarried ? confessionSpouse : undefined,
      is_church_member: confession !== 'none',
      custody_type: custodyType,
      child_residence: childResidence,
      higher_earner: higherEarner,
      alimony_received_from: alimonyReceived === 'yes' ? alimonyFrom : '',
    }

    const updatedIncome = {
      ...income,
      alimony_received: alimonyReceived === 'yes' ? alimonyAmount : 0,
      ...(isMarried && spouseWorks ? { employment_income_spouse: spouseWorks === 'yes' ? spouseSalary : 0 } : {}),
    }

    return { updatedDeductions, updatedPersonal, updatedIncome }
  }

  const persistAnswers = async (navigateAfter?: boolean) => {
    setSaving(true)
    try {
      const { updatedDeductions, updatedPersonal, updatedIncome } = buildPayload()
      await api.taxProfile.update(taxReturnId, {
        deductions_data: updatedDeductions,
        personal_data: updatedPersonal,
        income_data: updatedIncome,
      } as any)

      try {
        await api.taxEngine.calculate(taxReturnId)
      } catch {}

      toast({
        title: isGerman ? 'Angaben erfolgreich gespeichert' : 'Details saved successfully',
        description: isGerman
          ? 'Deine Abzüge wurden neu berechnet und im Steuerprofil aktualisiert.'
          : 'Your deductions have been calculated and updated in your tax profile.',
      })
      await onUpdate?.()
      if (navigateAfter && allAnswered) {
        onNavigateTab?.('complete')
      }
    } catch (err: any) {
      toast({
        title: isGerman ? 'Speichern fehlgeschlagen' : 'Save failed',
        description: formatApiError(err, isGerman ? 'Bitte überprüfe deine Eingaben.' : 'Please review your inputs.'),
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header Card (Schritt 3) ── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-[#ECE8DF] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-emerald-50 text-[#1E7B52] px-2.5 py-0.5 rounded-full border border-emerald-200">
              {isGerman ? 'Schritt 3 von 6' : 'Step 3 of 6'}
            </span>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {isGerman ? 'Nur noch ein paar Fragen' : 'Just a few quick questions'}
            </h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            {isGerman
              ? 'Das steht in keinem Dokument – dauert etwa eine Minute. Wähle einfach die zutreffenden Optionen aus.'
              : 'Details not listed on documents – takes about one minute. Simply select your options.'}
          </p>
        </div>

        <Button
          onClick={() => persistAnswers(false)}
          disabled={saving}
          className="bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-9 px-4 rounded-xl shadow-xs flex items-center gap-1.5 flex-shrink-0"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {isGerman ? 'Antworten speichern' : 'Save answers'}
        </Button>
      </div>

      {/* ── 1. Arbeitsweg ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Train className="h-4 w-4 text-[#1E7B52]" />
              <span>{cardTitle('q01_commute', '1.', 'How do you commute to work?', 'Wie kommst du zur Arbeit?')}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <SavingsBadge amount={savingsByDed.commuting} isGerman={isGerman} />
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {isGerman ? 'Abzug Arbeitsweg:' : 'Commute deduction:'} « ca. CHF {getCommuteEstimate().toLocaleString('de-CH')} »
              </span>
            </div>
          </div>
          <CardDescription className="text-xs text-slate-500">
            {cardSub('q01_commute', 'Choose the transport mode you use on the majority of working days.', 'Wähle, was du meistens nutzt.')}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'pt', labelDe: 'ÖV', labelEn: 'Public Transit', subDe: 'Zug, Bus, Tram', subEn: 'Train, Bus, Tram', icon: Train },
              { id: 'bike', labelDe: 'Velo / E-Bike', labelEn: 'Bicycle / E-Bike', subDe: 'CHF 700 Pauschale', subEn: 'CHF 700 flat fee', icon: Bike },
              { id: 'car', labelDe: 'Auto', labelEn: 'Car', subDe: `CHF ${carRatePerKm.toFixed(2)} / km`, subEn: `CHF ${carRatePerKm.toFixed(2)} / km`, icon: Car },
              { id: 'foot', labelDe: 'Zu Fuss', labelEn: 'On Foot', subDe: 'Kein Abzug', subEn: 'No deduction', icon: Footprints },
            ].map(item => {
              const Icon = item.icon
              const isSelected = commuteMode === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCommuteMode(item.id)}
                  className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isSelected ? 'text-[#1E7B52]' : 'text-slate-400'}`} />
                  <span className="text-xs font-bold">{cardOptLabel('q01_commute', item.id, item.labelEn, item.labelDe)}</span>
                  <span className="text-[11px] text-slate-400">{isGerman ? item.subDe : item.subEn}</span>
                </button>
              )
            })}
          </div>

          {commuteMode === 'car' && (
            <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <div className="text-amber-950 font-medium">
                  <strong>{isGerman ? (cardById('q01_commute')?.chip_title || 'Warum brauchst du das Auto? (Pflicht für den Abzug):') : 'Why do you need the car? (Required for deduction):'}</strong>{' '}
                  {isGerman ? 'Ohne anerkannte Begründung anerkennt das Steueramt grundsätzlich nur die Kosten des öffentlichen Verkehrs.' : 'Without recognized reason, tax authorities only grant public transit costs.'}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {[
                  { id: 'noov', labelDe: 'Kein ÖV vorhanden', labelEn: 'No public transit' },
                  { id: 'time', labelDe: 'Über 1 Std. Zeitersparnis', labelEn: 'Over 1 hr time saving' },
                  { id: 'shift', labelDe: 'Schicht- oder Nachtarbeit', labelEn: 'Shift or night work' },
                  { id: 'health', labelDe: 'Gesundheit (Arztzeugnis)', labelEn: 'Medical certificate' },
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setCarReason(carReason === r.id || carReason === r.labelDe ? '' : r.id)}
                    className={`p-2.5 rounded-xl border text-left font-medium transition-all cursor-pointer ${
                      carReason === r.id || carReason === r.labelDe
                        ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] font-bold shadow-xs'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {cardChipLabel('q01_commute', r.id, r.labelEn, r.labelDe)}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    {isGerman ? 'Arbeitsort (Adresse):' : 'Workplace address:'}
                  </label>
                  <Input
                    value={workplaceAddress}
                    onChange={e => setWorkplaceAddress(e.target.value)}
                    placeholder="Strasse, PLZ Ort"
                    className="h-8 text-xs bg-white rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    {isGerman ? 'Arbeitsweg einfach in km:' : 'One-way commute (km):'}
                  </label>
                  <Input
                    type="number"
                    value={commuteKm}
                    onChange={e => setCommuteKm(Number(e.target.value))}
                    className="h-8 text-xs bg-white font-mono rounded-lg"
                  />
                </div>
              </div>
              {!carReason && (
                <div className="pt-2 border-t border-amber-200">
                  <label className="font-bold text-slate-800 block mb-1">
                    {isGerman ? 'Was würde ein ÖV-Abo kosten? (falls kein Ausnahmegrund)' : 'Alternative ÖV pass annual cost'}
                  </label>
                  <Input
                    type="number"
                    value={oevCost || ''}
                    onChange={e => setOevCost(Number(e.target.value))}
                    placeholder="z. B. 2100"
                    className="h-8 text-xs bg-white font-mono rounded-lg max-w-xs"
                  />
                </div>
              )}
            </div>
          )}

          {commuteMode === 'pt' && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                <span className="font-bold text-slate-800">
                  {isGerman ? 'Kosten deines ÖV-Abos pro Jahr (CHF):' : 'Annual public transit pass costs (CHF):'}
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isGerman ? 'Jahreskosten für ÖV-Abonnemente (GA, Halbtax, Z-Pass). Wird kein Betrag erfasst, schätzen wir die üblichen Zonenabos.' : 'If left blank, standard regional pass rates are estimated.'}
                </p>
              </div>
              <div className="w-36">
                <Input
                  type="number"
                  value={oevCost || ''}
                  onChange={e => setOevCost(Number(e.target.value))}
                  placeholder="z. B. 2100"
                  className="h-8 text-xs bg-white font-mono rounded-lg"
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Homeoffice & Arbeitstage ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-[#1E7B52]" />
            <span>{cardTitle('q02_homeoffice', '2.', 'How often do you work from home?', 'Wie viele Tage pro Woche arbeitest du im Homeoffice?')}</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {cardSub('q02_homeoffice', 'Home office days adjust commute and meal deductions proportionally.', 'An diesen Tagen fallen Arbeitsweg und Mittagessen weg.')}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map(d => (
              <button
                key={d}
                type="button"
                onClick={() => setHomeOfficeDaysPerWeek(d)}
                className={`py-2.5 rounded-xl border text-center font-bold text-xs transition-all cursor-pointer ${
                  homeOfficeDaysPerWeek === d
                    ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                {cardOptLabel('q02_homeoffice', d, d === 0 ? 'Never' : `${d} day${d > 1 ? 's' : ''}`, d === 0 ? 'Keinen' : `${d}`)}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Mittagessen & Verpflegung ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#1E7B52]" />
              <span>{cardTitle('q03_meals', '3.', 'How do you have lunch at work?', 'Wo isst du am Mittag?')}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <SavingsBadge amount={savingsByDed.meals} isGerman={isGerman} />
              <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                {isGerman ? 'Verpflegungsabzug:' : 'Meal deduction:'} « ca. CHF {getMealEstimate().toLocaleString('de-CH')} »
              </span>
            </div>
          </div>
          <CardDescription className="text-xs text-slate-500">
            {cardSub('q03_meals', 'On working days.', 'An Arbeitstagen.')}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { id: 'cheap', labelDe: 'Kantine / Lunch-Checks', labelEn: 'Canteen (Box G)', noteDe: 'vom Arbeitgeber verbilligt', noteEn: 'CHF 1,600 flat' },
              { id: 'out', labelDe: 'Auswärts', labelEn: 'Restaurant / Off-site', noteDe: 'selbst bezahlt', noteEn: 'CHF 3,200 flat' },
              { id: 'shift', labelDe: 'Schicht- / Nachtarbeit', labelEn: 'Shift / Night work', noteDe: 'mind. 8 Std.', noteEn: 'min. 8 hrs' },
              { id: 'none', labelDe: 'Zu Hause', labelEn: 'At Home / No Cost', noteDe: 'kein Abzug', noteEn: 'no deduction' },
            ].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMealType(m.id)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                  mealType === m.id
                    ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] font-bold shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{cardOptLabel('q03_meals', m.id, m.labelEn, m.labelDe)}</span>
                  {mealType === m.id && <Check className="h-4 w-4 text-[#1E7B52]" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{cardOptNote('q03_meals', m.id, m.noteEn, m.noteDe)}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Unklare Belege (conditional when detected) ── */}
      {hasUnsureDocs && (
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileQuestion className="h-4 w-4 text-[#1E7B52]" />
              <span>{cardTitle('q04_unsure_docs', '4.', 'Review unclear receipts (e.g. training)', 'Unklare Belege prüfen (z. B. Weiterbildung)')}</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {cardSub('q04_unsure_docs', 'Indicate whether this expense is job-related.', 'Gib kurz an, ob dieser Beleg beruflich veranlasst ist.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 grid grid-cols-2 gap-3 text-xs">
            {[
              { id: 'yes', labelDe: 'Ja', labelEn: 'Yes (job-related)' },
              { id: 'no', labelDe: 'Nein', labelEn: 'No (private)' },
            ].map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => setUnsureDocsResolved(o.id)}
                className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                  unsureDocsResolved === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52]' : 'border-slate-200 bg-white'
                }`}
              >
                {cardOptLabel('q04_unsure_docs', o.id, o.labelEn, o.labelDe)}
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ── 5 & 6. Person 2 (Verheiratete) ── */}
      {isMarried && (
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1E7B52]" />
              <span>{cardTitle('q05_partner2_works', '5.', 'Did your spouse / partner work?', 'Hat deine Partnerin oder dein Partner gearbeitet?')}</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {cardSub('q05_partner2_works', 'Indicate whether partner 2 earned employment income.', 'Wir haben keinen zweiten Lohnausweis gefunden.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: 'yes', labelDe: 'Ja', labelEn: 'Yes' },
                { id: 'no', labelDe: 'Nein', labelEn: 'No' },
              ].map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSpouseWorks(o.id)}
                  className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                    spouseWorks === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52]' : 'border-slate-200 bg-white'
                  }`}
                >
                  {cardOptLabel('q05_partner2_works', o.id, o.labelEn, o.labelDe)}
                </button>
              ))}
            </div>

            {spouseWorks === 'yes' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    {isGerman ? (cardById('q05_partner2_works')?.followup_fields?.[0]?.label || 'Nettolohn Person 2 (Lohnausweis Ziffer 11)') : 'Partner 2 net salary (CHF)'}
                  </label>
                  <Input
                    type="number"
                    value={spouseSalary || ''}
                    onChange={e => setSpouseSalary(Number(e.target.value))}
                    placeholder="CHF"
                    className="h-8 text-xs bg-white font-mono rounded-lg"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    {cardTitle('q06_partner2_commute', '6.', 'Partner 2 annual commuting cost (optional)', 'Was kostet der Arbeitsweg von Person 2 pro Jahr?')}
                  </label>
                  <Input
                    type="number"
                    value={commuteSpouse}
                    onChange={e => setCommuteSpouse(e.target.value)}
                    placeholder={isGerman ? '0' : '0'}
                    className="h-8 text-xs bg-white font-mono rounded-lg"
                  />
                  {isGerman && cardById('q06_partner2_commute')?.note_empty && (
                    <p className="text-[11px] text-slate-500 mt-1">{cardById('q06_partner2_commute')?.note_empty}</p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 7–10. Sorgerecht & Kinder (Ledige/Geschiedene mit Kindern) ── */}
      {!isMarried && numChildren > 0 && (
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-[#1E7B52]" />
              <span>{isGerman ? '7.–10. Kinder, Sorgerecht & Alimente (ESTV KS 30)' : '7–10. Children, Custody & Alimony'}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            <div>
              <p className="font-bold text-slate-800 mb-2">{isGerman ? (cardById('q07_custody')?.title || 'Wer hat das Sorgerecht für deine Kinder?') : 'Who holds child custody?'}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'sole', labelDe: 'Ich allein', labelEn: 'Sole custody' },
                  { id: 'joint', labelDe: 'Gemeinsam mit anderem Elternteil', labelEn: 'Joint custody' },
                ].map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setCustodyType(o.id)}
                    className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                      custodyType === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52]' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {cardOptLabel('q07_custody', o.id, o.labelEn, o.labelDe)}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="font-bold text-slate-800 mb-2">{isGerman ? (cardById('q08_child_alimony_in')?.title || 'Bekommst du Unterhalt (Alimente) für die Kinder?') : 'Do you receive child alimony?'}</p>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { id: 'yes', labelDe: 'Ja', labelEn: 'Yes' },
                  { id: 'no', labelDe: 'Nein', labelEn: 'No' },
                ].map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setAlimonyReceived(o.id)}
                    className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                      alimonyReceived === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52]' : 'border-slate-200 bg-white'
                    }`}
                  >
                    {cardOptLabel('q08_child_alimony_in', o.id, o.labelEn, o.labelDe)}
                  </button>
                ))}
              </div>
              {alimonyReceived === 'yes' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <Input
                    type="number"
                    value={alimonyAmount || ''}
                    onChange={e => setAlimonyAmount(Number(e.target.value))}
                    placeholder={isGerman ? (cardById('q08_child_alimony_in')?.followup_fields?.[0]?.label || 'Erhalten im Jahr (CHF)') : 'Annual amount (CHF)'}
                    className="h-8 text-xs font-mono"
                  />
                  <Input
                    value={alimonyFrom}
                    onChange={e => setAlimonyFrom(e.target.value)}
                    placeholder={isGerman ? (cardById('q08_child_alimony_in')?.followup_fields?.[1]?.label || 'Von wem (Name, Adresse)') : 'From whom (Name, Address)'}
                    className="h-8 text-xs"
                  />
                </div>
              )}
            </div>

            {custodyType === 'joint' && alimonyReceived === 'no' && (
              <div>
                <p className="font-bold text-slate-800 mb-2">{isGerman ? (cardById('q09_child_residence')?.title || 'Wo wohnen die Kinder?') : 'Where do the children live?'}</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'me', labelDe: 'Hauptsächlich bei mir', labelEn: 'Mainly with me' },
                    { id: 'alt', labelDe: 'Abwechselnd (ca. gleich viel)', labelEn: 'Alternating custody' },
                  ].map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setChildResidence(o.id)}
                      className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                        childResidence === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52]' : 'border-slate-200 bg-white'
                      }`}
                    >
                      {cardOptLabel('q09_child_residence', o.id, o.labelEn, o.labelDe)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {custodyType === 'joint' && alimonyReceived === 'no' && childResidence === 'alt' && (
              <div>
                <p className="font-bold text-slate-800 mb-2">{isGerman ? (cardById('q10_higher_earner')?.title || 'Wer von euch beiden verdient mehr?') : 'Who earns more?'}</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { id: 'me', labelDe: 'Ich', labelEn: 'Me' },
                    { id: 'other', labelDe: 'Der andere Elternteil', labelEn: 'Other parent' },
                  ].map(o => (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setHigherEarner(o.id)}
                      className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                        higherEarner === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52]' : 'border-slate-200 bg-white'
                      }`}
                    >
                      {cardOptLabel('q10_higher_earner', o.id, o.labelEn, o.labelDe)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 11. Fremdbetreuung Kinder (if children > 0) ── */}
      {numChildren > 0 && (
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#1E7B52]" />
                <span>{cardTitle('q11_childcare', '11.', 'Childcare while you work', 'Wer betreut deine Kinder unter 14, während du arbeitest?')}</span>
              </CardTitle>
              <SavingsBadge amount={savingsByDed.childcare} isGerman={isGerman} />
            </div>
            <CardDescription className="text-xs text-slate-500">
              {cardSub('q11_childcare', 'Daycare and after-school childcare costs are deductible.', 'Kosten für Kita, Hort oder Tagesfamilie sind abziehbar.')}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { id: 'external', labelDe: 'Kita, Hort, Tagesfamilie', labelEn: 'Daycare / After-school care' },
                { id: 'self', labelDe: 'Wir selbst / Familie', labelEn: 'Self / Family' },
              ].map(o => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setChildcareType(o.id)}
                  className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                    childcareType === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52]' : 'border-slate-200 bg-white'
                  }`}
                >
                  {cardOptLabel('q11_childcare', o.id, o.labelEn, o.labelDe)}
                </button>
              ))}
            </div>
            {childcareType === 'external' && (
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  {isGerman ? (cardById('q11_childcare')?.followup_fields?.[0]?.label || 'Kosten total pro Jahr (CHF)') : 'Total annual childcare costs (CHF)'}
                </label>
                <Input
                  type="number"
                  value={childcareCosts || ''}
                  onChange={e => setChildcareCosts(Number(e.target.value))}
                  placeholder="z. B. 6000"
                  className="h-8 text-xs font-mono max-w-xs"
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 12. Säule 3a (+ 2026 Nachträglicher Einkauf) ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <PiggyBank className="h-4 w-4 text-[#1E7B52]" />
              <span>{cardTitle('q12_pillar3a', '12.', 'Did you contribute to Pillar 3a?', 'Hast du in die Säule 3a einbezahlt?')}</span>
            </CardTitle>
            <div className="flex items-center gap-2">
              <SavingsBadge amount={savingsByDed.pillar3a} isGerman={isGerman} />
              <SavingsBadge amount={savingsByDed.pillar3a_catchup} isGerman={isGerman} />
            </div>
          </div>
          <CardDescription className="text-xs text-slate-500">
            {isGerman ? (cardById('q12_pillar3a')?.subtitle || 'Ordentlicher Maximalabzug: CHF 7’258.') : 'Ordinary maximum deduction: CHF 7,258.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            {[
              { id: 'yes', labelDe: 'Ja', labelEn: 'Yes (enter amount)' },
              { id: 'no', labelDe: 'Nein', labelEn: 'No contribution' },
            ].map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => setP3aAsked(o.id)}
                className={`p-3 rounded-xl border font-semibold cursor-pointer ${
                  p3aAsked === o.id ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] font-bold' : 'border-slate-200 bg-white'
                }`}
              >
                {cardOptLabel('q12_pillar3a', o.id, o.labelEn, o.labelDe)}
              </button>
            ))}
          </div>

          {p3aAsked === 'yes' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <label className="font-bold text-slate-800 block mb-1">
                  {isGerman ? 'Ordentliche Einzahlung Säule 3a (max. CHF 7’258)' : 'Ordinary Pillar 3a contribution (max CHF 7,258)'}
                </label>
                <Input
                  type="number"
                  max={7258}
                  value={p3aPaid || ''}
                  onChange={e => setP3aPaid(Math.min(Number(e.target.value) || 0, 7258))}
                  placeholder="z. B. 7258"
                  className="h-8 text-xs bg-white font-mono rounded-lg"
                />
              </div>

              {taxYear >= 2026 && (
                <div>
                  <label className="font-bold text-[#1E7B52] block mb-1">
                    {isGerman
                      ? (cardById('q12_pillar3a')?.followup_fields?.[1]?.label || 'Nachträglicher Einkauf Säule 3a (neu ab 2026, max. CHF 7’258)')
                      : 'Pillar 3a retroactive catch-up (from 2026, max CHF 7,258)'}
                  </label>
                  <Input
                    type="number"
                    max={7258}
                    value={p3aCatchup || ''}
                    onChange={e => setP3aCatchup(Math.min(Number(e.target.value) || 0, 7258))}
                    placeholder="z. B. 2000 (optional)"
                    data-testid="pillar3a-catchup-input"
                    className="h-8 text-xs bg-white font-mono rounded-lg border-emerald-300"
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 13. Krankenkassen-Prämien ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <HeartPulse className="h-4 w-4 text-[#1E7B52]" />
              <span>{cardTitle('q13_health_insurance', '13.', 'How much health insurance premium did you pay?', 'Wie viel Krankenkassen-Prämien hast du bezahlt?')}</span>
            </CardTitle>
            <SavingsBadge amount={savingsByDed.health_insurance} isGerman={isGerman} />
          </div>
          <CardDescription className="text-xs text-slate-500">
            {cardSub('q13_health_insurance', 'Listed on your annual health insurer summary (enter 0 if none).', 'Steht auf der Jahresübersicht deiner Krankenkasse.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <Input
            type="number"
            min={0}
            value={healthPremiumsStr}
            onChange={e => setHealthPremiumsStr(e.target.value)}
            placeholder="z. B. 4200 (mindestens 0)"
            data-testid="health-insurance-input"
            className="h-9 text-xs font-mono max-w-xs"
          />
        </CardContent>
      </Card>

      {/* ── 14. Kirchensteuerpflicht ── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HeartHandshake className="h-4 w-4 text-[#1E7B52]" />
            <span>{cardTitle('q14_confession', '14.', 'Are you a member of a recognized national church?', 'Bist du Mitglied einer Landeskirche?')}</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {cardSub('q14_confession', `Only relevant for cantonal church tax in ${cantonCode}. Without membership, no church tax is due.`, `Nur für die Kirchensteuer in ${cantonCode}.`)}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { id: 'ref', labelDe: 'Reformiert', labelEn: 'Evang. Reformed' },
              { id: 'kath', labelDe: 'Röm.-katholisch', labelEn: 'Roman Catholic' },
              { id: 'chk', labelDe: 'Christkatholisch', labelEn: 'Christian Catholic' },
              { id: 'none', labelDe: 'Keine / andere', labelEn: 'None / Other' },
            ].map(k => (
              <button
                key={k.id}
                type="button"
                onClick={() => setConfession(k.id)}
                className={`p-3 rounded-xl border text-center font-semibold transition-all cursor-pointer ${
                  confession === k.id
                    ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] font-bold shadow-xs'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {cardOptLabel('q14_confession', k.id, k.labelEn, k.labelDe)}
              </button>
            ))}
          </div>

          {isMarried && (
            <div className="pt-2">
              <label className="text-xs font-bold text-slate-700 block mb-1">
                {isGerman ? 'Konfession Person 2 (falls abweichend)' : 'Partner 2 confession (optional)'}
              </label>
              <Input
                value={confessionSpouse}
                onChange={e => setConfessionSpouse(e.target.value)}
                placeholder="z. B. keine, reformiert"
                className="h-8 text-xs max-w-xs"
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bottom Validation Hint + Save / Next Step Action */}
      <div className="pt-2 flex flex-col items-end gap-2">
        {!allAnswered && (
          <p
            data-testid="questions-missing-hint"
            className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-2 rounded-xl"
          >
            {missingInfo}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2.5">
          <Button
            onClick={() => persistAnswers(false)}
            disabled={saving}
            variant="outline"
            className="font-bold text-xs h-10 px-5 rounded-xl"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {isGerman ? 'Wird berechnet & gespeichert...' : 'Calculating & saving...'}
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                {isGerman ? 'Antworten speichern' : 'Save answers'}
              </>
            )}
          </Button>

          <Button
            onClick={() => persistAnswers(true)}
            disabled={saving || !allAnswered}
            data-testid="questions-next-btn"
            className="bg-[#1E7B52] hover:bg-[#165C3D] disabled:opacity-50 text-white font-bold text-xs h-10 px-6 rounded-xl shadow-xs flex items-center gap-1.5"
          >
            <span>{isGerman ? 'Weiter' : 'Next'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  )
}
