'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ShieldCheck,
  Zap,
  FileText,
  Calculator,
  Lock,
  ArrowRight,
  CheckCircle2,
  TrendingDown,
  Sparkles,
  HelpCircle,
  ExternalLink,
  Search,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── All 26 Swiss Cantons with Benchmark Multipliers ─────────────────────────
const CANTONS = [
  { code: 'ZH', name: 'Zürich', multiplier: '119%', cap: 'CHF 5,000' },
  { code: 'BE', name: 'Bern', multiplier: '154%', cap: 'CHF 6,700' },
  { code: 'LU', name: 'Luzern', multiplier: '175%', cap: 'CHF 6,000' },
  { code: 'UR', name: 'Uri', multiplier: '98%', cap: 'CHF 6,000' },
  { code: 'SZ', name: 'Schwyz', multiplier: '120%', cap: 'CHF 6,000' },
  { code: 'OW', name: 'Obwalden', multiplier: '140%', cap: 'CHF 6,000' },
  { code: 'NW', name: 'Nidwalden', multiplier: '120%', cap: 'CHF 6,000' },
  { code: 'GL', name: 'Glarus', multiplier: '63%', cap: 'CHF 6,000' },
  { code: 'ZG', name: 'Zug', multiplier: '82%', cap: 'CHF 6,000' },
  { code: 'FR', name: 'Fribourg', multiplier: '81%', cap: 'CHF 6,000' },
  { code: 'SO', name: 'Solothurn', multiplier: '115%', cap: 'CHF 7,000' },
  { code: 'BS', name: 'Basel-Stadt', multiplier: '100%', cap: 'CHF 3,000' },
  { code: 'BL', name: 'Basel-Landschaft', multiplier: '65%', cap: 'CHF 6,000' },
  { code: 'SH', name: 'Schaffhausen', multiplier: '95%', cap: 'CHF 6,000' },
  { code: 'AR', name: 'Appenzell AR', multiplier: '430%', cap: 'CHF 6,000' },
  { code: 'AI', name: 'Appenzell AI', multiplier: '94%', cap: 'CHF 6,000' },
  { code: 'SG', name: 'St. Gallen', multiplier: '144%', cap: 'CHF 4,500' },
  { code: 'GR', name: 'Graubünden', multiplier: '90%', cap: 'CHF 6,000' },
  { code: 'AG', name: 'Aargau', multiplier: '95%', cap: 'CHF 7,000' },
  { code: 'TG', name: 'Thurgau', multiplier: '62%', cap: 'CHF 6,000' },
  { code: 'TI', name: 'Ticino', multiplier: '77%', cap: 'CHF 6,000' },
  { code: 'VD', name: 'Vaud', multiplier: '78%', cap: 'CHF 3,000' },
  { code: 'VS', name: 'Valais', multiplier: '110%', cap: 'CHF 6,000' },
  { code: 'NE', name: 'Neuchâtel', multiplier: '70%', cap: 'CHF 6,000' },
  { code: 'GE', name: 'Genève', multiplier: '45%', cap: 'CHF 500' },
  { code: 'JU', name: 'Jura', multiplier: '195%', cap: 'CHF 6,000' },
]

