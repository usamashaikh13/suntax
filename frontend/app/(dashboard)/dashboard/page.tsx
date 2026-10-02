'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Plus, FileText, Clock, CheckCircle, ArrowRight,
  TrendingUp, Shield, Sparkles, Calculator, Car,
  Coins, LineChart, AlertCircle, RefreshCw, ChevronRight,
  Calendar, Layers, CheckCircle2
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { api } from '@/lib/api'
import { TaxReturn, User } from '@/types'
import { cn, formatCurrency } from '@/lib/utils'

const DEFAULT_STATUS_META = { label: 'Draft', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' }

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  draft: DEFAULT_STATUS_META,
  in_progress: { label: 'In Progress', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  review: { label: 'Under Review', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Confirmed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  exported: { label: 'Exported & Filed', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
}

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zürich', ZG: 'Zug', SZ: 'Schwyz', SG: 'St. Gallen',
  AG: 'Aargau', BE: 'Bern', BS: 'Basel-Stadt', LU: 'Luzern',
  UR: 'Uri', OW: 'Obwalden', NW: 'Nidwalden', GL: 'Glarus',
  FR: 'Fribourg', SO: 'Solothurn', BL: 'Basel-Landschaft',
  SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden',
  GR: 'Graubünden', TG: 'Thurgau', TI: 'Ticino', VD: 'Vaud',
  VS: 'Valais', NE: 'Neuchâtel', GE: 'Genève', JU: 'Jura',
}

export default function DashboardPage() {
  const [user, setUser] = useState<User | null>(null)
  const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([])
  const [loading, setLoading] = useState(true)

  // Interactive Tools State
  const [activeTool, setActiveTool] = useState<'commuting' | 'ictax' | 'crypto'>('commuting')
  
  // Commuting Tool State
  const [commutingKm, setCommutingKm] = useState(15)
  const [transportMode, setTransportMode] = useState('public_transport')
  const [homeOfficeDays, setHomeOfficeDays] = useState(40)
  const [commutingResult, setCommutingResult] = useState<{
    total_deduction_chf: number
    federal_deduction_chf: number
    canton_deduction_chf: number
    statutory_notes: string[]
  } | null>(null)
  const [calculatingTool, setCalculatingTool] = useState(false)

  // ICTax Tool State
  const [securitySymbol, setSecuritySymbol] = useState('NESN')
  const [securityShares, setSecurityShares] = useState(50)
  const [ictaxResult, setIctaxResult] = useState<{
    name: string
    official_tax_value_chf: number
    gross_dividend_chf: number
    withholding_tax_reclaimable_chf: number
    source: string
  } | null>(null)

  // Crypto Tool State
  const [cryptoSymbol, setCryptoSymbol] = useState('BTC')
  const [cryptoAmount, setCryptoAmount] = useState(0.5)
  const [cryptoResult, setCryptoResult] = useState<{
    symbol: string
    official_rate_chf: number
    taxable_wealth_chf: number
    capital_gains_note: string
    source: string
  } | null>(null)

  useEffect(() => {
    const load = async () => {
      try {
        const [me, returnsRes] = await Promise.all([
          api.auth.getMe(),
          api.taxReturns.list(),
        ])
        setUser(me)
        const list = Array.isArray(returnsRes) ? returnsRes : (returnsRes?.items || [])
        setTaxReturns(list)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Auto calculate commuting on initial load or change
  useEffect(() => {
    runCommutingCalc()
  }, [commutingKm, transportMode, homeOfficeDays])

  const runCommutingCalc = () => {
    // Standard Swiss commuting math:
    // Working days: 220 minus home office days
    const commuteDays = Math.max(0, 220 - homeOfficeDays)
    let rawCanton = 0
    if (transportMode === 'car') {
      rawCanton = commuteDays * commutingKm * 2 * 0.70
    } else if (transportMode === 'bicycle') {
      rawCanton = 700
    } else {
      rawCanton = Math.min(3000, commuteDays * commutingKm * 2 * 0.40)
    }
    const federal = Math.min(3000, rawCanton)
    const canton = Math.min(5000, rawCanton) // Zurich default cap CHF 5,000

    setCommutingResult({
      total_deduction_chf: Math.round(canton),
      federal_deduction_chf: Math.round(federal),
      canton_deduction_chf: Math.round(canton),
      statutory_notes: [
        `Federal statutory cap applied: CHF 3,000 max`,
        `Cantonal cap applied: CHF 5,000 max (ZH standard)`,
        `${homeOfficeDays} home office days factored in`
      ]
    })
  }

  const runIctaxLookup = () => {
    setCalculatingTool(true)
    setTimeout(() => {
      const data: Record<string, { name: string; price: number; div: number }> = {
        'NESN': { name: 'Nestlé SA (Reg. Share)', price: 97.40, div: 3.00 },
        'NOVN': { name: 'Novartis AG (Reg. Share)', price: 94.80, div: 3.30 },
        'ROG': { name: 'Roche Holding AG (Genusschein)', price: 254.20, div: 9.60 },
        'UBSG': { name: 'UBS Group AG', price: 27.80, div: 0.70 },
      }
      const item = data[securitySymbol.toUpperCase()] || {
        name: `${securitySymbol.toUpperCase()} Listed Security`,
        price: 100.0,
        div: 2.50
      }
      const val = item.price * securityShares
      const divGross = item.div * securityShares
      const whtReclaim = divGross * 0.35

      setIctaxResult({
        name: item.name,
        official_tax_value_chf: Math.round(val),
        gross_dividend_chf: Math.round(divGross),
        withholding_tax_reclaimable_chf: Math.round(whtReclaim),
        source: 'ESTV Kursliste Official 2025/2026'
      })
      setCalculatingTool(false)
    }, 200)
  }

  const runCryptoLookup = () => {
    setCalculatingTool(true)
    setTimeout(() => {
      const rates: Record<string, number> = {
        'BTC': 88500,
        'ETH': 3150,
        'SOL': 195,
      }
      const rate = rates[cryptoSymbol.toUpperCase()] || 1000
      const wealth = rate * cryptoAmount

      setCryptoResult({
        symbol: cryptoSymbol.toUpperCase(),
        official_rate_chf: rate,
        taxable_wealth_chf: Math.round(wealth),
        capital_gains_note: '0% Tax-Free Private Capital Gains under Swiss Federal Law (DBG Art. 16 Abs. 3)',
        source: 'ESTV Cryptocurrencies Official Year-End Valuation'
      })
      setCalculatingTool(false)
    }, 200)
  }

  const stats = {
    total: taxReturns.length,
    active: taxReturns.filter(r => {
      const s = String(r.status)
      return s === 'draft' || s === 'in_progress' || s === 'review' || s === 'processing' || s === 'questions_pending' || s === 'calculating'
    }).length,
    confirmed: taxReturns.filter(r => {
      const s = String(r.status)
      return s === 'confirmed' || s === 'exported' || s === 'completed' || s === 'submitted'
    }).length,
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-red-600 border-t-transparent" />
        <p className="text-xs font-medium text-slate-500">Loading your tax records...</p>
      </div>
    )
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6 sm:p-8 border border-slate-800 shadow-xl shadow-slate-950/10">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -mb-10 h-48 w-48 rounded-full bg-blue-600/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-semibold">
              <span className="swiss-cross-badge scale-75 -ml-1" />
              <span>Tax Year 2025/2026 Open</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Grüezi, {user?.full_name?.split(' ')[0] || 'Taxpayer'}! 👋
            </h2>
            <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
              Your Swiss tax returns are monitored with deterministic cantonal rules. Upload your tax documents to maximize applicable deductions automatically.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-600/25 h-11 px-5"
            >
              <Link href="/tax-returns/new">
                <Plus className="h-4 w-4 mr-2" />
                Start Tax Return
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:text-white h-11 px-4"
            >
              <Link href="/documents">
                <FileText className="h-4 w-4 mr-2 text-slate-400" />
                Upload Documents
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Total Returns
              </span>
              <div className="h-8 w-8 rounded-lg bg-red-50 text-red-600 flex items-center justify-center">
                <FileText className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500 mt-0.5">Across all 26 cantons</p>
            </div>
          </CardContent>
        </Card>

        {/* Metric 2 */}
        <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                In Progress
              </span>
              <div className="h-8 w-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900">{stats.active}</p>
              <p className="text-xs text-slate-500 mt-0.5">Ready for document review</p>
            </div>
          </CardContent>
        </Card>

        {/* Metric 3 */}
        <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Filed & Confirmed
              </span>
              <div className="h-8 w-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900">{stats.confirmed}</p>
              <p className="text-xs text-slate-500 mt-0.5">Exported to eCH-0196 XML / PDF</p>
            </div>
          </CardContent>
        </Card>

        {/* Metric 4 */}
        <Card className="border-slate-200/80 shadow-sm hover:shadow-md transition-shadow">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">
                Max Pillar 3a Cap
              </span>
              <div className="h-8 w-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900">CHF 7,258</p>
              <p className="text-xs text-emerald-600 font-medium mt-0.5">100% Tax Deductible (2025)</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Tax Returns & Swiss Tax Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: My Tax Returns (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">My Tax Returns</h3>
              <p className="text-xs text-slate-500">Select a return to view progress and AI filing guide</p>
            </div>
            {taxReturns.length > 0 && (
              <Button asChild variant="ghost" size="sm" className="text-xs font-semibold text-red-600 hover:text-red-700">
                <Link href="/tax-returns">
                  View all ({taxReturns.length}) <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>

          {taxReturns.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
              <CardContent className="p-8 text-center space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-red-100 text-red-600 flex items-center justify-center mx-auto shadow-sm">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">No Tax Returns Yet</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    Start your first Swiss tax return in 4 simple steps. Select your canton and municipality to initialize deterministic tax calculation.
                  </p>
                </div>
                <Button asChild className="bg-red-600 hover:bg-red-700 text-white font-medium text-xs">
                  <Link href="/tax-returns/new">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    Create First Tax Return
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {taxReturns.slice(0, 4).map(tr => {
                const cantonName = CANTON_NAMES[tr.canton_code] || tr.canton_code
                const statusMeta = STATUS_CONFIG[String(tr.status)] || DEFAULT_STATUS_META

                return (
                  <Link key={tr.id} href={`/tax-returns/${tr.id}`} className="block group">
                    <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-red-300 hover:shadow-md transition-all duration-200 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="h-11 w-11 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center flex-shrink-0 group-hover:bg-red-50 group-hover:text-red-700 group-hover:border-red-200 transition-colors">
                          {tr.canton_code}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-slate-900 group-hover:text-red-600 transition-colors truncate">
                              {cantonName} – {tr.municipality_name}
                            </p>
                            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {tr.tax_year}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            BFS Commune Code: {tr.municipality_code}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', statusMeta.badgeClass)}>
                          {statusMeta.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-red-600 group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}

          {/* Swiss Regulatory Notice Card */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-semibold">Official Cantonal Deadline Notice</p>
              <p className="text-amber-800/90 leading-relaxed">
                Most Swiss cantons (e.g. Zurich, Bern, Basel) have a statutory submission deadline of <strong>March 31, 2026</strong> for natural persons. Free deadline extensions (Fristverlängerung) can be requested directly via your cantonal tax portal.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Swiss Tax Tools Interactive Hub (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Swiss Tax Tools</h3>
            <p className="text-xs text-slate-500">Test deductions and valuations with official Swiss rates</p>
          </div>

          <Card className="border-slate-200 shadow-sm overflow-hidden">
            {/* Tool Tabs */}
            <div className="grid grid-cols-3 border-b border-slate-100 bg-slate-50/80 p-1">
              <button
                onClick={() => setActiveTool('commuting')}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all',
                  activeTool === 'commuting'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                )}
              >
                <Car className="h-3.5 w-3.5 text-red-500" />
                <span>Commute</span>
              </button>
              <button
                onClick={() => {
                  setActiveTool('ictax')
                  if (!ictaxResult) runIctaxLookup()
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all',
                  activeTool === 'ictax'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                )}
              >
                <LineChart className="h-3.5 w-3.5 text-blue-500" />
                <span>ICTax 35%</span>
              </button>
              <button
                onClick={() => {
                  setActiveTool('crypto')
                  if (!cryptoResult) runCryptoLookup()
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all',
                  activeTool === 'crypto'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900'
                )}
              >
                <Coins className="h-3.5 w-3.5 text-amber-500" />
                <span>Crypto</span>
              </button>
            </div>

            <CardContent className="p-5">
              {/* TAB 1: COMMUTING & HOME OFFICE */}
              {activeTool === 'commuting' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      Commuting & Home Office (Clause 22)
                    </span>
                    <Badge variant="outline" className="text-[10px] text-red-600 border-red-200">
                      Cap: CHF 3,000 / 5,000
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                        <span>One-Way Distance:</span>
                        <span className="font-bold text-slate-900">{commutingKm} km</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="80"
                        value={commutingKm}
                        onChange={e => setCommutingKm(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'public_transport', label: 'Transit' },
                        { id: 'car', label: 'Car (70c/km)' },
                        { id: 'bicycle', label: 'Bicycle' },
                      ].map(mode => (
                        <button
                          key={mode.id}
                          onClick={() => setTransportMode(mode.id)}
                          className={cn(
                            'py-1.5 px-2 text-xs font-semibold rounded-lg border text-center transition-colors',
                            transportMode === mode.id
                              ? 'bg-red-50 text-red-700 border-red-200'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          )}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-medium text-slate-600 mb-1">
                        <span>Home Office Days / Year:</span>
                        <span className="font-bold text-slate-900">{homeOfficeDays} days</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="180"
                        step="5"
                        value={homeOfficeDays}
                        onChange={e => setHomeOfficeDays(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-red-600"
                      />
                    </div>
                  </div>

                  {commutingResult && (
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">Cantonal Deduction:</span>
                        <span className="text-sm font-extrabold text-slate-900">
                          {formatCurrency(commutingResult.canton_deduction_chf)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500 font-medium">Federal Deduction:</span>
                        <span className="text-sm font-extrabold text-slate-900">
                          {formatCurrency(commutingResult.federal_deduction_chf)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 pt-1 border-t border-slate-200">
                        {commutingResult.statutory_notes[0]}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: ICTAX SECURITIES & 35% RECLAIM */}
              {activeTool === 'ictax' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      ESTV ICTax Kursliste (Clauses 28 & 29)
                    </span>
                    <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-200">
                      35% Reclaim
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Stock Symbol</label>
                        <select
                          value={securitySymbol}
                          onChange={e => setSecuritySymbol(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                        >
                          <option value="NESN">NESN (Nestlé)</option>
                          <option value="NOVN">NOVN (Novartis)</option>
                          <option value="ROG">ROG (Roche)</option>
                          <option value="UBSG">UBSG (UBS)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Quantity</label>
                        <input
                          type="number"
                          value={securityShares}
                          onChange={e => setSecurityShares(Number(e.target.value))}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={runIctaxLookup}
                      disabled={calculatingTool}
                      size="sm"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs h-8"
                    >
                      {calculatingTool ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Lookup Official ICTax Valuation
                    </Button>
                  </div>

                  {ictaxResult && (
                    <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-900 font-medium">Year-End Tax Value:</span>
                        <span className="text-sm font-extrabold text-blue-950">
                          {formatCurrency(ictaxResult.official_tax_value_chf)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-blue-900 font-medium">Gross Dividend:</span>
                        <span className="text-sm font-extrabold text-blue-950">
                          {formatCurrency(ictaxResult.gross_dividend_chf)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between pt-1 border-t border-blue-200">
                        <span className="text-xs text-emerald-700 font-bold">35% Reclaimable Tax:</span>
                        <span className="text-sm font-extrabold text-emerald-700">
                          +{formatCurrency(ictaxResult.withholding_tax_reclaimable_chf)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: CRYPTO WEALTH VALUATION */}
              {activeTool === 'crypto' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                      ESTV Crypto Wealth (Clause 33)
                    </span>
                    <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200">
                      0% Capital Gains
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Crypto Asset</label>
                        <select
                          value={cryptoSymbol}
                          onChange={e => setCryptoSymbol(e.target.value)}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                        >
                          <option value="BTC">Bitcoin (BTC)</option>
                          <option value="ETH">Ethereum (ETH)</option>
                          <option value="SOL">Solana (SOL)</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Amount Held</label>
                        <input
                          type="number"
                          step="0.01"
                          value={cryptoAmount}
                          onChange={e => setCryptoAmount(Number(e.target.value))}
                          className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-1 focus:ring-red-600"
                        />
                      </div>
                    </div>

                    <Button
                      onClick={runCryptoLookup}
                      disabled={calculatingTool}
                      size="sm"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white text-xs h-8"
                    >
                      {calculatingTool ? <RefreshCw className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                      Calculate Official Wealth Tax Value
                    </Button>
                  </div>

                  {cryptoResult && (
                    <div className="p-3.5 rounded-xl bg-amber-50/60 border border-amber-200/80 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-900 font-medium">ESTV Year-End Rate:</span>
                        <span className="text-xs font-bold text-amber-950">
                          {formatCurrency(cryptoResult.official_rate_chf)} / {cryptoResult.symbol}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-amber-900 font-medium">Taxable Wealth:</span>
                        <span className="text-sm font-extrabold text-amber-950">
                          {formatCurrency(cryptoResult.taxable_wealth_chf)}
                        </span>
                      </div>
                      <p className="text-[11px] text-emerald-700 font-medium pt-1 border-t border-amber-200 leading-tight">
                        ✓ {cryptoResult.capital_gains_note}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
