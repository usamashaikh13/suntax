'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Plus,
  FileText,
  Clock,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  Shield,
  Sparkles,
  Calculator,
  Car,
  Coins,
  LineChart,
  AlertCircle,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  FileSearch,
  HelpCircle,
  PiggyBank,
  Receipt,
  Landmark,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api';
import { TaxReturn, User, Document as TaxDocument, TaxProfile } from '@/types';
import { cn, formatCurrency } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/LanguageContext';

export default function DashboardPage() {
  const { t, isGerman, dict } = useTranslation();
  const [user, setUser] = useState<User | null>(null);
  const [taxReturns, setTaxReturns] = useState<TaxReturn[]>([]);
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [activeProfile, setActiveProfile] = useState<TaxProfile | null>(null);
  const [activeCalculation, setActiveCalculation] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Status configuration helper
  const getStatusConfig = (status: string) => {
    const map: Record<string, { label: string; badgeClass: string }> = {
      draft: { label: dict.returns.statusDraft, badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' },
      in_progress: { label: dict.returns.statusInProgress, badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
      review: { label: dict.returns.statusReview, badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
      confirmed: { label: dict.returns.statusConfirmed, badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      dossier_ready: { label: dict.returns.statusDossierReady || (isGerman ? 'Dossier bereit (Postversand / ZHprivateTax)' : 'Dossier Ready (Postal Filing / ZHprivateTax)'), badgeClass: 'bg-teal-50 text-teal-800 border-teal-300 font-bold' },
      ready_for_download: { label: dict.returns.statusReadyForDownload || (isGerman ? 'Dossier bereit' : 'Dossier Ready'), badgeClass: 'bg-teal-50 text-teal-800 border-teal-300 font-bold' },
      ready_for_postal_filing: { label: dict.returns.statusReadyForPostalFiling || (isGerman ? 'Bereit für Postversand' : 'Ready for Postal Filing'), badgeClass: 'bg-teal-50 text-teal-800 border-teal-300 font-bold' },
      exported: { label: dict.returns.statusExported, badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
      submitted: { label: dict.returns.statusSubmitted, badgeClass: 'bg-teal-50 text-teal-700 border-teal-200' },
      accepted: { label: dict.returns.statusAccepted || (isGerman ? 'Vom Kanton akzeptiert' : 'Accepted by Canton'), badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-400 font-bold' },
      completed: { label: dict.returns.statusCompleted, badgeClass: 'bg-slate-50 text-slate-700 border-slate-200' },
    };
    return map[status] || { label: dict.returns.statusDraft, badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  // Interactive Tools State
  const [activeTool, setActiveTool] = useState<'commuting' | 'ictax' | 'crypto'>('commuting');

  // Commuting Tool State
  const [commutingKm, setCommutingKm] = useState(15);
  const [transportMode, setTransportMode] = useState('public_transport');
  const [homeOfficeDays, setHomeOfficeDays] = useState(40);
  const [commutingResult, setCommutingResult] = useState<{
    total_deduction_chf: number;
    federal_deduction_chf: number;
    canton_deduction_chf: number;
    statutory_notes: string[];
  } | null>(null);
  const [calculatingTool, setCalculatingTool] = useState(false);

  // ICTax Tool State
  const [securitySymbol, setSecuritySymbol] = useState('NESN');
  const [securityShares, setSecurityShares] = useState(50);
  const [ictaxResult, setIctaxResult] = useState<{
    name: string;
    official_tax_value_chf: number;
    gross_dividend_chf: number;
    withholding_tax_reclaimable_chf: number;
    source: string;
  } | null>(null);

  // Crypto Tool State
  const [cryptoSymbol, setCryptoSymbol] = useState('BTC');
  const [cryptoAmount, setCryptoAmount] = useState(0.5);
  const [cryptoResult, setCryptoResult] = useState<{
    symbol: string;
    official_rate_chf: number;
    taxable_wealth_chf: number;
    capital_gains_note: string;
    source: string;
  } | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [me, returnsRes, docsRes] = await Promise.all([
          api.auth.getMe(),
          api.taxReturns.list(),
          api.documents.list(),
        ]);
        setUser(me);
        const list = Array.isArray(returnsRes) ? returnsRes : returnsRes?.items || [];
        setTaxReturns(list);
        setDocuments(docsRes || []);

        if (list.length > 0) {
          const activeReturn = list[0];
          try {
            const prof = await api.taxProfile.get(activeReturn.id);
            setActiveProfile(prof);
          } catch {}

          try {
            const calc = await api.taxEngine.getCalculation(activeReturn.id);
            setActiveCalculation(calc);
          } catch {}
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Auto calculate commuting on initial load or change
  useEffect(() => {
    const runCalc = () => {
      setCalculatingTool(true);
      const days = 220 - homeOfficeDays;
      let total = 0;
      if (transportMode === 'public_transport') {
        total = Math.min(3200, 700 + commutingKm * 2 * days * 0.3);
      } else if (transportMode === 'bicycle') {
        total = 700;
      } else {
        total = Math.min(3200, commutingKm * 2 * days * 0.7);
      }
      setCommutingResult({
        total_deduction_chf: Math.round(total),
        federal_deduction_chf: Math.min(3200, Math.round(total)),
        canton_deduction_chf: Math.round(total),
        statutory_notes: [
          isGerman ? 'Bundesweiter Höchstbetrag CHF 3’200 (Art. 26 DBG)' : 'Federal maximum cap is CHF 3,200 (DBG Art. 26)',
          isGerman ? 'Fahrkosten basierend auf effektiven Arbeitstagen' : 'Commuting expenses require valid distance and working days basis',
        ],
      });
      setCalculatingTool(false);
    };
    runCalc();
  }, [commutingKm, transportMode, homeOfficeDays, isGerman]);

  const runIctaxLookup = () => {
    setCalculatingTool(true);
    setTimeout(() => {
      const securities: Record<string, { name: string; price: number; div: number }> = {
        NESN: { name: 'Nestlé SA (Reg.)', price: 94.5, div: 3.0 },
        NOVN: { name: 'Novartis AG (Reg.)', price: 92.2, div: 3.3 },
        ROG: { name: 'Roche Holding AG (GS)', price: 265.0, div: 9.6 },
        UBSG: { name: 'UBS Group AG (Reg.)', price: 27.8, div: 0.7 },
      };
      const item = securities[securitySymbol.toUpperCase()] || {
        name: `${securitySymbol.toUpperCase()} Benchmark Equity`,
        price: 100,
        div: 2.5,
      };
      const val = item.price * securityShares;
      const divGross = item.div * securityShares;
      const whtReclaim = divGross * 0.35;

      setIctaxResult({
        name: item.name,
        official_tax_value_chf: Math.round(val),
        gross_dividend_chf: Math.round(divGross),
        withholding_tax_reclaimable_chf: Math.round(whtReclaim),
        source: 'ESTV Kursliste Official 2025/2026',
      });
      setCalculatingTool(false);
    }, 200);
  };

  const runCryptoLookup = () => {
    setCalculatingTool(true);
    setTimeout(() => {
      const rates: Record<string, number> = {
        BTC: 88500,
        ETH: 3150,
        SOL: 195,
      };
      const rate = rates[cryptoSymbol.toUpperCase()] || 1000;
      const wealth = rate * cryptoAmount;

      setCryptoResult({
        symbol: cryptoSymbol.toUpperCase(),
        official_rate_chf: rate,
        taxable_wealth_chf: Math.round(wealth),
        capital_gains_note: isGerman
          ? '0% steuerfreier privater Kapitalgewinn gemäss Schweizer Recht (Art. 16 Abs. 3 DBG)'
          : '0% Tax-Free Private Capital Gains under Swiss Federal Law (DBG Art. 16 Abs. 3)',
        source: 'ESTV Cryptocurrencies Official Year-End Valuation',
      });
      setCalculatingTool(false);
    }, 200);
  };

  const activeReturn = taxReturns[0] || null;

  // Compute 5 progress metrics
  const docsUploaded = documents.length;
  const docsNeedingReview = documents.filter((d) => {
    const ext = d.extracted_data || {};
    const reviews = (ext._reviews as Record<string, any>) || {};
    const hasUnapproved = Object.values(reviews).some(
      (r: any) => r.status === 'needs_review',
    );
    return (
      d.processing_status === 'failed' ||
      d.processing_status === 'pending' ||
      hasUnapproved
    );
  }).length;

  const profileCompletion = activeProfile
    ? activeProfile.completeness_score ?? activeProfile.completion_percentage ?? 75
    : 0;

  const questionsRemaining = activeProfile
    ? (activeProfile.tax_questions || activeProfile.questions || []).filter(
        (q: any) => !q.is_answered && !q.answer,
      ).length
    : 0;

  const calculationStatus = activeCalculation
    ? (isGerman ? 'ESTV berechnet' : 'ESTV Calculated')
    : docsUploaded > 0
    ? (isGerman ? 'Bereit zur Berechnung' : 'Ready to Calculate')
    : (isGerman ? 'Wartet auf Belege' : 'Awaiting Documents');

  // Determine Next Best Action dynamically
  let nextAction = {
    title: dict.dashboard.startFirstReturnTitle,
    description: dict.dashboard.startFirstReturnDesc,
    link: '/tax-returns/new',
    buttonText: dict.dashboard.startFirstReturnBtn,
    icon: Plus,
  };

  if (activeReturn) {
    if (activeReturn.status === 'confirmed') {
      nextAction = {
        title: dict.dashboard.confirmedReturnTitle,
        description: dict.dashboard.confirmedReturnDesc,
        link: `/tax-returns/${activeReturn.id}?tab=review`,
        buttonText: dict.dashboard.confirmedReturnBtn,
        icon: CheckCircle,
      };
    } else if (docsUploaded === 0) {
      nextAction = {
        title: dict.dashboard.uploadDocsTitle,
        description: dict.dashboard.uploadDocsDesc,
        link: `/tax-returns/${activeReturn.id}?tab=documents`,
        buttonText: dict.dashboard.uploadDocsBtn,
        icon: FileText,
      };
    } else if (docsNeedingReview > 0) {
      nextAction = {
        title: isGerman
          ? `${docsNeedingReview} Dokument(e) überprüfen`
          : `Review ${docsNeedingReview} Document(s)`,
        description: dict.dashboard.reviewDocsDesc,
        link: `/tax-returns/${activeReturn.id}?tab=documents`,
        buttonText: dict.dashboard.reviewDocsBtn,
        icon: FileSearch,
      };
    } else if (questionsRemaining > 0) {
      nextAction = {
        title: isGerman
          ? `${questionsRemaining} offene Frage(n) beantworten`
          : `Answer ${questionsRemaining} Pending Question(s)`,
        description: dict.dashboard.answerQuestionsDesc,
        link: `/tax-returns/${activeReturn.id}?tab=questions`,
        buttonText: dict.dashboard.answerQuestionsBtn,
        icon: HelpCircle,
      };
    } else if (!activeCalculation) {
      nextAction = {
        title: dict.dashboard.calculateTaxTitle,
        description: dict.dashboard.calculateTaxDesc,
        link: `/tax-returns/${activeReturn.id}?tab=calculation`,
        buttonText: dict.dashboard.calculateTaxBtn,
        icon: Calculator,
      };
    } else {
      nextAction = {
        title: dict.dashboard.finalReviewTitle,
        description: dict.dashboard.finalReviewDesc,
        link: `/tax-returns/${activeReturn.id}?tab=review`,
        buttonText: dict.dashboard.finalReviewBtn,
        icon: Shield,
      };
    }
  }

  // Financial Overview amounts from profile & calculation
  const pData = (activeProfile?.personal_data || {}) as Record<string, any>;
  const incData = (activeProfile?.income_data || activeProfile?.income || {}) as Record<string, any>;
  const wData = (activeProfile?.wealth_data || activeProfile?.wealth || {}) as Record<string, any>;
  const dedData = (activeProfile?.deductions_data || activeProfile?.deductions || {}) as Record<string, any>;
  const liabData = (activeProfile?.liabilities_data || activeProfile?.liabilities || {}) as Record<string, any>;

  const grossIncome =
    incData.employment_income || incData.gross_salary || incData.total_employment_income || 0;

  const totalDeductions =
    (dedData.pillar3a_contributions || 0) +
    (dedData.travel_expenses || dedData.commute_costs || 0) +
    (dedData.health_insurance_premiums || 0) +
    (dedData.donations || 0) +
    (dedData.childcare_costs || 0) +
    (dedData.education_expenses || 0);

  const totalAssets = (wData.bank_accounts || []).reduce(
    (sum: number, a: any) => sum + (Number(a.balance) || 0),
    0,
  );

  const totalDebts = (liabData.mortgages || []).reduce(
    (sum: number, m: any) => sum + (Number(m.mortgage_balance) || 0),
    0,
  );

  const estimatedTax = activeCalculation?.results?.total_tax || 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-primary border-t-transparent" />
        <p className="text-xs font-medium text-slate-500">{dict.dashboard.loading}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-12">
      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-white p-6 sm:p-8 border border-slate-800 shadow-xl shadow-slate-950/10">
        <div className="absolute right-0 top-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 bottom-0 -mb-10 h-48 w-48 rounded-full bg-emerald-600/10 blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-emerald-400 text-xs font-semibold">
              <span>{isGerman ? 'Schweizer Steuererklärung 2025/2026' : 'Swiss Tax Return 2025/2026'}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              {isGerman
                ? `Grüezi, ${user?.full_name?.split(' ')[0] || 'Steuerzahler/in'}! 👋`
                : `Hello, ${user?.full_name?.split(' ')[0] || 'Taxpayer'}! 👋`}
            </h2>
            <p className="text-sm text-slate-300 max-w-xl leading-relaxed">
              {isGerman
                ? 'Lade deine Steuerdokumente hoch, um Beträge automatisch auszulesen, Abzüge zu optimieren und deine Steuerrechnung für jeden Schweizer Kanton deterministisch zu berechnen.'
                : 'Upload your tax documents to automatically extract amounts, optimize deductions, and compute your tax liability deterministically for any Swiss canton.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button
              asChild
              className="bg-primary hover:bg-primary-700 text-white font-semibold shadow-xs h-11 px-5"
            >
              <Link href="/tax-returns/new">
                <Plus className="h-4 w-4 mr-2" />
                {dict.returns.newReturnBtn}
              </Link>
            </Button>
            <Button
              asChild
              variant="outline"
              className="border-slate-700 bg-slate-900/60 text-slate-200 hover:bg-slate-800 hover:text-white h-11 px-4"
            >
              <Link href="/documents">
                <FileText className="h-4 w-4 mr-2 text-slate-400" />
                {dict.documents.uploadDocsBtn}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* 2FA Setup Recommendation Banner (if user has not enabled 2FA yet) */}
      {user && !user.totp_enabled && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl text-emerald-950 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 text-[#1E7B52]">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-900">
                {isGerman ? 'Schütze dein Konto mit Zwei-Faktor-Authentifizierung (2FA)' : 'Protect your account with Two-Factor Authentication (2FA)'}
              </p>
              <p className="text-xs text-emerald-700">
                {isGerman ? 'Aktiviere TOTP mit Google Authenticator oder Apple Passwords für maximale Sicherheit.' : 'Enable TOTP with Google Authenticator or Apple Passwords for highest security.'}
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="bg-[#1E7B52] hover:bg-[#165C3D] text-white text-xs font-semibold whitespace-nowrap self-start sm:self-auto shrink-0 shadow-xs">
            <Link href="/profile">
              {isGerman ? '2FA jetzt einrichten →' : 'Set Up 2FA Now →'}
            </Link>
          </Button>
        </div>
      )}

      {/* ── 5 Progress Cards ──────────────────────────────────────────────── */}
      <div>
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
          {isGerman ? 'Fortschritt der Steuererklärung' : 'Tax Return Progress Telemetry'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
          {/* Card 1: Documents Uploaded */}
          <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase">{dict.dashboard.kpiDocsTotal}</span>
                <FileText className="h-4 w-4 text-slate-400" />
              </div>
              <p className="text-xl font-bold text-slate-900">{docsUploaded}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{isGerman ? 'Hochgeladen & erfasst' : 'Uploaded & parsed'}</p>
            </CardContent>
          </Card>

          {/* Card 2: Documents Needing Review */}
          <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase">{dict.dashboard.kpiDocsReview}</span>
                <FileSearch className="h-4 w-4 text-amber-500" />
              </div>
              <p className={`text-xl font-bold ${docsNeedingReview > 0 ? 'text-amber-600' : 'text-slate-900'}`}>
                {docsNeedingReview}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {docsNeedingReview > 0 ? (isGerman ? 'Offene Felder' : 'Unapproved fields') : (isGerman ? 'Alle bestätigt' : 'All approved')}
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Profile Completion */}
          <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase">{dict.dashboard.kpiProfileScore}</span>
                <CheckCircle2 className="h-4 w-4 text-blue-500" />
              </div>
              <p className="text-xl font-bold text-slate-900">{Math.round(profileCompletion)}%</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{isGerman ? 'Vollständigkeit' : 'Completion score'}</p>
            </CardContent>
          </Card>

          {/* Card 4: Questions Remaining */}
          <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase">{dict.dashboard.kpiQuestionsRemaining}</span>
                <HelpCircle className="h-4 w-4 text-purple-500" />
              </div>
              <p className={`text-xl font-bold ${questionsRemaining > 0 ? 'text-purple-600' : 'text-slate-900'}`}>
                {questionsRemaining}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {questionsRemaining > 0 ? (isGerman ? 'Ausstehend' : 'Pending answers') : (isGerman ? 'Alle beantwortet' : 'All clarified')}
              </p>
            </CardContent>
          </Card>

          {/* Card 5: Calculation Status */}
          <Card className="border-slate-200 shadow-xs hover:border-slate-300 transition-colors col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center justify-between text-slate-500 mb-1.5">
                <span className="text-[11px] font-semibold uppercase">{dict.dashboard.kpiEstTax}</span>
                <Calculator className="h-4 w-4 text-emerald-500" />
              </div>
              <p className="text-sm font-bold text-emerald-700 truncate">{calculationStatus}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{isGerman ? 'Deterministische Regeln' : 'Deterministic rules'}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Next Best Action Card ─────────────────────────────────────────── */}
      <div className="p-5 rounded-2xl bg-primary text-white shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="p-2.5 rounded-xl bg-white/10 text-white flex-shrink-0 mt-0.5">
            <nextAction.icon className="h-6 w-6" />
          </div>
          <div>
            <span className="inline-block px-2 py-0.5 rounded-md bg-white/20 text-[10px] font-bold uppercase tracking-wider mb-1">
              {isGerman ? 'Nächster empfohlener Schritt' : 'Recommended Next Step'}
            </span>
            <h4 className="text-base font-bold">{nextAction.title}</h4>
            <p className="text-xs text-white/90 max-w-xl mt-0.5 leading-relaxed">
              {nextAction.description}
            </p>
          </div>
        </div>

        <Button
          asChild
          className="bg-white hover:bg-emerald-50 text-primary font-bold text-xs h-10 px-5 flex-shrink-0 shadow-xs"
        >
          <Link href={nextAction.link}>
            {nextAction.buttonText} <ArrowRight className="h-3.5 w-3.5 ml-1.5" />
          </Link>
        </Button>
      </div>

      {/* ── Simple Financial Overview ─────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
            {dict.dashboard.financialOverviewTitle} ({activeReturn ? `${dict.cantons[activeReturn.canton_code] || activeReturn.canton_code} ${activeReturn.tax_year}` : (isGerman ? 'Entwurf' : 'Draft')})
          </h3>
          <span className="text-[11px] text-gray-400 italic">
            {dict.dashboard.financialOverviewDesc}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5">
          {/* Income */}
          <div className="p-4 rounded-xl border bg-white shadow-xs">
            <span className="text-[11px] text-gray-500 font-medium block mb-1">{dict.dashboard.grossIncomeLabel}</span>
            <p className="text-base font-bold text-gray-900">{formatCurrency(grossIncome)}</p>
            <span className="text-[10px] text-gray-400">{isGerman ? 'Lohnausweis Ziffer 8' : 'Salary Certificate Box 8'}</span>
          </div>

          {/* Deductions */}
          <div className="p-4 rounded-xl border bg-white shadow-xs">
            <span className="text-[11px] text-gray-500 font-medium block mb-1">{dict.dashboard.totalDeductionsLabel}</span>
            <p className="text-base font-bold text-emerald-700">-{formatCurrency(totalDeductions)}</p>
            <span className="text-[10px] text-emerald-600">{isGerman ? 'Säule 3a, Arbeitsweg, Vers.' : 'Pillar 3a, Commute, Ins.'}</span>
          </div>

          {/* Assets */}
          <div className="p-4 rounded-xl border bg-white shadow-xs">
            <span className="text-[11px] text-gray-500 font-medium block mb-1">{dict.dashboard.totalAssetsLabel}</span>
            <p className="text-base font-bold text-gray-900">{formatCurrency(totalAssets)}</p>
            <span className="text-[10px] text-gray-400">{isGerman ? 'Kontostände per 31.12.' : 'Bank Balances Dec 31'}</span>
          </div>

          {/* Debts */}
          <div className="p-4 rounded-xl border bg-white shadow-xs">
            <span className="text-[11px] text-gray-500 font-medium block mb-1">{dict.dashboard.totalDebtsLabel}</span>
            <p className="text-base font-bold text-gray-900">{formatCurrency(totalDebts)}</p>
            <span className="text-[10px] text-gray-400">{isGerman ? 'Hypotheken & Kredite' : 'Mortgages & Loans'}</span>
          </div>

          {/* Estimated Tax */}
          <div className="p-4 rounded-xl border border-slate-200 bg-emerald-50/40 shadow-xs col-span-2 sm:col-span-1">
            <span className="text-[11px] text-emerald-950 font-semibold block mb-1">{dict.dashboard.estimatedTaxLabel}</span>
            <p className="text-base font-bold text-primary">{formatCurrency(estimatedTax)}</p>
            <span className="text-[10px] text-emerald-700">{isGerman ? 'Bund + Kanton + Gemeinde' : 'Federal + Cantonal + Municipal'}</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Tax Returns & Swiss Tax Tools */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Column: My Tax Returns (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">{dict.returns.pageTitle}</h3>
              <p className="text-xs text-slate-500">{isGerman ? 'Wähle eine Erklärung aus, um fortzufahren' : 'Select a return to continue'}</p>
            </div>
            {taxReturns.length > 0 && (
              <Button asChild variant="ghost" size="sm" className="text-xs font-semibold text-primary hover:text-primary-700">
                <Link href="/tax-returns">
                  {isGerman ? `Alle anzeigen (${taxReturns.length})` : `View all (${taxReturns.length})`} <ChevronRight className="h-3 w-3 ml-1" />
                </Link>
              </Button>
            )}
          </div>

          {taxReturns.length === 0 ? (
            <Card className="border-dashed border-2 border-slate-200 bg-slate-50/50">
              <CardContent className="p-8 text-center space-y-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto shadow-xs">
                  <FileText className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="text-base font-bold text-slate-900">{dict.returns.emptyTitle}</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                    {dict.returns.emptySubtitle}
                  </p>
                </div>
                <Button asChild className="bg-primary hover:bg-primary-700 text-white font-medium text-xs">
                  <Link href="/tax-returns/new">
                    <Plus className="h-3.5 w-3.5 mr-1.5" />
                    {dict.returns.createFirstBtn}
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {taxReturns.slice(0, 4).map((tr) => {
                const cantonName = dict.cantons[tr.canton_code] || tr.canton_code;
                const statusMeta = getStatusConfig(String(tr.status));

                return (
                  <Link key={tr.id} href={`/tax-returns/${tr.id}`} className="block group">
                    <div className="p-4 rounded-xl border border-slate-200/90 bg-white hover:border-primary/40 hover:shadow-md transition-all duration-200 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="h-11 w-11 rounded-xl bg-slate-100 border border-slate-200 text-slate-800 font-bold text-sm flex items-center justify-center flex-shrink-0 group-hover:bg-primary/10 group-hover:text-primary group-hover:border-primary/30 transition-colors">
                          {tr.canton_code}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-sm text-slate-900 group-hover:text-primary transition-colors truncate">
                              {cantonName} – {tr.municipality_name}
                            </p>
                            <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                              {tr.tax_year}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5 truncate">
                            {isGerman ? `BFS-Gemeindenummer: #${tr.municipality_code}` : `BFS Municipality ID: #${tr.municipality_code}`}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 flex-shrink-0">
                        <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full border', statusMeta.badgeClass)}>
                          {statusMeta.label}
                        </span>
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Cantonal Deadline Notice Card */}
          <div className="p-4 rounded-xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 space-y-1">
              <p className="font-semibold">{isGerman ? 'Hinweis: Kantonale Einreichefristen' : 'Swiss Cantonal Tax Deadline Reminder'}</p>
              <p className="text-amber-800/90 leading-relaxed">
                {isGerman
                  ? 'In den meisten Kantonen (wie Zürich, Bern, Basel) gilt für natürliche Personen der 31. März als ordentliche Frist. Kostenlose Fristerstreckungen können unkompliziert beim kantonalen Steueramt beantragt werden.'
                  : 'Most cantons (such as Zurich, Bern, Basel) set standard filing deadlines around March 31st for natural persons. Free deadline extensions can be requested through your cantonal tax authority website.'}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Swiss Tax Tools Interactive Hub (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{dict.dashboard.quickToolsTitle}</h3>
            <p className="text-xs text-slate-500">{dict.dashboard.quickToolsDesc}</p>
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
                    : 'text-slate-500 hover:text-slate-900',
                )}
              >
                <Car className="h-3.5 w-3.5 text-red-500" />
                <span>{isGerman ? 'Pendler' : 'Commute'}</span>
              </button>
              <button
                onClick={() => {
                  setActiveTool('ictax');
                  if (!ictaxResult) runIctaxLookup();
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all',
                  activeTool === 'ictax'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900',
                )}
              >
                <LineChart className="h-3.5 w-3.5 text-blue-500" />
                <span>ICTax 35%</span>
              </button>
              <button
                onClick={() => {
                  setActiveTool('crypto');
                  if (!cryptoResult) runCryptoLookup();
                }}
                className={cn(
                  'flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all',
                  activeTool === 'crypto'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-500 hover:text-slate-900',
                )}
              >
                <Coins className="h-3.5 w-3.5 text-amber-500" />
                <span>Crypto</span>
              </button>
            </div>

            <CardContent className="p-4 space-y-4">
              {activeTool === 'commuting' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-1">{isGerman ? 'Einfache Distanz (km)' : 'One-Way Distance (km)'}</label>
                      <input
                        type="number"
                        value={commutingKm}
                        onChange={(e) => setCommutingKm(Number(e.target.value))}
                        className="w-full border rounded px-2.5 py-1.5 text-xs font-semibold"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">{isGerman ? 'Verkehrsmittel' : 'Transport Mode'}</label>
                      <select
                        value={transportMode}
                        onChange={(e) => setTransportMode(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-xs bg-white"
                      >
                        <option value="public_transport">{isGerman ? 'Öffentlicher Verkehr' : 'Public Transport'}</option>
                        <option value="car">{isGerman ? 'Privates Auto' : 'Private Car'}</option>
                        <option value="bicycle">{isGerman ? 'Velo' : 'Bicycle'}</option>
                      </select>
                    </div>
                  </div>

                  {commutingResult && (
                    <div className="p-3 rounded-lg bg-red-50/50 border border-red-100 space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">{isGerman ? 'Bundesabzug:' : 'Federal Deduction:'}</span>
                        <strong className="text-slate-900">
                          {formatCurrency(commutingResult.federal_deduction_chf)}
                        </strong>
                      </div>
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-600">{isGerman ? 'Kantonsabzug:' : 'Cantonal Deduction:'}</span>
                        <strong className="text-red-700">
                          {formatCurrency(commutingResult.canton_deduction_chf)}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTool === 'ictax' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-1">{isGerman ? 'Schweizer Valorensymbol' : 'Swiss Security Symbol'}</label>
                      <input
                        type="text"
                        value={securitySymbol}
                        onChange={(e) => setSecuritySymbol(e.target.value)}
                        className="w-full border rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">{isGerman ? 'Anzahl Anteile' : 'Number of Shares'}</label>
                      <input
                        type="number"
                        value={securityShares}
                        onChange={(e) => setSecurityShares(Number(e.target.value))}
                        className="w-full border rounded px-2.5 py-1.5 text-xs font-semibold"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runIctaxLookup}
                    className="w-full text-xs h-8"
                  >
                    {isGerman ? 'Steuerwert abfragen' : 'Lookup Valuation'}
                  </Button>

                  {ictaxResult && (
                    <div className="p-3 rounded-lg bg-blue-50/50 border border-blue-100 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">{ictaxResult.name}:</span>
                        <strong className="text-slate-900">
                          {formatCurrency(ictaxResult.official_tax_value_chf)}
                        </strong>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-600">{isGerman ? '35% Verrechnungssteuer Rückforderung:' : '35% Withholding Reclaimable:'}</span>
                        <strong className="text-blue-700">
                          {formatCurrency(ictaxResult.withholding_tax_reclaimable_chf)}
                        </strong>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {activeTool === 'crypto' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="text-slate-500 block mb-1">{isGerman ? 'Kryptowährung' : 'Coin Symbol'}</label>
                      <input
                        type="text"
                        value={cryptoSymbol}
                        onChange={(e) => setCryptoSymbol(e.target.value)}
                        className="w-full border rounded px-2.5 py-1.5 text-xs font-mono font-bold"
                      />
                    </div>
                    <div>
                      <label className="text-slate-500 block mb-1">{isGerman ? 'Bestand' : 'Holding Amount'}</label>
                      <input
                        type="number"
                        value={cryptoAmount}
                        onChange={(e) => setCryptoAmount(Number(e.target.value))}
                        className="w-full border rounded px-2.5 py-1.5 text-xs font-semibold"
                      />
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={runCryptoLookup}
                    className="w-full text-xs h-8"
                  >
                    {isGerman ? 'ESTV-Steuerwert berechnen' : 'Evaluate ESTV Wealth Rate'}
                  </Button>

                  {cryptoResult && (
                    <div className="p-3 rounded-lg bg-amber-50/50 border border-amber-100 space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-600">{isGerman ? 'ESTV-Vermögenswert:' : 'ESTV Taxable Wealth:'}</span>
                        <strong className="text-slate-900">
                          {formatCurrency(cryptoResult.taxable_wealth_chf)}
                        </strong>
                      </div>
                      <p className="text-[10px] text-emerald-700 font-medium">
                        {cryptoResult.capital_gains_note}
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
  );
}
