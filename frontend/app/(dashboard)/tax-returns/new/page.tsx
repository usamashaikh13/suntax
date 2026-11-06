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
  const [plzResult, setPlzResult] = useState<{
    canton: string;
    bfs: string;
    name: string;
    municipalities: Array<{ bfs: string; name: string; canton: string }>;
  } | null>(null)
  const [selectedBfs, setSelectedBfs] = useState('')
  const [taxYear, setTaxYear] = useState<number>(2025)
  const [civilStatus, setCivilStatus] = useState<'single' | 'married' | 'divorced' | 'widowed' | 'partnership'>('single')
  const [numChildren, setNumChildren] = useState<number>(0)
  const [submitting, setSubmitting] = useState(false)

  // PLZ Auto-Lookup
  useEffect(() => {
    const cleanPlz = plz.trim()
    if (cleanPlz.length === 4 && /^\d{4}$/.test(cleanPlz)) {
      setPlzLoading(true)
      api.cantons.lookupPlz(cleanPlz)
        .then(res => {
          setPlzResult({
            canton: res.default_canton,
            bfs: res.default_bfs,
            name: res.default_name,
            municipalities: res.municipalities || [],
          })
          setSelectedBfs(res.default_bfs)
        })
        .catch(() => {
          // Fallback to Zurich if unknown PLZ
          setPlzResult({
            canton: 'ZH',
            bfs: '261',
            name: 'Zürich',
            municipalities: [{ bfs: '261', name: 'Zürich', canton: 'ZH' }],
          })
          setSelectedBfs('261')
        })
        .finally(() => setPlzLoading(false))
    } else {
      setPlzResult(null)
      setSelectedBfs('')
    }
  }, [plz])

  const isEligible =
    eligibility.isEmployedOrPensioner &&
    !eligibility.isSourceTaxed &&
    !eligibility.hasRentedOrForeignProperty &&
    !eligibility.isSelfEmployed

  const canCreate = isEligible && plzResult && selectedBfs && !submitting

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
        title: 'Steuererklärung eröffnet',
        description: `Dossier für ${CANTON_NAMES[selectedMuni.canton] || selectedMuni.canton} (${selectedMuni.name}) erstellt.`,
      })
      router.push(`/tax-returns/${created.id}`)
    } catch (err: any) {
      toast({
        title: 'Erstellen fehlgeschlagen',
        description: err?.response?.data?.detail || 'Bitte versuche es erneut.',
        variant: 'destructive',
      })
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-16">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge className="bg-emerald-50 text-[#1E7B52] border-emerald-200 text-xs font-semibold">
            Schritt 1 von 6 · Start
          </Badge>
          <span className="text-xs text-slate-400">•</span>
          <span className="text-xs text-slate-500 font-medium">Offizielle ESTV-Regeln</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-[#14181F] tracking-tight">
          Kurz zu dir
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Drei kurze Angaben – damit wir die richtigen kantonalen Steuerregeln für dich anwenden.
        </p>
      </div>

      {/* ── CARD 1: Wohnort (PLZ Resolver) ─────────────────────────────────── */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
        <CardHeader className="pb-3 border-b border-slate-100">
          <CardTitle className="text-base font-bold text-[#14181F] flex items-center gap-2">
            <MapPin className="h-4 w-4 text-[#1E7B52]" />
            <span>Wo hast du am 31. Dezember gewohnt?</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Gib deine 4-stellige Postleitzahl ein. Wir ordnen Kanton und Gemeinde automatisch zu.
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
                <span>Gemeinde wird ermittelt...</span>
              </div>
            )}
            {plzResult && !plzLoading && (
              <div className="flex-1 p-2.5 bg-[#F0FDF4] border border-emerald-200 rounded-xl text-xs text-emerald-950 font-medium">
                <span className="font-bold text-[#1E7B52]">{plzResult.canton}</span> – {plzResult.name} (BFS #{selectedBfs})
              </div>
            )}
          </div>

          {/* Ambiguous PLZ Dropdown */}
          {plzResult && plzResult.municipalities.length > 1 && (
            <div className="space-y-1.5 pt-2">
              <label className="text-xs font-semibold text-slate-700">
                Mehrere Gemeinden gefunden – bitte wähle deine genaue Wohngemeinde:
              </label>
              <select
                value={selectedBfs}
                onChange={e => setSelectedBfs(e.target.value)}
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
            <span>Wie ist dein Zivilstand und deine Familiensituation?</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Bestimmt den massgebenden Grundtarif (Ledigen-, Verheirateten- oder Elterntarif gemäss Art. 36 DBG).
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-5">
          {/* Civil status chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Zivilstand</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {[
                { id: 'single', label: 'Ledig' },
                { id: 'married', label: 'Verheiratet' },
                { id: 'partnership', label: 'Eingetr. Partnerschaft' },
                { id: 'divorced', label: 'Geschieden' },
                { id: 'widowed', label: 'Verwitwet' },
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
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Children chips */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Kinder mit Abzugsberechtigung</label>
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
                  {k === 0 ? 'Keine' : k === 3 ? '3 oder mehr' : `${k} Kind${k > 1 ? 'er' : ''}`}
                </button>
              ))}
            </div>
          </div>

          {/* Tax Year */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-2">Steuerjahr</label>
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
                  Steuerjahr {y}
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
            <span>Passt SunTax zu deiner Situation?</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Wir unterstützen Angestellte, Rentner und selbstbewohnte Eigenheime.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          {[
            {
              id: 'isEmployedOrPensioner',
              label: 'Bist du angestellt oder Rentner/in?',
              desc: 'Lohnempfänger mit Lohnausweis oder Rente (AHV/Pensionskasse)',
              val: eligibility.isEmployedOrPensioner,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, isEmployedOrPensioner: v })),
              goodVal: true,
            },
            {
              id: 'isSelfEmployed',
              label: 'Übst du eine selbstständige Haupttätigkeit aus?',
              desc: 'Einzelfirma, freiberufliche Praxis oder GmbH-Inhaber',
              val: eligibility.isSelfEmployed,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, isSelfEmployed: v })),
              goodVal: false,
            },
            {
              id: 'hasRentedOrForeignProperty',
              label: 'Besitzt du vermietete Liegenschaften oder Liegenschaften im Ausland / anderen Kanton?',
              desc: 'Selbstbewohntes Wohneigentum im Wohnkanton ist voll unterstützt.',
              val: eligibility.hasRentedOrForeignProperty,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, hasRentedOrForeignProperty: v })),
              goodVal: false,
            },
            {
              id: 'isSourceTaxed',
              label: 'Wirst du an der Quelle besteuert (Quellensteuer)?',
              desc: 'Ordentliche Besteuerung ohne Quellensteuer-Abrechnung',
              val: eligibility.isSourceTaxed,
              setVal: (v: boolean) => setEligibility(e => ({ ...e, isSourceTaxed: v })),
              goodVal: false,
            },
          ].map(q => {
            const isOk = q.val === q.goodVal
            return (
              <div
                key={q.id}
                className="p-3.5 rounded-xl border border-slate-200 bg-[#FBFAF7] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div>
                  <h4 className="font-bold text-slate-800">{q.label}</h4>
                  <p className="text-slate-500 text-[11px] mt-0.5">{q.desc}</p>
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
                    Ja
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
                    Nein
                  </button>
                </div>
              </div>
            )
          })}

          {!isEligible && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 flex items-start gap-2.5 mt-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
              <div>
                <span className="font-bold">Aktuell noch nicht unterstützt:</span> SunTax unterstützt derzeit ausschliesslich Angestellte und Rentner ohne ausserkantonale Liegenschaften oder Quellensteuer. Diese komplexen Szenarien kommen bald!
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Action Buttons ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-2">
        <Button asChild variant="outline" size="sm" className="text-xs rounded-xl">
          <Link href="/dashboard">
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />
            Abbrechen
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
              <span>Dossier wird erstellt...</span>
            </>
          ) : (
            <>
              <span>Weiter zu Schritt 2: Dokumente</span>
              <ChevronRight className="h-4 w-4" />
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
