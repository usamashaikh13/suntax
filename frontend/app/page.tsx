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
  UploadCloud,
  FileCheck2,
  Award,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// ─── All 26 Swiss Cantons with Benchmark Multipliers ─────────────────────────
const CANTONS = [
  { code: 'ZH', name: 'Zürich', multiplier: '119%', cap: 'CHF 5’000' },
  { code: 'BE', name: 'Bern', multiplier: '154%', cap: 'CHF 6’700' },
  { code: 'LU', name: 'Luzern', multiplier: '175%', cap: 'CHF 6’000' },
  { code: 'UR', name: 'Uri', multiplier: '98%', cap: 'CHF 6’000' },
  { code: 'SZ', name: 'Schwyz', multiplier: '120%', cap: 'CHF 6’000' },
  { code: 'OW', name: 'Obwalden', multiplier: '140%', cap: 'CHF 6’000' },
  { code: 'NW', name: 'Nidwalden', multiplier: '120%', cap: 'CHF 6’000' },
  { code: 'GL', name: 'Glarus', multiplier: '63%', cap: 'CHF 6’000' },
  { code: 'ZG', name: 'Zug', multiplier: '82%', cap: 'CHF 6’000' },
  { code: 'FR', name: 'Fribourg', multiplier: '81%', cap: 'CHF 6’000' },
  { code: 'SO', name: 'Solothurn', multiplier: '115%', cap: 'CHF 7’000' },
  { code: 'BS', name: 'Basel-Stadt', multiplier: '100%', cap: 'CHF 3’000' },
  { code: 'BL', name: 'Basel-Landschaft', multiplier: '65%', cap: 'CHF 6’000' },
  { code: 'SH', name: 'Schaffhausen', multiplier: '95%', cap: 'CHF 6’000' },
  { code: 'AR', name: 'Appenzell AR', multiplier: '430%', cap: 'CHF 6’000' },
  { code: 'AI', name: 'Appenzell AI', multiplier: '94%', cap: 'CHF 6’000' },
  { code: 'SG', name: 'St. Gallen', multiplier: '144%', cap: 'CHF 4’500' },
  { code: 'GR', name: 'Graubünden', multiplier: '90%', cap: 'CHF 6’000' },
  { code: 'AG', name: 'Aargau', multiplier: '95%', cap: 'CHF 7’000' },
  { code: 'TG', name: 'Thurgau', multiplier: '62%', cap: 'CHF 6’000' },
  { code: 'TI', name: 'Tessin', multiplier: '77%', cap: 'CHF 6’000' },
  { code: 'VD', name: 'Waadt', multiplier: '78%', cap: 'CHF 3’000' },
  { code: 'VS', name: 'Wallis', multiplier: '110%', cap: 'CHF 6’000' },
  { code: 'NE', name: 'Neuenburg', multiplier: '70%', cap: 'CHF 6’000' },
  { code: 'GE', name: 'Genf', multiplier: '45%', cap: 'CHF 500' },
  { code: 'JU', name: 'Jura', multiplier: '195%', cap: 'CHF 6’000' },
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
    <div className="min-h-screen bg-[#F6F6F4] text-[#14181F] selection:bg-[#1E7B52] selection:text-white">
      {/* ─── Top Announcement Bar ────────────────────────────────────────────── */}
      <div className="bg-[#14181F] text-slate-200 text-xs py-2 px-4 text-center font-medium border-b border-slate-800">
        <span className="inline-flex items-center gap-1.5 flex-wrap justify-center">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-white font-semibold">Steuerjahre 2025 &amp; 2026:</span>
          Alle 26 Schweizer Kantone, ESTV-Tarife und offizieller eCH-0119 V4.0.0 Export aktualisiert.
        </span>
      </div>

      {/* ─── Navigation Bar ─────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 bg-[#F6F6F4]/90 backdrop-blur-md border-b border-[#ECE8DF] transition-all">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-[#1E7B52] flex items-center justify-center text-white font-bold text-lg shadow-sm">
              S
            </div>
            <div className="flex flex-col">
              <span className="text-xl font-black tracking-tight text-[#14181F] leading-none">
                SunTax<span className="text-[#1E7B52]">.</span>
              </span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-[#777777] mt-0.5">
                Steuererklärung Schweiz
              </span>
            </div>
          </Link>

          {/* Links */}
          <div className="hidden md:flex items-center gap-8 text-sm font-semibold text-[#555555]">
            <a href="#how-it-works" className="hover:text-[#1E7B52] transition-colors">
              So funktioniert’s
            </a>
            <a href="#cantons" className="hover:text-[#1E7B52] transition-colors">
              Alle 26 Kantone
            </a>
            <a href="#security" className="hover:text-[#1E7B52] transition-colors">
              Sicherheit &amp; nDSG
            </a>
            <a href="#pricing" className="hover:text-[#1E7B52] transition-colors">
              Preise (CHF 39)
            </a>
            <a href="#faq" className="hover:text-[#1E7B52] transition-colors">
              Fragen &amp; Antworten
            </a>
          </div>

          {/* Auth CTA */}
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" className="text-sm font-semibold text-[#14181F] hover:text-[#1E7B52]">
              <Link href="/login">Anmelden</Link>
            </Button>
            <Button
              asChild
              className="bg-[#1E7B52] hover:bg-[#165C3D] text-white shadow-md shadow-[#1E7B52]/20 text-sm font-semibold px-4.5 rounded-xl h-10"
            >
              <Link href="/register">
                Jetzt starten
                <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        </div>
      </nav>

      {/* ─── Hero Section ───────────────────────────────────────────────────── */}
      <section className="relative pt-16 pb-20 md:pt-24 md:pb-32 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto space-y-6">
            {/* Pill */}
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-200/80 text-[#1E7B52] text-xs font-bold tracking-wide shadow-xs">
              <Sparkles className="h-3.5 w-3.5 text-[#1E7B52]" />
              <span>Einfach. Schnell. Amtlich gültig.</span>
            </div>

            {/* Headline */}
            <h1 className="text-4xl sm:text-6xl font-black text-[#14181F] tracking-tight leading-[1.08]">
              Deine Schweizer Steuererklärung in <span className="text-[#1E7B52]">wenigen Minuten</span> erledigt.
            </h1>

            {/* Subtitle */}
            <p className="text-lg sm:text-xl text-[#555555] leading-relaxed max-w-2xl mx-auto font-normal">
              Lade deine Dokumente hoch. SunTax liest Lohnausweis und Belege automatisch aus, ermittelt sämtliche gesetzlichen Abzüge auf den Rappen genau und erstellt dein offizielles <span className="font-semibold text-[#14181F]">eCH-0119 Filing-Dossier samt PDF-Zusammenfassung</span> für dein kantonales Steueramt.
            </p>

            {/* CTA Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="w-full sm:w-auto bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold px-8 h-13 text-base shadow-xl shadow-[#1E7B52]/25 transition-all rounded-xl"
              >
                <Link href="/register">
                  Steuererklärung kostenlos starten
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-13 text-base font-semibold border-[#DDDDDD] bg-white hover:bg-slate-50 text-[#14181F] rounded-xl"
              >
                <a href="#how-it-works">So funktioniert SunTax</a>
              </Button>
            </div>

            {/* Trust Badges */}
            <div className="pt-8 flex flex-wrap items-center justify-center gap-6 sm:gap-10 text-xs font-semibold text-[#555555]">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52]" />
                <span>100% deterministische Steuerberechnung</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52]" />
                <span>Offizieller eCH-0119 V4.0.0 Standard</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52]" />
                <span>Schweizer Datenschutz &amp; Rechenzentrum</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52]" />
                <span>CHF 39 erst bei Einreichung</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 6-Step Workflow Section ───────────────────────────────────────── */}
      <section id="how-it-works" className="py-20 bg-white border-y border-[#ECE8DF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs uppercase font-mono font-bold tracking-widest text-[#1E7B52]">
              In 6 einfachen Schritten zum Ziel
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#14181F] mt-2">
              Kein Beamtendeutsch. Keine Formularberge.
            </h2>
            <p className="text-sm text-[#777777] mt-3">
              SunTax führt dich Schritt für Schritt durch das Steuerjahr – verständlich auch ohne Vorkenntnisse.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                step: '1',
                title: 'Start: Kurz zu dir',
                desc: 'Gib deine Postleitzahl und deinen Zivilstand ein. SunTax wählt automatisch die Tarife deiner Gemeinde.',
                icon: HelpCircle,
              },
              {
                step: '2',
                title: 'Dokumente hochladen',
                desc: 'Lohnausweis, Säule-3a-Bestätigung, Bankauszug – wir lesen die Ziffern digital aus und ordnen sie zu.',
                icon: UploadCloud,
              },
              {
                step: '3',
                title: 'Smarte Fragen beantworten',
                desc: 'Arbeitsweg, Homeoffice-Tage, Mahlzeiten und Kirchensteuer: Nur Fragen, die nicht in Dokumenten stehen.',
                icon: Calculator,
              },
              {
                step: '4',
                title: 'Ergänzen & Kontrollieren',
                desc: 'Überprüfe deine Ziffern und ergänze Wertschriften gemäss eCH-0196 Verzeichnis.',
                icon: FileCheck2,
              },
              {
                step: '5',
                title: 'Vergleich Kanton & Bund',
                desc: 'Alle Abzüge übersichtlich nebeneinander dargestellt, inklusive geschätzter Steuerersparnis.',
                icon: TrendingDown,
              },
              {
                step: '6',
                title: 'Bestätigen & Einreichen',
                desc: 'Ehepartner bestätigen separat (Art. 113 DBG). Einmalig CHF 39 mit TWINT oder Karte zahlen und eCH-0119 XML herunterladen.',
                icon: ShieldCheck,
              },
            ].map((s) => (
              <div
                key={s.step}
                className="p-6 rounded-2xl bg-[#FBFAF7] border border-[#ECE8DF] hover:border-[#1E7B52]/40 transition-all space-y-3 relative overflow-hidden group"
              >
                <div className="w-10 h-10 rounded-xl bg-white border border-[#ECE8DF] flex items-center justify-center text-sm font-bold text-[#1E7B52] shadow-xs group-hover:bg-[#1E7B52] group-hover:text-white transition-colors">
                  {s.step}
                </div>
                <h3 className="text-lg font-bold text-[#14181F]">{s.title}</h3>
                <p className="text-xs sm:text-sm text-[#666666] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Transparent Pricing Section (CHF 39) ─────────────────────────── */}
      <section id="pricing" className="py-20 bg-[#F6F6F4]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-white rounded-3xl border border-[#ECE8DF] p-8 sm:p-12 shadow-sm text-center space-y-6">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-[#1E7B52] text-xs font-bold">
              <Award className="h-3.5 w-3.5" />
              Transparent &amp; Fair
            </span>
            <h2 className="text-3xl sm:text-5xl font-black text-[#14181F]">
              CHF 39.<span className="text-2xl text-slate-400">00</span>
            </h2>
            <p className="text-sm sm:text-base text-[#666666] max-w-lg mx-auto">
              Einmalig pro Steuererklärung. Kein Abo, keine versteckten Gebühren. Verheiratete Paare zahlen nur einmal.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left max-w-md mx-auto pt-4 text-xs sm:text-sm">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#1E7B52] flex-none" />
                <span>Alle 26 Kantone inklusive</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#1E7B52] flex-none" />
                <span>Beliebig viele Lohnausweise</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#1E7B52] flex-none" />
                <span>Amtliches eCH-0119 XML &amp; PDF</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#1E7B52] flex-none" />
                <span>TWINT &amp; Kreditkartenzahlung</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#1E7B52] flex-none" />
                <span>Zahlung erst ganz zum Schluss</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-[#1E7B52] flex-none" />
                <span>Partner-Signatur (Art. 113 DBG)</span>
              </div>
            </div>

            <div className="pt-4">
              <Button
                asChild
                size="lg"
                className="bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold px-8 h-12 text-sm rounded-xl"
              >
                <Link href="/register">Kostenlos ausprobieren</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 26 Cantons Interactive Explorer ───────────────────────────────── */}
      <section id="cantons" className="py-20 bg-white border-t border-[#ECE8DF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs uppercase font-mono font-bold tracking-widest text-[#1E7B52]">
              Föderalismus perfekt abgedeckt
            </span>
            <h2 className="text-3xl font-extrabold text-[#14181F] mt-2">
              Unterstützt in allen 26 Schweizer Kantonen
            </h2>
            <p className="text-xs sm:text-sm text-[#777777] mt-2">
              Jeder Kanton hat eigene Abzugsgrenzen, Fahrkostenpauschalen und Steuerfüsse. SunTax wendet immer die korrekten kantonalen Gesetze an.
            </p>
          </div>

          <div className="max-w-md mx-auto mb-8 relative">
            <Search className="h-4 w-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Kanton suchen (z. B. Zürich oder ZH)..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:border-[#1E7B52] bg-[#FAFAF8]"
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 max-h-96 overflow-y-auto p-2 border border-slate-200 rounded-2xl bg-[#FAFAF8]">
            {filteredCantons.map(c => {
              const isSelected = activeCanton.code === c.code
              return (
                <button
                  key={c.code}
                  type="button"
                  onClick={() => setSelectedCanton(c)}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-[#1E7B52] bg-white shadow-xs font-bold'
                      : 'border-transparent bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#1E7B52]">{c.code}</span>
                    <span className="text-[10px] text-slate-400">{c.multiplier}</span>
                  </div>
                  <div className="text-xs text-slate-800 font-semibold truncate mt-1">{c.name}</div>
                </button>
              )
            })}
          </div>

          {activeCanton && (
            <div className="mt-6 p-4 rounded-2xl bg-[#F0FDF4] border border-emerald-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs sm:text-sm text-emerald-950">
              <div>
                <span className="font-bold">Kanton {activeCanton.name} ({activeCanton.code}):</span>{' '}
                Staatssteuerfuss Referenzwert: {activeCanton.multiplier} · Gesetzlicher Pendler-Maximalabzug: {activeCanton.cap}
              </div>
              <Button asChild size="sm" className="bg-[#1E7B52] hover:bg-[#165C3D] text-white text-xs rounded-lg flex-none">
                <Link href="/register">Für {activeCanton.name} starten</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* ─── Security & nDSG Section ───────────────────────────────────────── */}
      <section id="security" className="py-20 bg-[#F6F6F4] border-t border-[#ECE8DF]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <span className="text-xs uppercase font-mono font-bold tracking-widest text-[#1E7B52]">
              Schweizer Datenschutz (nDSG)
            </span>
            <h2 className="text-3xl font-extrabold text-[#14181F] mt-2">
              Deine Steuerdaten gehören nur dir.
            </h2>
            <p className="text-sm text-[#777777] mt-3">
              Banken-Standard in der Verschlüsselung, isolierte Mandanten und Server-Standort in der Schweiz.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-white border border-[#ECE8DF] space-y-2">
              <Lock className="h-6 w-6 text-[#1E7B52]" />
              <h3 className="font-bold text-[#14181F]">AES-256 Envelope Encryption</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Jedes hochgeladene Dokument wird mit einem individuellen Data Encryption Key verschlüsselt, bevor es gespeichert wird.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[#ECE8DF] space-y-2">
              <ShieldCheck className="h-6 w-6 text-[#1E7B52]" />
              <h3 className="font-bold text-[#14181F]">2-Jahres-Löschung gemäss nDSG</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Inaktive Konten werden nach 2 Jahren automatisch und unwiderruflich gelöscht. Eine Vorwarnung erfolgt 30 Tage zuvor.
              </p>
            </div>
            <div className="p-6 rounded-2xl bg-white border border-[#ECE8DF] space-y-2">
              <Calculator className="h-6 w-6 text-[#1E7B52]" />
              <h3 className="font-bold text-[#14181F]">Keine KI-Mathematik</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Deine Steuerbeträge werden niemals durch LLMs geraten, sondern durch eine verifizierte, deterministische Schweizer Steuer-Engine berechnet.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ Section ────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 bg-white border-t border-[#ECE8DF]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-extrabold text-[#14181F]">Häufig gestellte Fragen</h2>
          </div>

          <div className="space-y-4">
            {[
              {
                q: 'Was kostet SunTax wirklich?',
                a: 'Genau CHF 39.00 pauschal pro Steuererklärung. Kein Abonnement. Auch verheiratete Paare zahlen nur einmalig CHF 39.00.',
              },
              {
                q: 'Wann muss ich bezahlen?',
                a: 'Erst ganz am Ende im Schritt 6, bevor du dein fertiges Dossier herunterlädst oder einreichst. Das Ausfüllen und Optimieren ist komplett unverbindlich und kostenlos.',
              },
              {
                q: 'Kann ich SunTax als Selbstständiger nutzen?',
                a: 'Aktuell fokussiert sich SunTax auf Angestellte und Rentner (auch mit mehreren Arbeitgebern). Selbstständige, vermietete Liegenschaften oder Liegenschaften im Ausland kommen in einem späteren Update («Bald»).',
              },
              {
                q: 'Wie unterschreibt mein Partner bei einer Heirat?',
                a: 'Gemäss Art. 113 DBG müssen Ehepaare die Steuererklärung gemeinsam einreichen. Du kannst im Schritt 6 deiner Partnerin oder deinem Partner direkt einen Einladungslink senden, mit dem sie oder er die Erklärung persönlich mit einem Klick bestätigt.',
              },
              {
                q: 'Entspricht der Export dem Schweizer eCH-Standard?',
                a: 'Ja. SunTax erzeugt eine offizielle eCH-0119 V4.0.0 XML-Datei sowie ein Wertschriftenverzeichnis gemäss eCH-0196, validiert gegen die amtlichen XSD-Schemata.',
              },
            ].map((faq, i) => (
              <details key={i} className="group p-4 bg-[#FBFAF7] rounded-xl border border-[#ECE8DF] text-sm">
                <summary className="font-bold text-[#14181F] cursor-pointer list-none flex items-center justify-between">
                  <span>{faq.q}</span>
                  <span className="text-[#1E7B52] group-open:rotate-180 transition-transform">▼</span>
                </summary>
                <p className="mt-3 text-xs sm:text-sm text-slate-600 leading-relaxed border-t border-slate-200/60 pt-3">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="bg-[#14181F] text-slate-400 py-12 border-t border-slate-800 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-[#1E7B52] text-white flex items-center justify-center font-bold text-xs">
              S
            </div>
            <span className="text-white font-bold">SunTax AG</span> · Schweizer Steuererklärung für Angestellte &amp; Rentner
          </div>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-white transition-colors">
              AGB
            </Link>
            <Link href="/privacy" className="hover:text-white transition-colors">
              Datenschutz (nDSG)
            </Link>
            <a href="mailto:info@suntax.ch" className="hover:text-white transition-colors">
              info@suntax.ch
            </a>
          </div>
        </div>
      </footer>
    </div>
  )
}