export default function LandingPage() {
  const [selectedCanton, setSelectedCanton] = useState<(typeof CANTONS)[number]>(CANTONS[0]!)
  const [searchTerm, setSearchTerm] = useState('')

  const activeCanton = selectedCanton || CANTONS[0]!

  const filteredCantons = CANTONS.filter(
    c =>
      c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.code.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-red-500 selection:text-white">
      {/* ─── Top Announcement Bar ────────────────────────────────────────────── */}
      <div className="bg-slate-900 text-slate-200 text-xs py-2 px-4 text-center font-medium border-b border-slate-800">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white font-semibold">Tax Year 2025/2026 Ready:</span>
          All 26 Swiss cantonal tax rules, municipality multipliers, and eCH-0196 XML standards updated.
        </span>
      </div>

      {/* ─── Navigation Bar ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/80 transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="swiss-cross-badge group-hover:scale-105 transition-transform" />
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-slate-900 leading-none">
                Sun<span className="text-red-600">Tax</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 mt-0.5">
                Swiss Tax Intelligence
              </span>
            </div>
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-slate-600">
            <a href="#how-it-works" className="hover:text-red-600 transition-colors">
              How It Works
            </a>
            <a href="#cantons" className="hover:text-red-600 transition-colors">
              Supported Cantons
            </a>
            <a href="#security" className="hover:text-red-600 transition-colors">
              Security &amp; Privacy
            </a>
            <a href="#faq" className="hover:text-red-600 transition-colors">
              FAQ
            </a>
          </div>

          {/* Auth CTA */}
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
              <Link href="/login">Sign In</Link>
            </Button>
            <Button
              asChild
              className="bg-red-600 hover:bg-red-700 text-white shadow-md shadow-red-600/20 text-sm font-semibold px-4"
            >
              <Link href="/register">
                Start Free Tax Return
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ───────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 overflow-hidden bg-radial-subtle">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-red-50 border border-red-200/80 text-red-700 text-xs font-bold tracking-wide shadow-xs">
              <Sparkles className="h-3.5 w-3.5 text-red-600" />
              <span>Next-Gen Swiss Tax Platform · 2025/2026 Season</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl font-black text-slate-900 tracking-tight leading-[1.08]">
              File Your Swiss Tax Return in <span className="text-red-600 underline decoration-red-200 underline-offset-8">Minutes</span>. Zero Stress.
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-slate-600 leading-relaxed max-w-2xl mx-auto font-normal">
              Upload your documents. Our AI extracts your salary and bank statements, calculates every statutory deduction automatically, and generates an official <span className="font-semibold text-slate-800">Tax Return Summary PDF and eCH-compliant export</span> ready for your canton.
            </p>

            {/* CTA Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-bold px-8 h-13 text-base shadow-xl shadow-red-600/25 transition-all hover:scale-[1.02]"
              >
                <Link href="/register">
                  Start Your 2025 Tax Return
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-13 text-base font-semibold border-slate-300 hover:bg-slate-100 text-slate-700"
              >
                <a href="#how-it-works">See How SunTax Works</a>
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-slate-500">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>100% Deterministic Engine (No AI Math)</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Official eCH-0196 XML Standard</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span>Swiss Data Privacy (nFADP Compliant)</span>
              </div>
            </div>
          </div>

          {/* ── Live Product Mockup Card ──────────────────────────────────────── */}
          <div className="mt-14 max-w-5xl mx-auto">
            <div className="rounded-2xl p-2 sm:p-3 bg-gradient-to-b from-slate-200 via-slate-100 to-white shadow-2xl border border-slate-200/90">
              <div className="rounded-xl bg-white border border-slate-200 overflow-hidden shadow-sm">
                {/* Window Chrome */}
                <div className="px-4 py-3 bg-slate-900 flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-rose-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-amber-500/80 inline-block" />
                    <span className="w-3 h-3 rounded-full bg-emerald-500/80 inline-block" />
                    <span className="ml-2 text-xs font-mono text-slate-400">suntax.ch/tax-returns/zh-2025</span>
                  </div>
                  <Badge variant="outline" className="text-[11px] bg-slate-800 text-emerald-400 border-emerald-500/30">
                    ● Calculation Verified
                  </Badge>
                </div>

                {/* Mock Workbench Body */}
                <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50/50">
                  {/* Column 1: Document OCR stream */}
                  <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>DOCUMENTS PARSED</span>
                      <Badge className="bg-emerald-100 text-emerald-800 text-[10px]">3 of 3 Verified</Badge>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <span className="font-medium">Lohnausweis_2025.pdf</span>
                        <span className="font-mono text-emerald-600 font-bold">CHF 118,500</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <span className="font-medium">Pillar_3a_UBS.pdf</span>
                        <span className="font-mono text-emerald-600 font-bold">CHF 7,258</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between">
                        <span className="font-medium">ZKB_Bank_Statement.pdf</span>
                        <span className="font-mono text-slate-700">CHF 48,200</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Deductions Optimized */}
                  <div className="p-4 rounded-xl bg-white border border-slate-200/80 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                      <span>DEDUCTIONS CLAIMED</span>
                      <span className="text-red-600 text-xs font-mono font-bold">CHF 17,958</span>
                    </div>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Pillar 3a (Max statutory)</span>
                        <span className="font-mono font-bold text-slate-900">CHF 7,258</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">3% Professional Lump Sum</span>
                        <span className="font-mono font-bold text-slate-900">CHF 3,555</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Commuting Pass (ZVV/GA)</span>
                        <span className="font-mono font-bold text-slate-900">CHF 2,600</span>
                      </div>
                      <div className="flex justify-between py-1 border-b border-slate-100">
                        <span className="text-slate-600">Basic Health Insurance</span>
                        <span className="font-mono font-bold text-slate-900">CHF 2,800</span>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Live Tax Due Result */}
                  <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 text-white space-y-3 shadow-md flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                        <span>CANTON ZÜRICH (119%)</span>
                        <Badge className="bg-red-600 text-white text-[10px]">Optimized</Badge>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">Total Tax Due (Federal + Canton + Municipal):</p>
                      <p className="text-2xl font-black font-mono text-emerald-400 mt-1">CHF 12,410.85</p>
                      <div className="mt-2 text-[11px] text-slate-300 flex items-center gap-1.5">
                        <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Estimated Tax Saved: <strong className="text-white">CHF 3,240.00</strong></span>
                      </div>
                    </div>
                    <div className="pt-2">
                      <Button size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold">
                        Download eCH-0196 XML &amp; PDF
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Bento Grid: Core Innovations ───────────────────────────────────── */}
      <section id="how-it-works" className="py-20 md:py-28 bg-white border-y border-slate-200/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-16">
          <div className="text-center max-w-2xl mx-auto space-y-4">
            <Badge className="bg-slate-100 text-slate-800 text-xs font-bold uppercase tracking-wider">
              Architecture &amp; Features
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Engineered Specifically for Swiss Tax Law
            </h2>
            <p className="text-slate-600 text-base">
              SunTax combines modern multimodal AI document understanding with 100% deterministic mathematical tax calculation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 card-luxury">
              <div className="w-12 h-12 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Multimodal Document OCR</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Drag and drop your Lohnausweis, Pillar 3a confirmation, and bank accounts. Text and figures are automatically extracted, cross-referenced, and merged into a single unified taxpayer profile.
              </p>
            </div>

            {/* Card 2 */}
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 card-luxury">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Calculator className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Zero AI Hallucination Math</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                We never ask an LLM to calculate your taxes. Our deterministic tax engine implements official progressive tax bracket tables (DBG &amp; StG) rounded to the exact 5 Rappen required by Swiss tax authorities.
              </p>
            </div>

            {/* Card 3 */}
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 card-luxury">
              <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
                <FileText className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Official Filing Summary & Export</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Generate structured eCH-compliant data export for your records, plus an Official Tax Return Summary PDF with complete instructions for your canton’s official portal or postal submission.
              </p>
            </div>

            {/* Card 4 */}
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 card-luxury">
              <div className="w-12 h-12 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
                <Sparkles className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">AI Submission Roadmap &amp; Copilot</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Real-time readiness audit (0–100%) that tells you exactly which documents are missing, flags unclaimed deductions, and answers questions about Swiss tax laws.
              </p>
            </div>

            {/* Card 5 */}
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 card-luxury">
              <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center">
                <TrendingDown className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">ICTax &amp; Crypto Valuations</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Includes official ESTV Kursliste benchmarks for securities, foreign dividends, and cryptocurrencies, ensuring wealth tax is computed accurately and tax-free capital gains are respected.
              </p>
            </div>

            {/* Card 6 */}
            <div className="p-8 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-4 card-luxury">
              <div className="w-12 h-12 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center">
                <Lock className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Bank-Grade Tenant Isolation</h3>
              <p className="text-sm text-slate-600 leading-relaxed">
                Every tax return is encrypted and strictly isolated by user ID at both the API and database levels. Your financial documents are never shared or used to train public models.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Interactive Canton Explorer ────────────────────────────────────── */}
      <section id="cantons" className="py-20 md:py-28 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-4">
            <Badge className="bg-red-50 text-red-700 border-red-200 text-xs font-bold uppercase">
              26 Cantons Supported
            </Badge>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              Every Canton. Every Municipality. Fully Covered.
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Swiss tax laws vary by canton. SunTax implements the specific deductions, brackets, and multipliers for all 26 cantons.
            </p>
          </div>

          {/* Search Bar */}
          <div className="max-w-md mx-auto relative">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search canton name or code (e.g. Zürich, ZG, Bern)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-red-500 shadow-xs"
            />
          </div>

          {/* Canton Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-7 gap-3">
            {filteredCantons.map(canton => (
              <button
                key={canton.code}
                onClick={() => setSelectedCanton(canton)}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  activeCanton.code === canton.code
                    ? 'bg-red-600 text-white border-red-600 shadow-md scale-105'
                    : 'bg-white hover:bg-slate-100 text-slate-800 border-slate-200 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm">{canton.code}</span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                      activeCanton.code === canton.code
                        ? 'bg-red-700 text-white'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {canton.multiplier}
                  </span>
                </div>
                <p
                  className={`text-xs mt-1 truncate ${
                    activeCanton.code === canton.code ? 'text-red-100' : 'text-slate-500'
                  }`}
                >
                  {canton.name}
                </p>
              </button>
            ))}
          </div>

          {/* Selected Canton Detail Box */}
          <div className="max-w-xl mx-auto p-6 rounded-2xl bg-white border border-slate-200 shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-lg font-bold text-slate-900">
                  Canton {activeCanton.name} ({activeCanton.code})
                </h4>
                <p className="text-xs text-slate-500">Tax Year 2025/2026 Rules Active</p>
              </div>
              <Badge className="bg-red-50 text-red-700 border-red-200 text-xs">
                Canton Capital Benchmark: {activeCanton.multiplier}
              </Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block">Commuting Deduction Cap:</span>
                <span className="font-bold text-slate-800 mt-0.5 block">{activeCanton.cap}</span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                <span className="text-slate-500 block">Pillar 3a Max Allowed:</span>
                <span className="font-bold text-slate-800 mt-0.5 block">CHF 7,258 / CHF 36,288</span>
              </div>
            </div>
            <div className="pt-2">
              <Button asChild size="sm" className="w-full bg-red-600 hover:bg-red-700 text-white text-xs">
                <Link href="/register">Start Tax Return for Canton {activeCanton.name}</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Comparison Section ─────────────────────────────────────────────── */}
      <section className="py-20 md:py-28 bg-white border-t border-slate-200/80">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
          <div className="text-center max-w-2xl mx-auto space-y-3">
            <h2 className="text-3xl font-extrabold text-slate-900">Why Residents Choose SunTax</h2>
            <p className="text-slate-600 text-sm">
              Stop paying hundreds of francs to traditional tax advisors for simple returns.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm bg-white">
            <div className="grid grid-cols-3 bg-slate-900 text-white p-4 font-bold text-xs sm:text-sm">
              <div>Features &amp; Experience</div>
              <div className="text-center text-red-400">SunTax Platform</div>
              <div className="text-center text-slate-400">Traditional Fiduciary (Treuhand)</div>
            </div>
            {[
              { f: 'Time to complete', a: '10 to 15 minutes', b: '2 to 4 weeks' },
              { f: 'Average cost', a: 'Free / Fraction of cost', b: 'CHF 400 – CHF 1,200' },
              { f: 'Document input', a: 'AI vision & OCR auto-fill', b: 'Physical folder / paperwork' },
              { f: 'Filing format', a: 'Official eCH-0196 XML + PDF', b: 'Paper mail / scanned copies' },
              { f: 'Availability', a: '24/7 on any device', b: 'Office hours by appointment' },
              { f: 'Deductions optimization', a: 'Automated statutory audit', b: 'Manual checklist' },
            ].map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-3 p-4 text-xs sm:text-sm border-b border-slate-100 hover:bg-slate-50 items-center"
              >
                <div className="font-medium text-slate-900">{row.f}</div>
                <div className="text-center font-bold text-emerald-600 flex items-center justify-center gap-1.5">
                  <Check className="h-4 w-4" />
                  <span>{row.a}</span>
                </div>
                <div className="text-center text-slate-500">{row.b}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 bg-slate-50 border-t border-slate-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="text-center space-y-3">
            <h2 className="text-3xl font-extrabold text-slate-900">Frequently Asked Questions</h2>
            <p className="text-slate-600 text-sm">Everything you need to know about filing in Switzerland with SunTax.</p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: 'How does SunTax calculate my taxes without errors?',
                a: 'SunTax utilizes a 100% deterministic calculation engine programmed with the official progressive tax bracket formulas from the Federal Tax Administration (ESTV) and Cantonal Tax Offices (StG). We never use AI to guess numbers or tax rates.',
              },
              {
                q: 'How do I submit my tax return to my cantonal tax authority?',
                a: 'SunTax generates an official Tax Return Filing Summary PDF and structured eCH-compliant data export. You can complete your official submission via your canton’s official electronic portal (e.g., eTax.zh for Zurich, BE-Login TaxMe for Bern, eTax.zug for Zug, BalTax for Basel-Stadt, SmartTax for Aargau, eTax.sg for St. Gallen, and eTax.sz for Schwyz) or by mailing the signed Summary PDF with original certificates.',
              },
              {
                q: 'Is my personal financial data protected?',
                a: 'Yes. Your sensitive documents and financial records are protected with bank-grade AES-256 encryption. We comply with the Swiss Federal Data Protection Act (nFADP) and GDPR. Customer data is strictly isolated and never used to train public AI models.',
              },
              {
                q: 'Which documents should I have ready?',
                a: 'The most important documents are your Salary Certificate (Lohnausweis) from your employer, year-end bank statements with interest certificates, and your Pillar 3a contribution confirmation.',
              },
            ].map((faq, idx) => (
              <div key={idx} className="p-6 rounded-2xl bg-white border border-slate-200/80 shadow-xs space-y-2">
                <h4 className="font-bold text-slate-900 text-base">{faq.q}</h4>
                <p className="text-sm text-slate-600 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA Banner ───────────────────────────────────────────────── */}
      <section className="py-16 bg-gradient-to-br from-red-600 via-red-700 to-rose-700 text-white text-center">
        <div className="max-w-4xl mx-auto px-4 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
            Ready to Finish Your Swiss Tax Return Today?
          </h2>
          <p className="text-red-100 text-base max-w-xl mx-auto">
            Join thousands of residents in Zurich, Bern, Zug, and Geneva who file with SunTax.
          </p>
          <div className="pt-2">
            <Button
              asChild
              size="lg"
              className="bg-white text-red-700 hover:bg-slate-100 font-extrabold px-8 h-12 text-base shadow-xl"
            >
              <Link href="/register">
                Start Your Tax Return Now
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────────────── */}
      <footer className="bg-slate-900 text-slate-400 text-xs py-12 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="swiss-cross-badge" />
              <span className="text-lg font-bold text-white">SunTax</span>
            </div>
            <p className="text-slate-500 leading-relaxed">
              AI-powered Swiss Income Tax Return Platform. Supporting federal and cantonal tax compliance for all 26 cantons.
            </p>
          </div>
          <div>
            <h5 className="font-bold text-white mb-3 uppercase tracking-wider text-[11px]">Supported Cantons</h5>
            <ul className="space-y-1.5 text-slate-400">
              <li>Zürich (ZH) · Bern (BE)</li>
              <li>Zug (ZG) · Basel (BS/BL)</li>
              <li>Geneva (GE) · Vaud (VD)</li>
              <li>All 26 Swiss Cantons</li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-white mb-3 uppercase tracking-wider text-[11px]">Standards &amp; Export</h5>
            <ul className="space-y-1.5 text-slate-400">
              <li>eCH-0196 XML Official Standard</li>
              <li>ESTV Kursliste Tax Values</li>
              <li>Lohnausweis Form 11 Audit</li>
              <li>Swiss nFADP &amp; GDPR Compliant</li>
            </ul>
          </div>
          <div>
            <h5 className="font-bold text-white mb-3 uppercase tracking-wider text-[11px]">Legal</h5>
            <p className="text-slate-500 leading-relaxed">
              SunTax provides software assistance and deterministic tax computation based on published Swiss tax authority rates. Final tax assessments are issued by your cantonal tax administration.
            </p>
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-10 pt-6 border-t border-slate-800 text-center text-slate-600">
          © {new Date().getFullYear()} SunTax Platform. Built for Switzerland. All rights reserved.
        </div>
      </footer>
    </div>
  )
}
