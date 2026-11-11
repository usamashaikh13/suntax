'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Check, ChevronRight, Loader2, ArrowLeft,
  Building2, Calendar, ShieldCheck, MapPin,
  HelpCircle, AlertTriangle, CheckCircle2, XCircle, Users
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Canton } from '@/types'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { BRAND } from '@/lib/brand'

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
  const { isGerman, t } = useTranslation()

  // Pre-check state (Eligibility: Angestellte/Rentner, keine Quellensteuer, keine Selbstständigkeit, keine Auslandsliegenschaft)
  const [eligibility, setEligibility] = useState({
    isEmployedOrPensioner: true,
    isSourceTaxed: false,
    hasRentedOrForeignProperty: false,
    isSelfEmployed: false,
  })

  // Start Form fields
  const [plz, setPlz] = useState('')
  const [plzLoading, setPlzLoading] = useState(false)
  const [plzError, setPlzError] = useState<string | null>(null)
  const [plzResult, setPlzResult] = useState<{
    canton: string;
    bfs: string;
    name: string;
    availability?: Record<string, string>;
    municipalities: Array<{ bfs: string; name: string; canton: string; availability?: Record<string, string> }>;
  } | null>(null)
  const [selectedBfs, setSelectedBfs] = useState('')
  const [taxYear, setTaxYear] = useState<number>(2025)
  const [civilStatus, setCivilStatus] = useState<'single' | 'married' | 'divorced' | 'widowed' | 'partnership'>('single')
  const [numChildren, setNumChildren] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  // Waitlist state for coming_soon cantons (Addendum 1 Section 2)
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistBusy, setWaitlistBusy] = useState(false)
  const [waitlistDone, setWaitlistDone] = useState<string | null>(null)
  const [waitlistError, setWaitlistError] = useState<string | null>(null)

  // PLZ Auto-Lookup
  useEffect(() => {
    const cleanPlz = plz.trim()
    setWaitlistDone(null)
    setWaitlistError(null)
    if (cleanPlz.length === 4 && /^\d{4}$/.test(cleanPlz)) {
      setPlzLoading(true)
      setPlzError(null)
      api.cantons.lookupPlz(cleanPlz)
        .then(res => {
          const defaultCanton = res.default_canton || (res as any).canton || 'ZH'
          const defaultBfs = res.default_bfs || (res as any).bfs_code || ''
          const defaultName = res.default_name || (res as any).municipality_name || ''
          const rawMunis = res.municipalities || (res as any).options || []
          const munis = rawMunis.map((m: any) => ({
            bfs: m.bfs || m.bfs_code,
            name: m.name || m.municipality_name,
            canton: m.canton,
            availability: m.availability || res.availability,
          }))

          setPlzResult({
            canton: defaultCanton,
            bfs: defaultBfs,
            name: defaultName,
            availability: res.availability,
            municipalities: munis.length > 0 ? munis : [{ bfs: defaultBfs, name: defaultName, canton: defaultCanton, availability: res.availability }],
          })
          setSelectedBfs(defaultBfs)
          setPlzError(null)
        })
        .catch(() => {
          // Do NOT silently default to Zurich. Report error and clear selection
          setPlzResult(null)
          setSelectedBfs('')
          setPlzError(
            isGerman
              ? 'Diese Postleitzahl wurde nicht gefunden. Bitte prüfe deine Eingabe.'
              : 'This postal code was not found. Please verify your entry.'
          )
        })
        .finally(() => setPlzLoading(false))
    } else {
      setPlzResult(null)
      setSelectedBfs('')
      setPlzError(null)
    }
  }, [plz, isGerman])

  const selectedMuniObj = plzResult?.municipalities.find(m => m.bfs === selectedBfs)
  const activeCantonAvailMap = selectedMuniObj?.availability || plzResult?.availability
  const activeAvailability = activeCantonAvailMap
    ? (activeCantonAvailMap[String(taxYear)] || activeCantonAvailMap['2025'] || 'coming_soon')
    : (plzResult ? (plzResult.canton === 'ZH' ? 'available' : 'coming_soon') : 'available')
  const isCantonAvailable = !plzResult || activeAvailability === 'available'

  const isEligible =
    eligibility.isEmployedOrPensioner &&
    !eligibility.isSourceTaxed &&
    !eligibility.hasRentedOrForeignProperty &&
    !eligibility.isSelfEmployed

  const canCreate = isEligible && isCantonAvailable && plzResult && selectedBfs && !submitting

  const handleJoinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!plzResult || !waitlistEmail.trim()) return
    setWaitlistBusy(true)
    setWaitlistError(null)
    try {
      const res = await api.cantons.joinWaitlist({
        email: waitlistEmail.trim(),
        canton_code: plzResult.canton,
        tax_year: taxYear,
        postal_code: plz.trim(),
      })
      setWaitlistDone(res.message || t('cantonRollout.waitlistSuccess', { canton: plzResult.canton }))
    } catch (err: any) {
      setWaitlistError(err?.response?.data?.detail || (isGerman ? 'Bitte gib eine gültige E-Mail-Adresse ein.' : 'Please enter a valid email address.'))
    } finally {
      setWaitlistBusy(false)
    }
  }

  const handleCreate = async () => {
    if (!canCreate || !plzResult) return
    setSubmitting(true)

    const selectedMuni = plzResult.municipalities.find(m => m.bfs === selectedBfs) || {
      bfs: selectedBfs,
      name: plzResult.name,
      canton: plzResult.canton,
    }

    try {
      const created = await api.taxReturns.create({
        canton_code: selectedMuni.canton || plzResult.canton,
        tax_year: taxYear,
        municipality_code: selectedMuni.bfs,
        municipality_name: selectedMuni.name,
      })

      // Update initial profile with civil status and children count
      try {
        await api.taxProfile.update(created.id, 'personal_data', {
          civil_status: civilStatus,
          children_count: numChildren,
          plz: plz.trim(),
          municipality_name: selectedMuni.name,
          municipality_code: selectedMuni.bfs,
        })
      } catch {}

      toast({
        title: isGerman ? 'Steuererklärung eröffnet' : 'Tax return created',
        description: `${isGerman ? 'Dossier für' : 'Dossier for'} ${CANTON_NAMES[selectedMuni.canton] || selectedMuni.canton} (${selectedMuni.name}) ${isGerman ? 'erstellt.' : 'created.'}`,
      })
      router.push(`/tax-returns/${created.id}`)
    } catch (err: any) {
      toast({
        title: isGerman ? 'Erstellen fehlgeschlagen' : 'Creation failed',
        description: err?.response?.data?.detail || (isGerman ? 'Bitte versuche es erneut.' : 'Please try again.'),
        variant: 'destructive',
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge className="bg-emerald-50 text-[#1E7B52] border-emerald-200 text-xs font-semibold">
            {isGerman ? 'Schritt 1 von 6 · Start' : 'Step 1 of 6 · Start'}
          </Badge>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-500 font-medium">
            {isGerman ? 'Offizielle ESTV-Regeln' : 'Official ESTV rules'}
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14181F] tracking-tight">
          {isGerman ? 'Kurz zu dir' : 'About you'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          {isGerman
            ? 'Drei kurze Angaben – damit wir die richtigen kantonalen Steuerregeln für dich anwenden.'
            : 'Three brief questions – so we apply the correct cantonal tax rules for your situation.'}
        </p>
      </div>

      {/* ── CARD 1: Wohnort (PLZ Resolver) ─────────────────────────────────── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-[#14181F] flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#1E7B52]" />
            <span>{isGerman ? 'Wo hast du am 31. Dezember gewohnt?' : 'Where did you reside on December 31st?'}</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {isGerman
              ? 'Gib deine 4-stellige Postleitzahl ein. Wir ordnen Kanton und Gemeinde automatisch zu.'
              : 'Enter your 4-digit postal code. We match canton and municipality automatically.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          <div className="flex gap-3 items-center">
            <div className="w-36">
              <input
                type="text"
                maxLength={4}
                value={plz}
                onChange={e => setPlz(e.target.value.replace(/\D/g, ''))}
                placeholder="z. B. 8400"
                className="w-full text-lg font-mono font-bold tracking-wider px-3.5 py-2.5 rounded-xl border border-slate-300 focus:outline-none focus:border-[#1E7B52] focus:ring-2 focus:ring-[#1E7B52]/20"
              />
            </div>
            {plzLoading && (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#1E7B52]" />
                <span>{isGerman ? 'Gemeinde wird ermittelt...' : 'Resolving municipality...'}</span>
              </div>
            )}
            {plzError && !plzLoading && (
              <div className="flex-1 p-2.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
                {plzError}
              </div>
            )}
            {plzResult && !plzLoading && (
              <div className={cn(
                'flex-1 p-2.5 rounded-xl text-xs font-medium border flex items-center justify-between gap-2',
                isCantonAvailable
                  ? 'bg-[#F0FDF4] border-emerald-200 text-emerald-950'
                  : 'bg-amber-50 border-amber-200 text-amber-950'
              )}>
                <span>
                  <span className={cn('font-bold', isCantonAvailable ? 'text-[#1E7B52]' : 'text-amber-700')}>
                    {plzResult.canton}
                  </span>{' '}
                  – {plzResult.name} (BFS #{selectedBfs})
                </span>
                <span className={cn(
                  'text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap',
                  isCantonAvailable ? 'bg-emerald-100 text-[#1E7B52]' : 'bg-amber-200/70 text-amber-900'
                )}>
                  {isCantonAvailable ? t('cantonRollout.availableBadge') : t('cantonRollout.comingSoonBadge')}
                </span>
              </div>
            )}
          </div>

          {/* Coming Soon Canton Waitlist Banner (Addendum 1 Section 2: No Payment, Waitlist Email) */}
          {plzResult && !plzLoading && !isCantonAvailable && (
            <div
              data-testid="canton-coming-soon-banner"
              className="mt-3 p-4 rounded-xl bg-amber-50/90 border border-amber-200 space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-amber-950">
                    {t('cantonRollout.comingSoonTitle')} ({CANTON_NAMES[plzResult.canton] || plzResult.canton})
                  </h3>
                  <p className="text-xs text-amber-900/90">
                    {t('cantonRollout.comingSoonSubtitle')} {t('cantonRollout.comingSoonNoPayment')}
                  </p>
                </div>
              </div>

              {waitlistDone ? (
                <div
                  data-testid="waitlist-success"
                  className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 flex items-center gap-2"
                >
                  <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                  <span>{waitlistDone}</span>
                </div>
              ) : (
                <form onSubmit={handleJoinWaitlist} className="space-y-2 pt-1">
                  <p className="text-xs font-semibold text-slate-700">
                    {t('cantonRollout.waitlistDesc', { canton: `${CANTON_NAMES[plzResult.canton] || plzResult.canton} (${plzResult.canton})` })}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="email"
                      required
                      value={waitlistEmail}
                      onChange={e => setWaitlistEmail(e.target.value)}
                      placeholder={t('cantonRollout.waitlistEmailPlaceholder')}
                      data-testid="waitlist-email-input"
                      className="flex-1 text-xs px-3 py-2 rounded-lg border border-amber-300 bg-white focus:outline-none focus:border-[#1E7B52]"
                    />
                    <Button
                      type="submit"
                      disabled={waitlistBusy || !waitlistEmail.trim()}
                      data-testid="waitlist-submit-btn"
                      className="bg-[#14181F] hover:bg-slate-800 text-white text-xs font-semibold h-9 px-4 rounded-lg"
                    >
                      {waitlistBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      {t('cantonRollout.waitlistBtn')}
                    </Button>
                  </div>
                  {waitlistError && (
                    <p className="text-xs text-red-700 font-medium">{waitlistError}</p>
                  )}
                </form>
              )}
            </div>
          )}

          {/* Ambiguous PLZ Dropdown */}
          {plzResult && plzResult.municipalities.length > 1 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-700">
                {isGerman
                  ? 'Mehrere Gemeinden gefunden – bitte wähle deine genaue Wohngemeinde:'
                  : 'Multiple municipalities found – please select your exact municipality:'}
              </label>
              <select
                value={selectedBfs}
                onChange={e => {
                  const newBfs = e.target.value
                  setSelectedBfs(newBfs)
                  const picked = plzResult.municipalities.find(m => m.bfs === newBfs)
                  if (picked) {
                    setPlzResult(prev => prev ? { ...prev, bfs: picked.bfs, name: picked.name, canton: picked.canton } : null)
                  }
                }}
                className="w-full text-xs sm:text-sm p-2.5 rounded-xl border border-slate-300 bg-white focus:outline-none focus:border-[#1E7B52]"
              >
                {plzResult.municipalities.map(m => (
                  <option key={m.bfs} value={m.bfs}>
                    {m.name} ({m.canton}) – BFS #{m.bfs}
                  </option>
                ))}
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── CARD 2: Zivilstand & Kinder ─────────────────────────────────────── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-[#14181F] flex items-center gap-2">
            <Users className="h-4 w-4 text-[#1E7B52]" />
            <span>{isGerman ? 'Wie ist dein Zivilstand und deine Familiensituation?' : 'What is your civil and family status?'}</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {isGerman
              ? 'Bestimmt den massgebenden Grundtarif (Ledigen-, Verheirateten- oder Elterntarif gemäss Art. 36 DBG).'
              : 'Determines the baseline tax scale (Single, Married, or Parent tariff under Art. 36 DBG).'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-5">
          {/* Civil status chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              {isGerman ? 'Zivilstand' : 'Civil Status'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'single', labelDe: 'Ledig', labelEn: 'Single' },
                { id: 'married', labelDe: 'Verheiratet', labelEn: 'Married' },
                { id: 'partnership', labelDe: 'Eingetr. Partnerschaft', labelEn: 'Registered Partnership' },
                { id: 'divorced', labelDe: 'Geschieden', labelEn: 'Divorced' },
                { id: 'widowed', labelDe: 'Verwitwet', labelEn: 'Widowed' },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setCivilStatus(opt.id as any)}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-semibold transition-all text-center cursor-pointer',
                    civilStatus === opt.id
                      ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  )}
                >
                  {isGerman ? opt.labelDe : opt.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Children chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              {isGerman ? 'Kinder mit Abzugsberechtigung' : 'Children qualifying for deductions'}
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[0, 1, 2, 3].map(k => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setNumChildren(k)}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-semibold transition-all text-center cursor-pointer',
                    numChildren === k
                      ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  )}
                >
                  {k === 0 ? (isGerman ? 'Keine' : 'None') : k === 3 ? (isGerman ? '3 oder mehr' : '3 or more') : `${k} ${isGerman ? `Kind${k > 1 ? 'er' : ''}` : `Child${k > 1 ? 'ren' : ''}`}`}
                </button>
              ))}
            </div>
          </div>

          {/* Tax Year */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              {isGerman ? 'Steuerjahr' : 'Tax Year'}
            </label>
            <div className="grid grid-cols-2 gap-2 max-w-xs">
              {[2025, 2026].map(y => (
                <button
                  key={y}
                  type="button"
                  onClick={() => setTaxYear(y)}
                  className={cn(
                    'p-2.5 rounded-xl border text-xs font-bold transition-all text-center cursor-pointer',
                    taxYear === y
                      ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300 text-slate-700'
                  )}
                >
                  {isGerman ? `Steuerjahr ${y}` : `Tax Year ${y}`}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ── CARD 3: Eignungsprüfung (Pre-Payment Scope Enforcement) ─────────── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-[#14181F] flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-[#1E7B52]" />
            <span>{isGerman ? `Passt ${BRAND.name} zu deiner Situation?` : `Does ${BRAND.name} fit your situation?`}</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {isGerman
              ? 'Wir unterstützen Angestellte, Rentner und selbstbewohnte Eigenheime.'
              : 'We support employed persons, retirees, and owner-occupied homes.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          {[
            {
              id: 'isEmployedOrPensioner',
              labelDe: 'Bist du angestellt oder Rentner/in?',
              labelEn: 'Are you employed or retired?',
              descDe: 'Lohnempfänger mit Lohnausweis oder Rente (AHV/Pensionskasse)',
              descEn: 'Salary certificate recipient or pension recipient (OASI/occupational)',
              val: eligibility.isEmployedOrPensioner,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, isEmployedOrPensioner: v })),
              goodVal: true,
            },
            {
              id: 'isSelfEmployed',
              labelDe: 'Übst du eine selbstständige Haupttätigkeit aus?',
              labelEn: 'Are you primarily self-employed?',
              descDe: 'Einzelfirma, freiberufliche Praxis oder GmbH-Inhaber',
              descEn: 'Sole proprietorship, independent practice, or LLC owner',
              val: eligibility.isSelfEmployed,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, isSelfEmployed: v })),
              goodVal: false,
            },
            {
              id: 'hasRentedOrForeignProperty',
              labelDe: 'Besitzt du vermietete Liegenschaften oder Liegenschaften im Ausland / anderen Kanton?',
              labelEn: 'Do you own rented properties or real estate abroad / in other cantons?',
              descDe: 'Selbstbewohntes Wohneigentum im Wohnkanton ist voll unterstützt.',
              descEn: 'Owner-occupied property in your home canton is fully supported.',
              val: eligibility.hasRentedOrForeignProperty,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, hasRentedOrForeignProperty: v })),
              goodVal: false,
            },
            {
              id: 'isSourceTaxed',
              labelDe: 'Wirst du an der Quelle besteuert (Quellensteuer)?',
              labelEn: 'Are you taxed at source (withholding tax)?',
              descDe: 'Ordentliche Besteuerung ohne Quellensteuer-Abrechnung',
              descEn: 'Standard tax assessment without withholding tax settlement',
              val: eligibility.isSourceTaxed,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, isSourceTaxed: v })),
              goodVal: false,
            },
          ].map(q => {
            return (
              <div
                key={q.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-[#FBFAF7] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <h4 className="font-bold text-slate-800">
                    {isGerman ? q.labelDe : q.labelEn}
                  </h4>
                  <p className="text-slate-500 text-[11px] mt-0.5">
                    {isGerman ? q.descDe : q.descEn}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <button
                    type="button"
                    onClick={() => q.setVal(true)}
                    className={cn(
                      'px-3 py-1 rounded-lg font-bold border transition-all text-xs cursor-pointer',
                      q.val === true
                        ? (q.goodVal === true ? 'bg-[#1E7B52] text-white border-[#1E7B52]' : 'bg-amber-600 text-white border-amber-600')
                        : 'bg-white text-slate-600 border-slate-300'
                    )}
                  >
                    {isGerman ? 'Ja' : 'Yes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => q.setVal(false)}
                    className={cn(
                      'px-3 py-1 rounded-lg font-bold border transition-all text-xs cursor-pointer',
                      q.val === false
                        ? (q.goodVal === false ? 'bg-[#1E7B52] text-white border-[#1E7B52]' : 'bg-amber-600 text-white border-amber-600')
                        : 'bg-white text-slate-600 border-slate-300'
                    )}
                  >
                    {isGerman ? 'Nein' : 'No'}
                  </button>
                </div>
              </div>
            )
          })}

          {!isEligible && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5 mt-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
              <div>
                <span className="font-bold">{isGerman ? 'Aktuell noch nicht unterstützt:' : 'Currently not supported:'}</span>{' '}
                {isGerman
                  ? `${BRAND.name} unterstützt derzeit ausschliesslich Angestellte und Rentner ohne ausserkantonale Liegenschaften oder Quellensteuer. Diese komplexen Szenarien kommen bald!`
                  : `${BRAND.name} currently supports only employed persons and retirees without out-of-canton properties or withholding tax. Extended scenarios coming soon!`}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Action Buttons ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button asChild variant="outline" size="sm" className="text-xs rounded-xl">
          <Link href="/tax-returns">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            {isGerman ? 'Abbrechen' : 'Cancel'}
          </Link>
        </Button>

        <Button
          onClick={handleCreate}
          disabled={!canCreate}
          className="bg-[#1E7B52] hover:bg-[#165C3D] disabled:opacity-50 text-white font-semibold text-xs h-10 px-6 rounded-xl flex items-center gap-1.5 shadow-sm"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{isGerman ? 'Dossier wird erstellt...' : 'Creating dossier...'}</span>
            </>
          ) : (
            <>
              <span>{isGerman ? 'Weiter zu Schritt 2: Dokumente' : 'Continue to Step 2: Documents'}</span>
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
