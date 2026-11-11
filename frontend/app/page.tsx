'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  FileText,
  Lock,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Building2,
  MapPin,
  HelpCircle,
  Clock,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { BRAND } from '@/lib/brand';
import { api } from '@/lib/api';

interface CantonDetail {
  code: string;
  name: string;
  deadline: string;
  jobCanton: string;
  healthCanton: string;
  interestCanton: string;
  availability?: string;
  educationMax?: number;
  commuteMax?: number | null;
}

const CANTONS: CantonDetail[] = [
  { code: 'ZH', name: 'Zürich', deadline: '31. März', jobCanton: 'CHF 4’000 max.', healthCanton: 'CHF 2’900', interestCanton: 'CHF 0' },
  { code: 'BE', name: 'Bern', deadline: '15. März', jobCanton: 'CHF 6’700 max.', healthCanton: 'CHF 3’600', interestCanton: 'CHF 0' },
  { code: 'LU', name: 'Luzern', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’200', interestCanton: 'CHF 0' },
  { code: 'UR', name: 'Uri', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 2’800', interestCanton: 'CHF 0' },
  { code: 'SZ', name: 'Schwyz', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’000', interestCanton: 'CHF 0' },
  { code: 'OW', name: 'Obwalden', deadline: '30. April', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 2’600', interestCanton: 'CHF 0' },
  { code: 'NW', name: 'Nidwalden', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 2’700', interestCanton: 'CHF 0' },
  { code: 'GL', name: 'Glarus', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’000', interestCanton: 'CHF 0' },
  { code: 'ZG', name: 'Zug', deadline: '30. April', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’400', interestCanton: 'CHF 0' },
  { code: 'FR', name: 'Freiburg / Fribourg', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’100', interestCanton: 'CHF 0' },
  { code: 'SO', name: 'Solothurn', deadline: '31. März', jobCanton: 'CHF 7’000 max.', healthCanton: 'CHF 3’300', interestCanton: 'CHF 0' },
  { code: 'BS', name: 'Basel-Stadt', deadline: '31. März', jobCanton: 'CHF 3’000 max.', healthCanton: 'CHF 2’500', interestCanton: 'CHF 0' },
  { code: 'BL', name: 'Basel-Landschaft', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 2’900', interestCanton: 'CHF 0' },
  { code: 'SH', name: 'Schaffhausen', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’000', interestCanton: 'CHF 0' },
  { code: 'AR', name: 'Appenzell Ausserrhoden', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 2’800', interestCanton: 'CHF 0' },
  { code: 'AI', name: 'Appenzell Innerrhoden', deadline: '30. April', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 2’700', interestCanton: 'CHF 0' },
  { code: 'SG', name: 'St. Gallen', deadline: '31. März', jobCanton: 'CHF 4’500 max.', healthCanton: 'CHF 3’200', interestCanton: 'CHF 0' },
  { code: 'GR', name: 'Graubünden', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’000', interestCanton: 'CHF 0' },
  { code: 'AG', name: 'Aargau', deadline: '31. März', jobCanton: 'CHF 7’000 max.', healthCanton: 'CHF 3’500', interestCanton: 'CHF 0' },
  { code: 'TG', name: 'Thurgau', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’100', interestCanton: 'CHF 0' },
  { code: 'TI', name: 'Tessin / Ticino', deadline: '30. April', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’300', interestCanton: 'CHF 0' },
  { code: 'VD', name: 'Waadt / Vaud', deadline: '15. März', jobCanton: 'CHF 3’000 max.', healthCanton: 'CHF 3’200', interestCanton: 'CHF 0' },
  { code: 'VS', name: 'Wallis / Valais', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’000', interestCanton: 'CHF 0' },
  { code: 'NE', name: 'Neuenburg / Neuchâtel', deadline: '31. März', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’200', interestCanton: 'CHF 0' },
  { code: 'GE', name: 'Genf / Genève', deadline: '31. März', jobCanton: 'CHF 500 max.', healthCanton: 'CHF 3’000', interestCanton: 'CHF 0' },
  { code: 'JU', name: 'Jura', deadline: '30. April', jobCanton: 'CHF 6’000 max.', healthCanton: 'CHF 3’100', interestCanton: 'CHF 0' },
];

export default function LandingPage() {
  const { t, isGerman } = useTranslation();
  const [selectedYear, setSelectedYear] = useState<'2025' | '2026'>('2025');
  const [selectedCantonCode, setSelectedCantonCode] = useState<string>('ZH');
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [cantonOverview, setCantonOverview] = useState<Record<string, any>>({});
  const [federalOverview, setFederalOverview] = useState<{
    car_rate_per_km?: number;
    commute_max?: number;
    pillar3a_max?: number;
    pillar3a_catchup_max?: number;
    health_insurance_single_pk?: number;
  }>({});

  useEffect(() => {
    let active = true;
    api.rules
      .getCantonsOverview(Number(selectedYear))
      .then((res) => {
        if (!active || !res) return;
        const map: Record<string, any> = {};
        for (const c of res.cantons || []) {
          map[c.code] = c;
        }
        setCantonOverview(map);
        if (res.federal) setFederalOverview(res.federal);
      })
      .catch(() => {
        // Fallback silently to initial static dataset
      });
    return () => {
      active = false;
    };
  }, [selectedYear]);

  const baseCanton = CANTONS.find((c) => c.code === selectedCantonCode) || CANTONS[0]!;
  const liveCanton = cantonOverview[selectedCantonCode];
  const activeCanton: CantonDetail = liveCanton
    ? {
        code: baseCanton.code,
        name: liveCanton.name || baseCanton.name,
        deadline: liveCanton.deadline || baseCanton.deadline,
        jobCanton: liveCanton.work_expenses_max
          ? `CHF ${Number(liveCanton.work_expenses_max).toLocaleString('de-CH')} max.`
          : baseCanton.jobCanton,
        healthCanton: liveCanton.health_insurance_single_pk
          ? `CHF ${Number(liveCanton.health_insurance_single_pk).toLocaleString('de-CH')}`
          : baseCanton.healthCanton,
        interestCanton: baseCanton.interestCanton,
        availability: liveCanton.availability || (selectedCantonCode === 'ZH' ? 'available' : 'coming_soon'),
        educationMax: liveCanton.education_max,
        commuteMax: liveCanton.commute_max,
      }
    : {
        ...baseCanton,
        availability: selectedCantonCode === 'ZH' ? 'available' : 'coming_soon',
      };

  const fmtChf = (n: number) => `CHF ${n.toLocaleString('de-CH').replace(/,/g, '’')}`;
  const pillar3aMax = fmtChf(federalOverview.pillar3a_max ?? 7258);
  const fedCarRate = (federalOverview.car_rate_per_km ?? (selectedYear === '2026' ? 0.75 : 0.7)).toFixed(2);
  const fedHealthMax = fmtChf(federalOverview.health_insurance_single_pk ?? 1800);
  const fedCommuteMax = fmtChf(federalOverview.commute_max ?? 3300);

  return (
    <div className="min-h-screen bg-[#FBF9F5] text-[#0A0A0A] font-sans selection:bg-[#1E7B52] selection:text-white">
      {/* ─── STICKY HEADER (Matches Reference) ─────────────────────────────── */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-[#ECE8DF]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 text-[#15181D]">
            <div className="w-8 h-8 rounded-lg bg-[#15181D] flex items-center justify-center text-white shadow-xs">
              <svg width="18" height="20" viewBox="0 0 40 46" aria-hidden="true">
                <path d="M4 0H27L38 11V28L23 43H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#15181D" />
                <path d="M27 0L38 11H30a3 3 0 0 1-3-3z" fill="#D6D6D6" />
                <path d="M9.5 17.5h4.5V13h5v4.5h4.5v5H19V27h-5v-4.5H9.5z" fill="#FFFFFF" />
              </svg>
            </div>
            <span className="text-xl tracking-tight leading-none">
              <span className="font-extrabold text-[#15181D]">{BRAND.shortLeft}</span>
              {BRAND.shortRight ? <span className="font-semibold text-[#4B4F57]">{BRAND.shortRight}</span> : null}
            </span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-[#555555]">
            <a href="#ablauf" className="hover:text-[#1E7B52] transition-colors">
              {t('landing.navAblauf')}
            </a>
            <a href="#leistungen" className="hover:text-[#1E7B52] transition-colors">
              {t('landing.navLeistungen')}
            </a>
            <a href="#sicherheit" className="hover:text-[#1E7B52] transition-colors">
              {t('landing.navSicherheit')}
            </a>
            <a href="#preise" className="hover:text-[#1E7B52] transition-colors">
              {t('landing.navPreise')}
            </a>
            <a href="#faq" className="hover:text-[#1E7B52] transition-colors">
              {t('landing.navFaq')}
            </a>
          </nav>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <LanguageSwitcher />

            <Button asChild variant="ghost" className="text-sm font-semibold text-[#14181F] hover:text-[#1E7B52]">
              <Link href="/login">{t('common.login')}</Link>
            </Button>
            <Button
              asChild
              className="bg-[#1E7B52] hover:bg-[#16603F] text-white shadow-xs font-semibold px-4 rounded-xl text-sm h-9.5"
            >
              <Link href="/register">{t('common.startNow')}</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* ─── 2-COLUMN HERO SECTION (Matches Reference) ───────────────────────── */}
      <section className="relative pt-10 pb-16 sm:pt-16 sm:pb-24 border-b border-[#ECE8DF]/80">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            {/* Left Column: Heading, Subtitle & CTAs */}
            <div className="lg:col-span-7 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[#1E7B52] text-xs font-bold tracking-wide">
                <Sparkles className="h-3.5 w-3.5" />
                <span>{t('landing.heroBadge')}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#0A0A0A] tracking-tight leading-[1.08]">
                {t('landing.heroTitle')}{' '}
                <span className="text-[#1E7B52]">{t('landing.heroTitleHighlight')}</span>
              </h1>

              <p className="text-base sm:text-lg text-[#555555] leading-relaxed max-w-xl font-normal">
                {t('landing.heroSubtitle')}
              </p>

              <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3.5">
                <Button
                  asChild
                  size="lg"
                  className="bg-[#1E7B52] hover:bg-[#16603F] text-white font-bold px-7 h-12 text-base shadow-sm rounded-xl transition-all"
                >
                  <Link href="/tax-returns/new">
                    {t('landing.heroCtaPrimary')}
                    <ArrowRight className="h-4.5 w-4.5 ml-2" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-12 text-base font-semibold border-[#DCD6C8] bg-white hover:bg-slate-50 text-[#0A0A0A] rounded-xl"
                >
                  <a href="#ablauf">{t('landing.heroCtaSecondary')}</a>
                </Button>
              </div>

              {/* Trust Badges */}
              <div className="pt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-medium text-[#666666]">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                  <span>{t('landing.trustSwissData')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                  <span>{t('landing.trustAllCantons')}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                  <span>{t('landing.trustFlatFee')}</span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Canton & Deduction Preview Card */}
            <div className="lg:col-span-5">
              <div className="bg-white border border-[#ECE8DF] rounded-2xl p-6 sm:p-7 shadow-[0_20px_45px_-20px_rgba(30,30,40,0.12)] space-y-5">
                {/* Card Top: Title & Year Switcher */}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <span className="text-sm font-bold text-[#0A0A0A]">
                    {t('landing.cantonCardTitle')}
                  </span>
                  <div className="inline-flex rounded-lg bg-[#F2F2F0] p-0.5 text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setSelectedYear('2025')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        selectedYear === '2025' ? 'bg-white text-[#0A0A0A] shadow-xs font-bold' : 'text-[#666666]'
                      }`}
                    >
                      2025
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedYear('2026')}
                      className={`px-2.5 py-1 rounded-md transition-all ${
                        selectedYear === '2026' ? 'bg-white text-[#0A0A0A] shadow-xs font-bold' : 'text-[#666666]'
                      }`}
                    >
                      2026
                    </button>
                  </div>
                </div>

                {/* Canton Selector Dropdown */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="cantonSelect" className="block text-xs font-semibold text-[#666666]">
                      {t('landing.cantonSelectLabel')}
                    </label>
                    {activeCanton.availability === 'available' ? (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-[#1E7B52]">
                        {isGerman ? 'Direkt einreichen möglich' : 'Ready to file'}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {isGerman ? 'Kommt bald (Info)' : 'Coming soon (Info)'}
                      </span>
                    )}
                  </div>
                  <div className="relative">
                    <select
                      id="cantonSelect"
                      value={selectedCantonCode}
                      onChange={(e) => setSelectedCantonCode(e.target.value)}
                      className="w-full text-sm font-semibold p-2.5 pr-8 rounded-xl border border-[#DCD6C8] bg-white text-[#0A0A0A] focus:outline-none focus:border-[#1E7B52] appearance-none"
                    >
                      {CANTONS.map((c) => {
                        const ov = cantonOverview[c.code];
                        const isAvail = ov ? ov.availability === 'available' : c.code === 'ZH';
                        return (
                          <option key={c.code} value={c.code}>
                            Kanton {ov?.name || c.name} ({c.code}){isAvail ? '' : ' · Kommt bald'}
                          </option>
                        );
                      })}
                    </select>
                    <ChevronDown className="h-4 w-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
                  </div>
                </div>

                {/* Deadline Information */}
                <div className="p-3 bg-[#F9F9F8] border border-[#ECE8DF] rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-[#1E7B52]" />
                    {t('landing.deadlineLabel')}:
                  </span>
                  <span className="font-bold text-[#0A0A0A]">
                    {activeCanton.deadline} {selectedYear === '2025' ? '2026' : '2027'}
                  </span>
                </div>

                {/* Comparison Deduction Table */}
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-12 font-bold text-[#888888] pb-1 border-b border-slate-100">
                    <span className="col-span-6">{t('landing.colDeduction')}</span>
                    <span className="col-span-3 text-right">{t('landing.colCanton')}</span>
                    <span className="col-span-3 text-right">{t('landing.colFederal')}</span>
                  </div>
                  <div className="grid grid-cols-12 py-1 text-slate-700">
                    <span className="col-span-6 font-medium">{t('landing.deductionJobExpenses')}</span>
                    <span className="col-span-3 text-right font-semibold">{activeCanton.jobCanton}</span>
                    <span className="col-span-3 text-right font-semibold">{fedCommuteMax} max.</span>
                  </div>
                  <div className="grid grid-cols-12 py-1 text-slate-700">
                    <span className="col-span-6 font-medium">
                      {isGerman ? 'Auto-Arbeitsweg (pro km)' : 'Car commute rate (per km)'}
                    </span>
                    <span className="col-span-3 text-right font-semibold">
                      CHF {fedCarRate}/km
                    </span>
                    <span className="col-span-3 text-right font-semibold">CHF {fedCarRate}/km</span>
                  </div>
                  <div className="grid grid-cols-12 py-1 text-slate-700">
                    <span className="col-span-6 font-medium">{t('landing.deductionPillar3a')}</span>
                    <span className="col-span-3 text-right font-semibold">{pillar3aMax}</span>
                    <span className="col-span-3 text-right font-semibold">{pillar3aMax}</span>
                  </div>
                  {selectedYear === '2026' && (
                    <div className="grid grid-cols-12 py-1 text-emerald-800 bg-emerald-50/70 px-1.5 rounded">
                      <span className="col-span-6 font-medium">
                        {isGerman ? 'Säule 3a Einkauf (neu 2026)' : 'Pillar 3a Catch-up (2026)'}
                      </span>
                      <span className="col-span-3 text-right font-semibold">CHF 7’258</span>
                      <span className="col-span-3 text-right font-semibold">CHF 7’258</span>
                    </div>
                  )}
                  <div className="grid grid-cols-12 py-1 text-slate-700">
                    <span className="col-span-6 font-medium">{t('landing.deductionHealthInsurance')}</span>
                    <span className="col-span-3 text-right font-semibold">{activeCanton.healthCanton}</span>
                    <span className="col-span-3 text-right font-semibold">{fedHealthMax}</span>
                  </div>
                </div>

                {/* Card Action */}
                <Button
                  asChild
                  className="w-full bg-[#1E7B52] hover:bg-[#16603F] text-white font-bold h-11 rounded-xl shadow-xs"
                >
                  <Link href={`/tax-returns/new?canton=${activeCanton.code}&year=${selectedYear}`}>
                    {t('landing.cantonCta')} ({activeCanton.code})
                    <ArrowRight className="h-4 w-4 ml-1.5" />
                  </Link>
                </Button>

                <p className="text-[11px] text-center text-[#888888]">
                  {t('landing.cantonNote')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── TRUST BAR ──────────────────────────────────────────────────────── */}
      <section className="py-6 bg-white border-b border-[#ECE8DF]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-[#1E7B52]">100%</span>
              <span className="text-xs font-semibold text-slate-600 mt-0.5">{t('landing.trustSwissCompany')}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-[#1E7B52]">Schweiz</span>
              <span className="text-xs font-semibold text-slate-600 mt-0.5">{t('landing.trustSwissData')}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-[#1E7B52]">26</span>
              <span className="text-xs font-semibold text-slate-600 mt-0.5">{t('landing.trustAllCantons')}</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-xl sm:text-2xl font-black text-[#1E7B52]">CHF 39</span>
              <span className="text-xs font-semibold text-slate-600 mt-0.5">{t('landing.trustFlatFee')}</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS SECTION (Ablauf) ──────────────────────────────────── */}
      <section id="ablauf" className="py-16 sm:py-24 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-[#1E7B52] uppercase tracking-wider">
            {t('landing.howItWorksEyebrow')}
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] mt-1.5 tracking-tight">
            {t('landing.howItWorksTitle')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white border border-[#ECE8DF] rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1E7B52] font-black flex items-center justify-center text-lg">
              1
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A]">{t('landing.step1Title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('landing.step1Desc')}</p>
          </div>

          <div className="bg-white border border-[#ECE8DF] rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1E7B52] font-black flex items-center justify-center text-lg">
              2
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A]">{t('landing.step2Title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('landing.step2Desc')}</p>
          </div>

          <div className="bg-white border border-[#ECE8DF] rounded-2xl p-6 sm:p-8 space-y-4 shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1E7B52] font-black flex items-center justify-center text-lg">
              3
            </div>
            <h3 className="text-lg font-bold text-[#0A0A0A]">{t('landing.step3Title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('landing.step3Desc')}</p>
          </div>
        </div>
      </section>

      {/* ─── FEATURES SECTION (Leistungen) ──────────────────────────────────── */}
      <section id="leistungen" className="py-16 sm:py-24 bg-[#F5F2EB] border-y border-[#ECE8DF]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-[#1E7B52] uppercase tracking-wider">
              {t('landing.featuresEyebrow')}
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] mt-1.5 tracking-tight">
              {t('landing.featuresTitle')}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-[#ECE8DF] space-y-3">
              <FileText className="h-6 w-6 text-[#1E7B52]" />
              <h4 className="font-bold text-base text-[#0A0A0A]">{t('landing.feat1Title')}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">{t('landing.feat1Desc')}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-[#ECE8DF] space-y-3">
              <Sparkles className="h-6 w-6 text-[#1E7B52]" />
              <h4 className="font-bold text-base text-[#0A0A0A]">{t('landing.feat2Title')}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">{t('landing.feat2Desc')}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-[#ECE8DF] space-y-3">
              <ShieldCheck className="h-6 w-6 text-[#1E7B52]" />
              <h4 className="font-bold text-base text-[#0A0A0A]">{t('landing.feat3Title')}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">{t('landing.feat3Desc')}</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-[#ECE8DF] space-y-3">
              <Building2 className="h-6 w-6 text-[#1E7B52]" />
              <h4 className="font-bold text-base text-[#0A0A0A]">{t('landing.feat4Title')}</h4>
              <p className="text-xs text-slate-600 leading-relaxed">{t('landing.feat4Desc')}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── SECURITY SECTION (Sicherheit) ──────────────────────────────────── */}
      <section id="sicherheit" className="py-16 sm:py-24 max-w-6xl mx-auto px-4 sm:px-6">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold text-[#1E7B52] uppercase tracking-wider">
            {t('landing.securityEyebrow')}
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] mt-1.5 tracking-tight">
            {t('landing.securityTitle')}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white border border-[#ECE8DF] rounded-2xl p-6 space-y-3">
            <Lock className="h-6 w-6 text-[#1E7B52]" />
            <h3 className="font-bold text-base text-[#0A0A0A]">{t('landing.sec1Title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('landing.sec1Desc')}</p>
          </div>
          <div className="bg-white border border-[#ECE8DF] rounded-2xl p-6 space-y-3">
            <ShieldCheck className="h-6 w-6 text-[#1E7B52]" />
            <h3 className="font-bold text-base text-[#0A0A0A]">{t('landing.sec2Title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('landing.sec2Desc')}</p>
          </div>
          <div className="bg-white border border-[#ECE8DF] rounded-2xl p-6 space-y-3">
            <Sparkles className="h-6 w-6 text-[#1E7B52]" />
            <h3 className="font-bold text-base text-[#0A0A0A]">{t('landing.sec3Title')}</h3>
            <p className="text-sm text-slate-600 leading-relaxed">{t('landing.sec3Desc')}</p>
          </div>
        </div>
      </section>

      {/* ─── PRICING SECTION (Preise) ───────────────────────────────────────── */}
      <section id="preise" className="py-16 sm:py-24 bg-[#F5F2EB] border-y border-[#ECE8DF]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <span className="text-xs font-bold text-[#1E7B52] uppercase tracking-wider">
              {t('landing.pricingEyebrow')}
            </span>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] mt-1.5 tracking-tight">
              {t('landing.pricingTitle')}
            </h2>
            <p className="text-sm text-slate-600 mt-2">{t('landing.pricingSubtitle')}</p>
          </div>

          <div className="max-w-md mx-auto bg-white rounded-3xl p-8 border border-[#ECE8DF] shadow-lg shadow-black/5 space-y-6">
            <div className="text-center border-b border-slate-100 pb-6">
              <span className="text-xs font-bold text-[#1E7B52] uppercase tracking-wider">
                {t('landing.pricingCardTitle')}
              </span>
              <div className="text-4xl font-black text-[#0A0A0A] mt-2">CHF 39.00</div>
              <p className="text-xs text-slate-500 mt-1">{t('landing.pricingCardDesc')}</p>
            </div>

            <ul className="space-y-3 text-xs sm:text-sm text-slate-700">
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                <span>{t('landing.pricingFeature1')}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                <span>{t('landing.pricingFeature2')}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                <span>{t('landing.pricingFeature3')}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                <span>{t('landing.pricingFeature4')}</span>
              </li>
              <li className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-[#1E7B52] shrink-0" />
                <span>{t('landing.pricingFeature5')}</span>
              </li>
            </ul>

            <Button
              asChild
              className="w-full bg-[#1E7B52] hover:bg-[#16603F] text-white font-bold h-12 rounded-xl text-base shadow-xs"
            >
              <Link href="/tax-returns/new">{t('landing.pricingCta')}</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── FAQ SECTION ────────────────────────────────────────────────────── */}
      <section id="faq" className="py-16 sm:py-24 max-w-4xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <span className="text-xs font-bold text-[#1E7B52] uppercase tracking-wider">
            {t('landing.faqEyebrow')}
          </span>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0A0A0A] mt-1.5 tracking-tight">
            {t('landing.faqTitle')}
          </h2>
        </div>

        <div className="space-y-3">
          {[
            { q: t('landing.faq1Q'), a: t('landing.faq1A') },
            { q: t('landing.faq2Q'), a: t('landing.faq2A') },
            { q: t('landing.faq3Q'), a: t('landing.faq3A') },
            { q: t('landing.faq4Q'), a: t('landing.faq4A') },
            { q: t('landing.faq5Q'), a: t('landing.faq5A') },
          ].map((item, index) => {
            const isOpen = openFaq === index;
            return (
              <div
                key={index}
                className="bg-white border border-[#ECE8DF] rounded-2xl p-5 cursor-pointer transition-all"
                onClick={() => setOpenFaq(isOpen ? null : index)}
              >
                <div className="flex items-center justify-between gap-4 font-bold text-sm sm:text-base text-[#0A0A0A]">
                  <span>{item.q}</span>
                  <ChevronDown
                    className={`h-4 w-4 text-slate-400 transition-transform duration-200 shrink-0 ${
                      isOpen ? 'rotate-180 text-[#1E7B52]' : ''
                    }`}
                  />
                </div>
                {isOpen && <p className="text-xs sm:text-sm text-slate-600 mt-3 pt-3 border-t border-slate-100 leading-relaxed">{item.a}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── FOOTER ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-[#ECE8DF] bg-white py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-6 text-xs text-slate-500">
          <div className="flex items-center gap-3">
            <span className="font-bold text-[#0A0A0A]">{BRAND.companyLegalName}</span>
            <span>·</span>
            <span>© {new Date().getFullYear()} {t('landing.footerRights')}</span>
          </div>

          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-[#1E7B52] transition-colors">
              {t('landing.footerTerms')}
            </Link>
            <Link href="/privacy" className="hover:text-[#1E7B52] transition-colors">
              {t('landing.footerPrivacy')}
            </Link>
            <LanguageSwitcher />
          </div>
        </div>
      </footer>
    </div>
  );
}
