'use client'

import React, { useState, useEffect } from 'react'
import {
  CheckCircle,
  HelpCircle,
  Loader2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Save,
  Check,
  Bike,
  Car,
  Train,
  Footprints,
  Calendar,
  AlertTriangle,
  Info,
  DollarSign
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
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
}

export function TaxQuestions({ profile, taxReturnId, cantonCode = 'ZH', taxYear = 2025, onUpdate }: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [infoTexts, setInfoTexts] = useState<Record<string, QuestionInfoTextData>>({})

  // Form states based on profile data
  const deductions = (profile.deductions_data || {}) as Record<string, any>
  const income = (profile.income_data || {}) as Record<string, any>
  const personal = (profile.personal_data || {}) as Record<string, any>

  // Commute mode: bike, car, pt, foot
  const [commuteMode, setCommuteMode] = useState<string>(
    deductions.commute_mode || (deductions.commute_bike ? 'bike' : deductions.commute_car ? 'car' : 'pt')
  )
  const [commuteKm, setCommuteKm] = useState<number>(deductions.commute_km_per_day || 15)
  const [workingDays, setWorkingDays] = useState<number>(deductions.working_days || 240)
  const [homeOfficeDays, setHomeOfficeDays] = useState<number>(deductions.home_office_days || 0)
  const [holidays, setHolidays] = useState<number>(deductions.holidays || 25)

  // Canteen / Box G
  const boxGChecked = Boolean(income.has_canteen || income.field_g_canteen || deductions.has_canteen)
  const [hasCanteen, setHasCanteen] = useState<boolean>(boxGChecked)

  // Company car / Box F
  const boxFChecked = Boolean(income.has_company_car || income.field_f_car || deductions.has_company_car)

  // Children check
  const numChildren = Number(personal.children_count || personal.number_of_children || 0)
  const [childcareCosts, setChildcareCosts] = useState<number>(deductions.childcare_costs || 0)

  // Church membership
  const [isChurchMember, setIsChurchMember] = useState<boolean>(personal.is_church_member !== false)

  // Fetch info texts from backend DB
  useEffect(() => {
    api.taxEngine
      .getInfoTexts(cantonCode, taxYear)
      .then(data => setInfoTexts(data))
      .catch(() => {})
  }, [cantonCode, taxYear])

  // Effective days calculation
  const effectiveDays = Math.max(0, workingDays - homeOfficeDays - holidays)

  // Estimated deduction preview for user feedback
  const getCommuteEstimate = () => {
    if (boxFChecked) return 0
    if (commuteMode === 'bike') return 700
    if (commuteMode === 'car') {
      const annual = 0.70 * commuteKm * effectiveDays
      return Math.min(annual, cantonCode === 'ZH' ? 5200 : 3300)
    }
    if (commuteMode === 'pt') return 2100 // Average ZVV / regional pass
    return 0
  }

  const getMealEstimate = () => {
    if (effectiveDays <= 0) return 0
    return hasCanteen ? 1600 : 3200
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const updatedDeductions = {
        ...deductions,
        commute_mode: commuteMode,
        commute_km_per_day: commuteKm,
        working_days: workingDays,
        home_office_days: homeOfficeDays,
        holidays: holidays,
        has_canteen: hasCanteen,
        has_company_car: boxFChecked,
        childcare_costs: numChildren > 0 ? childcareCosts : 0,
      }

      const updatedPersonal = {
        ...personal,
        is_church_member: isChurchMember,
      }

      await api.taxProfile.update(taxReturnId, {
        deductions_data: updatedDeductions,
        personal_data: updatedPersonal,
      } as any)

      // Also trigger recalculation so live counter updates
      try {
        await api.taxEngine.calculate(taxReturnId)
      } catch {}

      toast({
        title: 'Angaben erfolgreich gespeichert',
        description: 'Ihre Abzüge wurden neu berechnet und im Steuerprofil aktualisiert.',
      })
      onUpdate?.()
    } catch (err: any) {
      toast({
        title: 'Speichern fehlgeschlagen',
        description: err?.response?.data?.detail || 'Bitte überprüfen Sie Ihre Eingaben.',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Overview Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-red-50 via-white to-slate-50 border border-red-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge className="bg-red-600 text-white text-[10px] font-bold">
              Milestone 2 Steuerfragen
            </Badge>
            <span className="text-xs font-bold text-slate-900">
              Kanton {cantonCode} • Steuerjahr {taxYear}
            </span>
          </div>
          <p className="text-xs text-slate-600">
            Beantworten Sie wenige einfache Fragen mit grossen Buttons. SunTax optimiert automatisch Ihre Abzüge.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-9 px-4 shadow-sm shadow-red-600/20 flex-shrink-0"
        >
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Abzüge speichern & anwenden
        </Button>
      </div>

      {/* ── QUESTION 1: Wie kommen Sie zur Arbeit? (Part B4 Big Buttons) ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-bold text-slate-900">
                1. Wie legen Sie Ihren Arbeitsweg zurück?
              </CardTitle>
              <ContextualInfoModal info={infoTexts['commute_transport']} title="Arbeitsweg & Transportmittel" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Geschätzter Abzug: « ca. CHF {getCommuteEstimate().toLocaleString('de-CH')} »
            </span>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Wählen Sie Ihr primäres Transportmittel für den Weg zwischen Wohn- und Arbeitsort.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          {boxFChecked && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-950 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Feld F im Lohnausweis angekreuzt (Geschäftsfahrzeug):</strong> Ihnen steht ein Firmenwagen
                oder unentgeltliche Beförderung zur Verfügung. Gemäss ESTV-Richtlinien entfällt der Fahrkostenabzug.
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                id: 'bike',
                label: 'Velo / E-Bike',
                sub: 'CHF 700 Pauschale',
                icon: Bike,
                disabled: boxFChecked,
              },
              {
                id: 'pt',
                label: 'ÖV (Zug, Bus, Tram)',
                sub: 'Effektive Abos (z.B. ZVV/GA)',
                icon: Train,
                disabled: boxFChecked,
              },
              {
                id: 'car',
                label: 'Privates Auto',
                sub: 'CHF 0.70 / km',
                icon: Car,
                disabled: boxFChecked,
              },
              {
                id: 'foot',
                label: 'Zu Fuss',
                sub: 'Keine Kosten',
                icon: Footprints,
                disabled: boxFChecked,
              },
            ].map(item => {
              const Icon = item.icon
              const isSelected = commuteMode === item.id && !boxFChecked
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={item.disabled}
                  onClick={() => setCommuteMode(item.id)}
                  className={`p-4 rounded-xl border text-center transition-all flex flex-col items-center justify-center gap-2 ${
                    isSelected
                      ? 'border-red-600 bg-red-50/70 text-red-950 ring-2 ring-red-500/20 font-bold shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  } ${item.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <div className={`h-10 w-10 rounded-full flex items-center justify-center ${
                    isSelected ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="text-xs font-bold">{item.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{item.sub}</div>
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-red-600 mt-1" />}
                </button>
              )
            })}
          </div>

          {/* Follow-up for Car (Part B4 Requirement) */}
          {commuteMode === 'car' && !boxFChecked && (
            <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-950">
                  <strong>Wichtiger Hinweis der Steuerbehörde:</strong> Autokosten werden steuerlich grundsätzlich nur
                  anerkannt, wenn kein zumutbarer öffentlicher Verkehr zur Verfügung steht oder Sie mit dem ÖV mehr als
                  60 Minuten Zeitverlust pro Tag hätten.
                </div>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                <label className="text-xs font-bold text-slate-900">
                  Einfache Distanz Wohnort – Arbeitsort:
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    value={commuteKm}
                    onChange={e => setCommuteKm(Number(e.target.value))}
                    className="w-24 h-8 text-xs bg-white text-center font-bold"
                  />
                  <span className="text-xs font-medium text-slate-600">km (pro Weg)</span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── QUESTION 2: Arbeitstage, Homeoffice & Ferien (Part B4) ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-bold text-slate-900">
                2. Arbeitstage, Homeoffice & Ferien
              </CardTitle>
              <ContextualInfoModal info={infoTexts['home_office']} title="Homeoffice-Tage" />
            </div>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
              Effektive Pendeltage vor Ort: {effectiveDays} Tage
            </span>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Homeoffice-Tage reduzieren Fahr- und Mittagsabzüge anteilsmässig gemäss Wegleitung.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5 p-3 rounded-xl border bg-slate-50/50">
              <label className="text-xs font-bold text-slate-800 block">
                Arbeitstage im Jahr
              </label>
              <p className="text-[10px] text-slate-500">Standard: 240 Tage bei 100%</p>
              <Input
                type="number"
                min={0}
                max={365}
                value={workingDays}
                onChange={e => setWorkingDays(Number(e.target.value))}
                className="h-8 text-xs bg-white font-bold"
              />
            </div>

            <div className="space-y-1.5 p-3 rounded-xl border bg-slate-50/50">
              <label className="text-xs font-bold text-slate-800 block">
                Homeoffice-Tage
              </label>
              <p className="text-[10px] text-slate-500">Tage zu Hause gearbeitet</p>
              <Input
                type="number"
                min={0}
                max={300}
                value={homeOfficeDays}
                onChange={e => setHomeOfficeDays(Number(e.target.value))}
                className="h-8 text-xs bg-white font-bold"
              />
            </div>

            <div className="space-y-1.5 p-3 rounded-xl border bg-slate-50/50">
              <label className="text-xs font-bold text-slate-800 block">
                Ferien & Feiertage
              </label>
              <p className="text-[10px] text-slate-500">Standard: ca. 25–30 Tage</p>
              <Input
                type="number"
                min={0}
                max={100}
                value={holidays}
                onChange={e => setHolidays(Number(e.target.value))}
                className="h-8 text-xs bg-white font-bold"
              />
            </div>
          </div>

          {homeOfficeDays > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <span>
                Berechnungsgrundlage: <strong>{workingDays}</strong> Arbeitstage minus <strong>{homeOfficeDays}</strong> Homeoffice minus <strong>{holidays}</strong> Ferien = <strong>{effectiveDays} Tage</strong> vor Ort für Fahr- & Verpflegungsabzüge.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── QUESTION 3: Verpflegung & Kantine (Feld G im Lohnausweis) ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-bold text-slate-900">
                3. Mittagsverpflegung am Arbeitsort
              </CardTitle>
              <ContextualInfoModal info={infoTexts['meals']} title="Auswärtige Verpflegung" />
            </div>
            <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Pauschale: « ca. CHF {getMealEstimate().toLocaleString('de-CH')} »
            </span>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Haben Sie Zugang zu einer vom Arbeitgeber verbilligten Kantine oder Essensbons (Feld G)?
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setHasCanteen(false)}
              className={`p-4 rounded-xl border text-left transition-all ${
                !hasCanteen
                  ? 'border-red-600 bg-red-50/70 text-red-950 ring-2 ring-red-500/20 font-bold'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Keine Kantine / Volle Pauschale</span>
                {!hasCanteen && <Check className="h-4 w-4 text-red-600" />}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-normal">
                CHF 3&apos;200 Pauschalabzug pro Jahr (CHF 15 pro effektivem Arbeitstag).
              </p>
            </button>

            <button
              type="button"
              onClick={() => setHasCanteen(true)}
              className={`p-4 rounded-xl border text-left transition-all ${
                hasCanteen
                  ? 'border-red-600 bg-red-50/70 text-red-950 ring-2 ring-red-500/20 font-bold'
                  : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold">Kantine / Essensbeitrag (Feld G)</span>
                {hasCanteen && <Check className="h-4 w-4 text-red-600" />}
              </div>
              <p className="text-[11px] text-slate-500 mt-1 font-normal">
                CHF 1&apos;600 Pauschalabzug (Arbeitgeber verbilligt Verpflegung).
              </p>
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── QUESTION 4: Kirchensteuerpflicht ── */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-slate-50/70 border-b pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-bold text-slate-900">
              4. Kirchensteuer
            </CardTitle>
            <Badge variant="outline" className="text-xs">
              Kanton {cantonCode}
            </Badge>
          </div>
          <CardDescription className="text-xs text-slate-500">
            Sind Sie Mitglied einer anerkannten Landeskirche (römisch-katholisch, evangelisch-reformiert oder christkatholisch)?
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setIsChurchMember(true)}
              className={`p-3 rounded-xl border text-center text-xs font-bold transition-all ${
                isChurchMember
                  ? 'border-red-600 bg-red-50 text-red-950 ring-2 ring-red-500/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              Ja, kirchensteuerpflichtig
            </button>

            <button
              type="button"
              onClick={() => setIsChurchMember(false)}
              className={`p-3 rounded-xl border text-center text-xs font-bold transition-all ${
                !isChurchMember
                  ? 'border-red-600 bg-red-50 text-red-950 ring-2 ring-red-500/20'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              Nein, konfessionslos / keine Kirchensteuer
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── QUESTION 5: Kinderbetreuung (Nur wenn Kinder vorhanden - Part B4) ── */}
      {numChildren > 0 && (
        <Card className="border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-200">
          <CardHeader className="bg-slate-50/70 border-b pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-bold text-slate-900">
                  5. Drittbetreuungskosten für Kinder
                </CardTitle>
                <ContextualInfoModal info={infoTexts['children']} title="Kinder & Kinderbetreuung" />
              </div>
              <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-xs">
                {numChildren} Kind(er) erfasst
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500">
              Kosten für Kita, Tagesmutter oder Hort (max. CHF 10&apos;100 im Kt. ZH / CHF 25&apos;500 Bund).
            </CardDescription>
          </CardHeader>

          <CardContent className="pt-4 space-y-3">
            <div className="flex items-center gap-3">
              <label className="text-xs font-bold text-slate-800">
                Effektive Jahreskosten für Kita/Betreuung:
              </label>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-600">CHF</span>
                <Input
                  type="number"
                  min={0}
                  max={50000}
                  value={childcareCosts}
                  onChange={e => setChildcareCosts(Number(e.target.value))}
                  className="w-32 h-8 text-xs font-bold bg-white"
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Save Button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-10 px-6 shadow-md shadow-red-600/20"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wird berechnet & gespeichert...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Abzüge verbindlich speichern
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
