'use client'

import React, { useState, useEffect } from 'react'
import {
  CheckCircle,
  HelpCircle,
  Loader2,
  AlertCircle,
  Sparkles,
  Save,
  Check,
  Bike,
  Car,
  Train,
  Footprints,
  Calendar,
  AlertTriangle,
  Info,
  DollarSign,
  Users,
  HeartHandshake
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxProfile } from '@/types'
import { ContextualInfoModal, QuestionInfoTextData } from './ContextualInfoModal'

interface Props {
  profile: TaxProfile
  taxReturnId: string
  cantonCode?: string
  taxYear?: number
  onUpdate?: () => void
  onNavigateTab?: (tab: string) => void
}

export function TaxQuestions({ profile, taxReturnId, cantonCode = 'ZH', taxYear = 2025, onUpdate, onNavigateTab }: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [infoTexts, setInfoTexts] = useState<Record<string, QuestionInfoTextData>>({})

  // Form states based on profile data
  const deductions = (profile.deductions_data || {}) as Record<string, any>
  const income = (profile.income_data || {}) as Record<string, any>
  const personal = (profile.personal_data || {}) as Record<string, any>

  // Commute mode: pt, bike, car, foot
  const [commuteMode, setCommuteMode] = useState<string>(
    deductions.commute_mode || (deductions.commute_bike ? 'bike' : deductions.commute_car ? 'car' : 'pt')
  )
  const [carReason, setCarReason] = useState<string>(deductions.car_reason || '')
  const [commuteKm, setCommuteKm] = useState<number>(deductions.commute_km_per_day || 15)
  const [workplaceAddress, setWorkplaceAddress] = useState<string>(deductions.workplace_address || '')
  const [oevCost, setOevCost] = useState<number>(deductions.oev_annual_cost || 0)

  // Working days & home office
  const [homeOfficeDaysPerWeek, setHomeOfficeDaysPerWeek] = useState<number>(
    deductions.home_office_days_per_week ?? (deductions.home_office_days ? Math.round(deductions.home_office_days / 48) : 0)
  )
  const [workingDays, setWorkingDays] = useState<number>(deductions.working_days || 240)
  const [holidays, setHolidays] = useState<number>(deductions.holidays || 25)

  // Meal
  const boxGChecked = Boolean(income.has_canteen || income.field_g_canteen || deductions.has_canteen)
  const [mealType, setMealType] = useState<string>(
    deductions.meal_type || (boxGChecked ? 'cheap' : 'out')
  )

  // Children & Custody (ESTV KS 30)
  const numChildren = Number(personal.children_count || personal.number_of_children || 0)
  const maritalStatus = personal.marital_status || 'single'
  const isMarried = maritalStatus === 'married' || maritalStatus === 'registered_partnership'
  const [custodyType, setCustodyType] = useState<string>(deductions.custody_type || personal.custody_type || 'joint')
  const [alimonyReceived, setAlimonyReceived] = useState<string>(deductions.alimony_received_flag || 'no')
  const [alimonyAmount, setAlimonyAmount] = useState<number>(income.alimony_received || 0)
  const [childResidence, setChildResidence] = useState<string>(deductions.child_residence || 'me')
  const [higherEarner, setHigherEarner] = useState<string>(deductions.higher_earner || 'me')
  const [childcareCosts, setChildcareCosts] = useState<number>(deductions.childcare_costs || 0)
  const [childcareType, setChildcareType] = useState<string>(
    deductions.childcare_type || (childcareCosts > 0 ? 'external' : 'self')
  )

  // Pillar 3a & Health insurance
  const [p3aPaid, setP3aPaid] = useState<number>(deductions.pillar3a_contributions || 0)
  const [healthPremiums, setHealthPremiums] = useState<number>(deductions.health_insurance_premiums || 0)

  // Church membership
  const [confession, setConfession] = useState<string>(
    personal.confession || (personal.is_church_member === false ? 'none' : 'ref')
  )

  // Fetch info texts
  useEffect(() => {
    api.taxEngine
      .getInfoTexts(cantonCode, taxYear)
      .then(data => setInfoTexts(data))
      .catch(() => {})
  }, [cantonCode, taxYear])

  // Effective days calculation
  const homeOfficeDaysTotal = homeOfficeDaysPerWeek * 48
  const effectiveDays = Math.max(0, workingDays - homeOfficeDaysTotal - holidays)

  // Commute preview
  const getCommuteEstimate = () => {
    if (commuteMode === 'bike') return 700
    if (commuteMode === 'car') {
      const annual = 0.70 * commuteKm * 2 * effectiveDays
      return Math.min(annual, cantonCode === 'ZH' ? 5200 : 3300)
    }
    if (commuteMode === 'pt') return oevCost || 2100
    return 0
  }

  const getMealEstimate = () => {
    if (effectiveDays <= 0 || mealType === 'none') return 0
    if (mealType === 'cheap') return 1600
    return 3200
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updatedDeductions = {
        ...deductions,
        commute_mode: commuteMode,
        car_reason: commuteMode === 'car' ? carReason : '',
        commute_km_per_day: commuteKm,
        workplace_address: workplaceAddress,
        oev_annual_cost: oevCost,
        home_office_days_per_week: homeOfficeDaysPerWeek,
        home_office_days: homeOfficeDaysTotal,
        working_days: workingDays,
        holidays: holidays,
        meal_type: mealType,
        has_canteen: mealType === 'cheap',
        travel_expenses: getCommuteEstimate(),
        custody_type: custodyType,
        alimony_received_flag: alimonyReceived,
        child_residence: childResidence,
        higher_earner: higherEarner,
        childcare_costs: childcareType === 'external' ? childcareCosts : 0,
        childcare_type: childcareType,
        pillar3a_contributions: p3aPaid,
        health_insurance_premiums: healthPremiums,
      }

      const updatedPersonal = {
        ...personal,
        confession: confession,
        is_church_member: confession !== 'none',
        custody_type: custodyType,
        child_residence: childResidence,
        higher_earner: higherEarner,
      }

      const updatedIncome = {
        ...income,
        alimony_received: alimonyReceived === 'yes' ? alimonyAmount : 0,
      }

      await api.taxProfile.update(taxReturnId, {
        deductions_data: updatedDeductions,
        personal_data: updatedPersonal,
        income_data: updatedIncome,
      } as any)

      try {
        await api.taxEngine.calculate(taxReturnId)
      } catch {}

      toast({
        title: 'Angaben erfolgreich gespeichert',
        description: 'Deine Abzüge wurden neu berechnet und im Steuerprofil aktualisiert.',
      })
      onUpdate?.()
    } catch (err: any) {
      toast({
        title: 'Speichern fehlgeschlagen',
        description: err?.response?.data?.detail || 'Bitte überprüfe deine Eingaben.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* ── Top Header Card (Schritt 3) ── */}
      <div className="p-4 sm:p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider bg-primary/10 text-primary px-2.5 py-0.5 rounded-full">
              Schritt 3 von 6
            </span>
            <h2 className="text-lg font-bold text-slate-900">Nur noch ein paar Fragen</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-xl">
            Das steht in keinem Dokument – dauert etwa eine Minute. Wähle einfach die zutreffenden Optionen aus.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary-700 text-white font-bold text-xs h-9 px-4 shadow-sm flex items-center gap-1.5 flex-shrink-0"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Antworten speichern
        </Button>
      </div>

      {/* ── 1. Arbeitsweg ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Train className="h-4 w-4 text-primary" />
              <span>1. Wie kommst du zur Arbeit?</span>
            </CardTitle>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Abzug Arbeitsweg: « ca. CHF {getCommuteEstimate().toLocaleString('de-CH')} »
            </span>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Wähle das Transportmittel, das du an den meisten Arbeitstagen nutzt.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { id: 'pt', label: 'ÖV', sub: 'Zug, Bus, Tram', icon: Train },
              { id: 'bike', label: 'Velo / E-Bike', sub: 'CHF 700 Pauschale', icon: Bike },
              { id: 'car', label: 'Auto', sub: 'CHF 0.70 / km', icon: Car },
              { id: 'foot', label: 'Zu Fuss', sub: 'Kein Abzug', icon: Footprints },
            ].map(item => {
              const Icon = item.icon
              const isSelected = commuteMode === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCommuteMode(item.id)}
                  className={`p-3.5 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-1.5 ${
                    isSelected
                      ? 'border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/20 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${isSelected ? 'text-primary' : 'text-slate-500'}`} />
                  <div className="text-xs font-bold">{item.label}</div>
                  <div className="text-[10px] text-slate-500">{item.sub}</div>
                </button>
              )
            })}
          </div>

          {/* Follow-up for ÖV */}
          {commuteMode === 'pt' && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <label className="font-semibold text-slate-800">
                Kosten deines ÖV-Abos pro Jahr (CHF):
              </label>
              <Input
                type="number"
                value={oevCost || ''}
                onChange={e => setOevCost(Number(e.target.value))}
                placeholder="z. B. 2100"
                className="w-36 h-8 text-xs bg-white font-mono"
              />
            </div>
          )}

          {/* Follow-up for Car: Reason requirement */}
          {commuteMode === 'car' && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/70 space-y-3 text-xs">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="text-amber-950">
                  <strong>Warum brauchst du das Auto? (Pflicht für den Abzug):</strong> Ohne anerkannte Begründung anerkennt das Steueramt grundsätzlich nur die Kosten des öffentlichen Verkehrs.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {[
                  { id: 'noov', label: 'Kein ÖV vorhanden' },
                  { id: 'time', label: 'Über 1 Std. Zeitersparnis' },
                  { id: 'shift', label: 'Schicht- oder Nachtarbeit' },
                  { id: 'health', label: 'Gesundheit (Arztzeugnis)' },
                ].map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setCarReason(carReason === r.id ? '' : r.id)}
                    className={`p-2.5 rounded-lg border text-left font-medium transition-all ${
                      carReason === r.id
                        ? 'border-primary bg-primary/10 text-primary font-bold'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-amber-200">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    Arbeitsort (Adresse):
                  </label>
                  <Input
                    value={workplaceAddress}
                    onChange={e => setWorkplaceAddress(e.target.value)}
                    placeholder="Strasse, PLZ Ort"
                    className="h-8 text-xs bg-white"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    Arbeitsweg einfach in km:
                  </label>
                  <Input
                    type="number"
                    value={commuteKm}
                    onChange={e => setCommuteKm(Number(e.target.value))}
                    className="h-8 text-xs bg-white font-mono"
                  />
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Homeoffice-Tage ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span>2. Wie viele Tage pro Woche arbeitest du im Homeoffice?</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            An diesen Tagen fallen Arbeitsweg und auswärtige Mittagsverpflegung weg.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-6 gap-2">
            {[0, 1, 2, 3, 4, 5].map(days => (
              <button
                key={days}
                type="button"
                onClick={() => setHomeOfficeDaysPerWeek(days)}
                className={`py-3 rounded-xl border text-center transition-all ${
                  homeOfficeDaysPerWeek === days
                    ? 'border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="text-sm font-extrabold">{days === 0 ? 'Keinen' : days}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{days === 1 ? 'Tag' : 'Tage'}</div>
              </button>
            ))}
          </div>

          <p className="text-xs text-slate-500">
            Gerechnet wird mit ca. <strong>{effectiveDays} Arbeitstagen</strong> vor Ort (Standard 240 Tage abzüglich Homeoffice und Ferien).
          </p>
        </CardContent>
      </Card>

      {/* ── 3. Mittagessen ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary" />
              <span>3. Wo isst du am Mittag?</span>
            </CardTitle>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Verpflegungsabzug: « ca. CHF {getMealEstimate().toLocaleString('de-CH')} »
            </span>
          </div>
          <CardDescription className="text-xs text-slate-500">
            An regulären Arbeitstagen vor Ort.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[
              { id: 'out', label: 'Auswärts', note: 'selbst bezahlt · CHF 3’200 Pauschale' },
              { id: 'cheap', label: 'Kantine / Lunch-Checks', note: 'vom Arbeitgeber verbilligt · CHF 1’600' },
              { id: 'shift', label: 'Schicht- / Nachtarbeit', note: 'mind. 8 Std. · CHF 3’200' },
              { id: 'none', label: 'Zu Hause', note: 'kein Abzug' },
            ].map(m => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMealType(m.id)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  mealType === m.id
                    ? 'border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/20'
                    : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">{m.label}</span>
                  {mealType === m.id && <Check className="h-4 w-4 text-primary" />}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{m.note}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Sorgerecht & Kinderalimente (ESTV KS 30 - Nur bei Kindern & nicht verheiratet) ── */}
      {numChildren > 0 && !isMarried && (
        <Card className="border-slate-200 shadow-sm overflow-hidden">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span>4. Sorgerecht & Unterhalt für Kinder (ESTV KS 30)</span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Bestimmt den Kinderabzug und den Elterntarif beim Bund und Kanton.
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-4 text-xs">
            <div>
              <label className="font-bold text-slate-800 block mb-2">
                Wer hat das Sorgerecht für die Kinder?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCustodyType('sole')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    custodyType === 'sole'
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Ich allein
                </button>
                <button
                  type="button"
                  onClick={() => setCustodyType('joint')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    custodyType === 'joint'
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Gemeinsam mit dem anderen Elternteil
                </button>
              </div>
            </div>

            <div className="pt-2 border-t">
              <label className="font-bold text-slate-800 block mb-2">
                Bekommst du Unterhalt (Alimente) für die Kinder?
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setAlimonyReceived('no')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    alimonyReceived === 'no'
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Nein
                </button>
                <button
                  type="button"
                  onClick={() => setAlimonyReceived('yes')}
                  className={`p-3 rounded-xl border text-center transition-all ${
                    alimonyReceived === 'yes'
                      ? 'border-primary bg-primary/10 text-primary font-bold'
                      : 'border-slate-200 bg-white text-slate-700'
                  }`}
                >
                  Ja (erhaltene Alimente)
                </button>
              </div>

              {alimonyReceived === 'yes' && (
                <div className="mt-3 p-3 bg-slate-50 rounded-xl border flex items-center justify-between gap-3">
                  <label className="font-semibold text-slate-700">
                    Erhaltene Kinderalimente im Jahr (CHF):
                  </label>
                  <Input
                    type="number"
                    value={alimonyAmount || ''}
                    onChange={e => setAlimonyAmount(Number(e.target.value))}
                    placeholder="0.00"
                    className="w-36 h-8 text-xs bg-white font-mono"
                  />
                </div>
              )}
            </div>

            {/* Alternating custody questions */}
            {custodyType === 'joint' && alimonyReceived === 'no' && (
              <div className="pt-2 border-t space-y-3">
                <div>
                  <label className="font-bold text-slate-800 block mb-1">
                    Wo wohnen die Kinder?
                  </label>
                  <p className="text-[11px] text-slate-500 mb-2">
                    Wochenend- und Ferienbesuche zählen nicht als abwechselnde Obhut.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setChildResidence('me')}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        childResidence === 'me'
                          ? 'border-primary bg-primary/10 text-primary font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      Hauptsächlich bei mir
                    </button>
                    <button
                      type="button"
                      onClick={() => setChildResidence('alt')}
                      className={`p-2.5 rounded-xl border text-center transition-all ${
                        childResidence === 'alt'
                          ? 'border-primary bg-primary/10 text-primary font-bold'
                          : 'border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      Abwechselnd (ca. 50/50)
                    </button>
                  </div>
                </div>

                {childResidence === 'alt' && (
                  <div>
                    <label className="font-bold text-slate-800 block mb-1">
                      Wer von euch beiden verdient mehr?
                    </label>
                    <p className="text-[11px] text-slate-500 mb-2">
                      Den günstigeren Elterntarif beim Bund (Art. 36 Abs. 2 DBG) erhält bei abwechselnder Obhut der Elternteil mit dem höheren Einkommen.
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setHigherEarner('me')}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          higherEarner === 'me'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        Ich verdiene mehr
                      </button>
                      <button
                        type="button"
                        onClick={() => setHigherEarner('other')}
                        className={`p-2.5 rounded-xl border text-center transition-all ${
                          higherEarner === 'other'
                            ? 'border-primary bg-primary/10 text-primary font-bold'
                            : 'border-slate-200 bg-white text-slate-700'
                        }`}
                      >
                        Der andere Elternteil
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── 5. Kirchensteuerpflicht ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <HeartHandshake className="h-4 w-4 text-primary" />
            <span>5. Bist du Mitglied einer Landeskirche?</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Nur für die Kirchensteuer im Kanton {cantonCode}. Ohne Mitgliedschaft fällt sie weg.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {[
              { id: 'ref', label: 'Evang.-reformiert' },
              { id: 'kath', label: 'Röm.-katholisch' },
              { id: 'chk', label: 'Christkatholisch' },
              { id: 'none', label: 'Keine / andere' },
            ].map(k => (
              <button
                key={k.id}
                type="button"
                onClick={() => setConfession(k.id)}
                className={`p-3 rounded-xl border text-center font-semibold transition-all ${
                  confession === k.id
                    ? 'border-primary bg-primary/10 text-primary font-bold ring-2 ring-primary/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-primary hover:bg-primary-700 text-white font-bold text-xs h-10 px-6 shadow-sm"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wird berechnet & gespeichert...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Antworten speichern & weiter
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
