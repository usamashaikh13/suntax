'use client';

import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  Download,
  FileText,
  Loader2,
  Info,
  ShieldCheck,
  Check,
  Lock,
  CreditCard,
  QrCode,
  ArrowRight,
  ExternalLink,
  Printer,
  Users
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { TaxReturn, TaxProfile, User } from '@/types';
import { formatCurrency, formatDate, formatApiError } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { BRAND } from '@/lib/brand';

interface Props {
  taxReturn: TaxReturn;
  profile: TaxProfile | null;
  calculation: any;
  onConfirm?: () => void;
  onNavigateTab?: (tab: string) => void;
}

const RECEIPT_LABELS_EN: Record<string, string> = {
  lohn: 'Salary certificate (Lohnausweis)',
  lohn2: 'Spouse salary certificate (Lohnausweis Partner 2)',
  securities: 'Tax statement or bank/custody statements as of 31.12.',
  neben: 'Secondary employment salary slip (Lohnausweis Nebenerwerb)',
  ahv: 'AHV/IV Pension certificate (Rentenbescheinigung AHV/IV)',
  pens: 'Occupational pension certificate (Rentenbescheinigung)',
  alv: 'Unemployment benefit statement (Arbeitslosenkasse)',
  zulagen: 'Daily allowances / family allowances statement',
  other: 'Documentation of other income',
  korp: 'Dividend & shares yield statement',
  kapAbf: 'Severance / lump-sum benefit statement',
  unterIn: 'Alimony received payment proofs',
  kidUnterIn: 'Child alimony received payment proofs',
  home: 'Mortgage interest certificate and property maintenance bills',
  weekly: 'Rental contract at place of employment (weekly commute)',
  support: 'Proof of support payments',
  kidsOut: 'Confirmation of education / university enrolment',
  alimony: 'Proof of spousal alimony paid',
  kidAlimony: 'Proof of child alimony paid',
  p3a: 'Pillar 3a contribution certificate (Tax certificate)',
  p3a2: 'Spouse Pillar 3a contribution certificate',
  p3a_catchup: 'Pillar 3a retroactive catch-up contribution certificate',
  prem: 'Health insurance tax certificate (Premiums & out-of-pocket costs)',
  pkBuy: 'Pension fund buy-in certificate (Pensionskassen-Einkauf)',
  wb: 'Invoices and receipts for further education',
  bkEff: 'Proof of actual job-related expenses',
  depot: 'Custody account statement / fee receipts',
  party: 'Donation receipts for political parties',
  sick: 'Medical expense receipts & health insurance settlement statements',
  handicap: 'Disability expense receipts and medical attestations',
  donate: 'Charitable donation receipts',
  rentLeist: 'Proof of annuity payments',
  care: 'Third-party childcare invoices / Kita confirmation',
  life: 'Life insurance surrender value statement as of 31.12.',
  korpW: 'Valuation of company shares / non-listed investments',
  otherW: 'Proof of other assets (vehicles, precious metals, art, cash)',
  debt: 'Debt statement / mortgage balance statement as of 31.12.',
  capital: 'Capital settlement certificate',
  giftIn: 'Inheritance or gift deed / statement',
  giftOut: 'Proof of gifts granted',
};

const PERSONAL_DATA_LABELS_EN: Record<string, string> = {
  ahvnr: 'AHV / Social Security Number (756.xxxx.xxxx.xx)',
  birth: 'Date of birth',
  addr: 'Official residential address as of 31.12.',
  name2: 'Partner 2: Full legal name',
  ahvnr2: 'Partner 2: AHV / Social Security Number',
  birth2: 'Partner 2: Date of birth',
  kidName: 'Children: Full legal name(s)',
  kidBirth: 'Children: Date(s) of birth',
};

const ANNEX_TITLES_EN: Record<string, string> = {
  job_expenses_annex: 'Professional Expenses Statement',
  securities_annex: 'Securities and Assets Statement with Withholding Tax Refund Application',
  medical_list_annex: 'Medical and Accident Expenses Statement',
  work_costs_list_annex: 'Other Work-Related Expenses Statement',
  training_list_annex: 'Further Education and Training Statement',
  donations_list_annex: 'Charitable Donations Statement',
  real_estate_annex: 'Real Estate / Property Register',
  debt_annex: 'Debt and Liabilities Statement',
  berufskosten: 'Professional Expenses Statement',
  wertschriften: 'Securities and Assets Statement',
  liegenschaften: 'Real Estate / Property Register',
  schulden: 'Debt and Liabilities Statement',
  krankheit: 'Medical and Accident Expenses Statement',
  uebrige_berufskosten: 'Other Work-Related Expenses Statement',
  weiterbildung: 'Further Education and Training Statement',
  spenden: 'Charitable Donations Statement',
};

const getConfirmationTextDe = () =>
  `Gemäss Art. 110 DBG (schweizerisches Selbstdeklarationsprinzip) habe ich meine Steuererklärung sorgfältig überprüft und bestätige, dass alle gemachten Angaben vollständig, wahrheitsgetreu und belegt sind. Ich nehme zur Kenntnis, dass die Steuerberechnung von ${BRAND.name} eine unverbindliche Schätzung (« ca. CHF … ») darstellt und die rechtsgültige Veranlagung ausschliesslich durch das kantonale Steueramt erfolgt.`;

const getConfirmationTextEn = () =>
  `Pursuant to Art. 110 DBG (Swiss principle of self-declaration), I have carefully reviewed my tax return and confirm that all details provided are complete, truthful, and substantiated. I acknowledge that the tax calculation by ${BRAND.name} represents a non-binding estimate ("approx. CHF ...") and that the legally binding assessment is issued exclusively by the cantonal tax authority.`;

export function FinalReview({
  taxReturn,
  profile,
  calculation,
  onConfirm,
  onNavigateTab,
}: Props) {
  const { toast } = useToast();
  const { isGerman } = useTranslation();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xml' | 'dossier' | null>(null);

  // Payment states (Milestone 2 Part B6)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'twint' | 'credit_card'>('twint');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [activeGateway, setActiveGateway] = useState<{ gateway_id: string; checkout_url: string; provider: string } | null>(null);
  const [isPaid, setIsPaid] = useState<boolean>(taxReturn.payment_status === 'paid');

  // Partner 2 confirmation states (Art. 113 DBG)
  const [partner2Status, setPartner2Status] = useState<any>(null);
  const [partner2Email, setPartner2Email] = useState('');
  const [partner2InviteLoading, setPartner2InviteLoading] = useState(false);
  const [partner2InviteUrl, setPartner2InviteUrl] = useState<string | null>(null);

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [receiptCheck, setReceiptCheck] = useState<any>(null);
  const [cantonAvailable, setCantonAvailable] = useState<boolean>(true);

  const CONFIRMATION_TEXT = isGerman ? getConfirmationTextDe() : getConfirmationTextEn();

  useEffect(() => {
    api.auth.getMe().then(setCurrentUser).catch(() => {});
    // Check payment status from backend
    api.taxReturns.getPaymentStatus(taxReturn.id)
      .then(res => setIsPaid(res.is_paid))
      .catch(() => {});

    // Check Partner 2 status
    api.taxReturns.partner2Status(taxReturn.id)
      .then(setPartner2Status)
      .catch(() => {});

    // Check Addendum 1 receipt rules and canton rollout availability
    api.taxReturns.getReceiptCheck(taxReturn.id)
      .then(setReceiptCheck)
      .catch(() => {});
    api.cantons.getAvailability(taxReturn.canton_code, taxReturn.tax_year)
      .then(res => setCantonAvailable(Boolean(res?.is_available)))
      .catch(() => {});
  }, [taxReturn.id, taxReturn.canton_code, taxReturn.tax_year]);

  const isReady = Boolean(profile && calculation);
  const isAlreadyConfirmed = taxReturn.status === 'confirmed' || taxReturn.status === 'submitted';

  const pd = (profile?.personal_data || {}) as Record<string, any>;
  const inc = (profile?.income_data || {}) as Record<string, any>;

  const getReceiptLabel = (item: any) => {
    if (isGerman) return item.label || item.key;
    return item.label_en || RECEIPT_LABELS_EN[item.key] || item.label || item.key;
  };

  const getPersonalDataLabel = (mp: any) => {
    if (isGerman) return mp.label || mp.key;
    return mp.label_en || PERSONAL_DATA_LABELS_EN[mp.key] || mp.label || mp.key;
  };

  const getAnnexTitle = (a: any) => {
    if (isGerman) return a.title || a.key;
    return a.title_en || ANNEX_TITLES_EN[a.key] || a.title || a.key;
  };
  const ded = (profile?.deductions_data || {}) as Record<string, any>;
  const r = calculation?.results || {};
  const savingsAnalysis = r.savings_analysis || calculation?.savings_analysis || null;
  const savingsTotalChf = savingsAnalysis ? Math.round(Number(savingsAnalysis.total_savings_chf || 0)) : null;

  const civilStatusLower = String(pd.civil_status || pd.marital_status || 'single').toLowerCase();
  const isMarried = civilStatusLower.includes('verh') || civilStatusLower.includes('marr') || civilStatusLower.includes('partner');
  const partner2Confirmed = Boolean(partner2Status?.is_confirmed || taxReturn.partner2_confirmed_at);

  const handlePartner2Invite = async () => {
    if (!partner2Email.trim()) return;
    setPartner2InviteLoading(true);
    try {
      const res = await api.taxReturns.partner2Invite(taxReturn.id, { email: partner2Email.trim() });
      const fullUrl = `${window.location.origin}${res.confirmation_url}`;
      setPartner2InviteUrl(fullUrl);
      toast({
        title: isGerman ? 'Einladung erstellt' : 'Invitation generated',
        description: isGerman
          ? 'Der persönliche Bestätigungslink für Partner 2 wurde generiert.'
          : 'Personal confirmation link for Partner 2 has been created.',
      });
      const updatedStatus = await api.taxReturns.partner2Status(taxReturn.id);
      setPartner2Status(updatedStatus);
    } catch (err: any) {
      toast({
        title: isGerman ? 'Einladung fehlgeschlagen' : 'Invitation failed',
        description: formatApiError(err, isGerman ? 'Bitte versuche es erneut.' : 'Please try again.'),
        variant: 'destructive',
      });
    } finally {
      setPartner2InviteLoading(false);
    }
  };

  const fullName =
    pd.name ||
    [pd.first_name, pd.last_name].filter(Boolean).join(' ') ||
    '';
  const fullAddress =
    pd.address ||
    [pd.address_street, pd.address_zip, pd.address_city].filter(Boolean).join(', ') ||
    '';
  const civilStatus = pd.civil_status || pd.marital_status || (isGerman ? 'Ledig' : 'Single');

  // Format CHF with Swiss apostrophes
  const fmtChf = (val: any) => {
    const num = Math.round(Number(val || 0));
    return `« ca. CHF ${num.toLocaleString('de-CH')} »`;
  };

  interface MissingValidationItem {
    id: string;
    labelDe: string;
    labelEn: string;
    stepId: string;
    hintDe: string;
    hintEn: string;
  }

  const missingItems: MissingValidationItem[] = [];
  if (!fullName || fullName.trim() === '') {
    missingItems.push({
      id: 'name',
      labelDe: 'Vollständiger Name des Steuerpflichtigen',
      labelEn: 'Full legal name of taxpayer',
      stepId: 'start',
      hintDe: 'In Schritt 1 (Start) ergänzen',
      hintEn: 'Complete in Step 1 (Start)',
    });
  }
  if (!taxReturn.canton_code) {
    missingItems.push({
      id: 'canton',
      labelDe: 'Kantonscode und Wohngemeinde',
      labelEn: 'Canton code and municipality',
      stepId: 'start',
      hintDe: 'PLZ in Schritt 1 eingeben',
      hintEn: 'Enter postal code in Step 1',
    });
  }
  if (isMarried && !partner2Confirmed) {
    missingItems.push({
      id: 'partner2',
      labelDe: 'Persönliche Bestätigung von Partner 2 (Art. 113 DBG)',
      labelEn: 'Personal confirmation from Partner 2 (Art. 113 DBG)',
      stepId: 'submit',
      hintDe: 'Unten Einladungslink generieren',
      hintEn: 'Generate invite link below',
    });
  }

  const canConfirm = isReady && missingItems.length === 0 && !isAlreadyConfirmed;

  const handleExport = async (type: 'pdf' | 'xml' | 'dossier') => {
    setExporting(type);
    try {
      const lang: 'de' | 'en' = isGerman ? 'de' : 'en';
      const blob =
        type === 'pdf'
          ? await api.taxEngine.exportPdf(taxReturn.id, lang)
          : type === 'xml'
          ? await api.taxEngine.exportXml(taxReturn.id)
          : await api.taxEngine.exportDossier(taxReturn.id, lang);

      if (blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        let detail = isGerman ? 'Export fehlgeschlagen.' : 'Export failed.';
        try {
          const parsed = JSON.parse(text);
          if (parsed.detail) detail = parsed.detail;
        } catch {}
        toast({
          title: isGerman ? 'Export fehlgeschlagen' : 'Export failed',
          description: detail,
          variant: 'destructive',
        });
        return;
      }

      const ext = type === 'pdf' ? 'pdf' : type === 'xml' ? 'xml' : 'zip';
      const mime =
        type === 'pdf'
          ? 'application/pdf'
          : type === 'xml'
          ? 'application/xml'
          : 'application/zip';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download =
        type === 'pdf'
          ? `${BRAND.filePrefix}_${taxReturn.canton_code}_${taxReturn.tax_year}_Steuererklaerung.pdf`
          : type === 'xml'
          ? `${BRAND.filePrefix}_${taxReturn.canton_code}_${taxReturn.tax_year}_Filing_Data.xml`
          : `${BRAND.filePrefix}_${taxReturn.canton_code}_${taxReturn.tax_year}_eTax_Dossier.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: isGerman ? 'Download fehlgeschlagen' : 'Download failed',
        description: err?.message || (isGerman ? 'Bitte stellen Sie sicher, dass die Berechnung abgeschlossen ist.' : 'Please ensure calculation is completed.'),
        variant: 'destructive',
      });
    } finally {
      setExporting(null);
    }
  };

  // Payment Execution (Part B6): Two-step provider flow with mandatory verification
  const handleInitiatePayment = async () => {
    setPaymentProcessing(true);
    try {
      const res = await api.taxReturns.createPaymentCheckout(taxReturn.id, selectedPaymentMethod);
      setActiveGateway({
        gateway_id: res.gateway_id,
        checkout_url: res.checkout_url,
        provider: res.provider || 'payrexx',
      });
      try {
        if (res.checkout_url && !res.is_sandbox) {
          window.open(res.checkout_url, '_blank');
        }
      } catch (popupErr) {
        console.warn('Popup blocked:', popupErr);
      }
      toast({
        title: isGerman ? 'Zahlungsfenster geöffnet' : 'Payment window opened',
        description: isGerman
          ? 'Bitte schliesse die Zahlung im Payrexx-Fenster ab oder nutze die Sandbox-Schaltfläche zur Simulation.'
          : 'Please complete payment in the Payrexx window or use the sandbox simulation button below.',
      });
    } catch (err: any) {
      toast({
        title: isGerman ? 'Checkout fehlgeschlagen' : 'Checkout failed',
        description: formatApiError(
          err,
          isGerman ? 'Bitte deaktiviere eventuelle Ad-Blocker oder nutze den Sandbox-Modus.' : 'Please disable any ad-blockers or use sandbox mode.'
        ),
        variant: 'destructive',
      });
    } finally {
      setPaymentProcessing(false);
    }
  };

  const handleSimulateSandboxPayment = async () => {
    setCheckingPayment(true);
    try {
      await api.taxReturns.simulateSandboxPayment(taxReturn.id, selectedPaymentMethod);
      setIsPaid(true);
      setShowPaymentModal(false);
      setActiveGateway(null);
      toast({
        title: isGerman ? 'Zahlung erfolgreich verifiziert!' : 'Payment successfully verified!',
        description: isGerman
          ? 'Die Pauschale von CHF 39.00 wurde im Testmodus verbucht. Du kannst deine Steuererklärung nun definitiv bestätigen und einreichen.'
          : 'The flat fee of CHF 39.00 has been recorded in test mode. You can now finalize and submit your tax return.',
      });
      onConfirm?.();
    } catch (err: any) {
      toast({
        title: isGerman ? 'Test-Zahlung fehlgeschlagen' : 'Test payment failed',
        description: formatApiError(err, isGerman ? 'Simulation fehlgeschlagen.' : 'Simulation failed.'),
        variant: 'destructive',
      });
    } finally {
      setCheckingPayment(false);
    }
  };

  const handleVerifyPayment = async () => {
    setCheckingPayment(true);
    try {
      await api.taxReturns.confirmPayment(taxReturn.id, {
        gateway_id: activeGateway?.gateway_id,
        method: selectedPaymentMethod,
      });
      setIsPaid(true);
      setShowPaymentModal(false);
      setActiveGateway(null);
      toast({
        title: isGerman ? 'Zahlung erfolgreich verifiziert!' : 'Payment successfully verified!',
        description: isGerman
          ? 'Die Pauschale von CHF 39.00 wurde verbucht. Du kannst deine Steuererklärung nun definitiv bestätigen und einreichen.'
          : 'The flat fee of CHF 39.00 has been recorded. You can now finalize and submit your tax return.',
      });
    } catch (err: any) {
      toast({
        title: isGerman ? 'Zahlung noch nicht bestätigt' : 'Payment not yet confirmed',
        description: formatApiError(
          err,
          isGerman
            ? 'Die Zahlung wurde beim Zahlungsanbieter noch nicht bestätigt. Bitte schliesse den Vorgang ab.'
            : 'The payment has not yet been confirmed by the provider. Please complete the transaction.'
        ),
        variant: 'destructive',
      });
    } finally {
      setCheckingPayment(false);
    }
  };

  // Final confirmation
  const handleConfirm = async () => {
    if (!canConfirm) return;

    if (!isPaid) {
      setShowPaymentModal(true);
      return;
    }

    if (currentUser?.totp_enabled && twoFactorCode.trim().length !== 6) {
      toast({
        title: isGerman ? 'Sicherheitscode erforderlich' : 'Security code required',
        description: isGerman
          ? 'Bitte geben Sie den 6-stelligen Code aus Ihrer Authenticator App ein.'
          : 'Please enter the 6-digit code from your authenticator app.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      await api.taxEngine.confirm(taxReturn.id, CONFIRMATION_TEXT, twoFactorCode.trim() || undefined);
      toast({
        title: isGerman ? 'Steuererklärung erfolgreich bestätigt!' : 'Tax return successfully confirmed!',
        description: isGerman
          ? 'Ihr Dossier wurde finalisiert und für den Postversand freigegeben.'
          : 'Your dossier has been finalized and ready for filing.',
      });
      setShowConfirmDialog(false);
      onConfirm?.();
    } catch (error: any) {
      toast({
        title: isGerman ? 'Bestätigung fehlgeschlagen' : 'Confirmation failed',
        description: formatApiError(
          error,
          isGerman ? 'Bitte vervollständigen Sie alle Pflichtfelder.' : 'Please complete all required fields.'
        ),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <Card className="border-amber-200 bg-amber-50/30 rounded-2xl">
        <CardContent className="py-12 text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h3 className="font-bold text-slate-900 text-base">
            {isGerman ? 'Prüfung & Export noch nicht bereit' : 'Review & Export not ready yet'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {isGerman
              ? 'Bitte laden Sie zuerst Ihre Dokumente hoch und führen Sie die Steuerberechnung durch, bevor Sie die Schlussprüfung abschliessen.'
              : 'Please upload your documents and complete the tax calculation before proceeding to the final review.'}
          </p>
          {onNavigateTab && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab('review')}
              className="text-xs mt-2 rounded-xl"
            >
              {isGerman ? 'Zur Steuerberechnung' : 'To Tax Calculation'}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Already Confirmed Banner */}
      {isAlreadyConfirmed && (
        <div className="p-5 rounded-2xl border border-emerald-200 bg-emerald-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#1E7B52] text-white flex items-center justify-center font-bold flex-shrink-0 shadow-xs">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-950">
                {isGerman ? 'Steuererklärung erfolgreich finalisiert!' : 'Tax return successfully finalized!'}
              </h4>
              <p className="text-xs text-emerald-800">
                {isGerman
                  ? `Bestätigt am ${taxReturn.confirmed_at ? formatDate(taxReturn.confirmed_at) : 'kürzlich'} gemäss Art. 110 DBG.`
                  : `Confirmed on ${taxReturn.confirmed_at ? formatDate(taxReturn.confirmed_at) : 'recently'} pursuant to Art. 110 DBG.`}
              </p>
              {savingsAnalysis && (
                <p data-testid="post-submit-savings" className="text-xs font-bold text-[#1E7B52] mt-1">
                  {isGerman
                    ? `Dank deinen Abzügen sparst du ca. CHF ${(savingsTotalChf ?? 0).toLocaleString('de-CH')}.`
                    : `Thanks to your deductions, you save approx. CHF ${(savingsTotalChf ?? 0).toLocaleString('de-CH')}.`}{' '}
                  <span className="font-normal text-slate-600">
                    ({isGerman
                      ? 'Unverbindliche Schätzung – die definitive Steuer berechnet das Steueramt.'
                      : 'Non-binding estimate – definitive tax is assessed by the tax authority.'})
                  </span>
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={Boolean(exporting)}
              className="text-xs bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold shadow-xs flex items-center gap-1.5 rounded-xl h-10 px-4"
            >
              <Download className="h-4 w-4" />
              {isGerman ? 'Amtliches PDF für Postversand' : 'Official PDF for postal filing'}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport('dossier')}
              disabled={Boolean(exporting)}
              className="text-xs border-[#1E7B52]/30 text-[#1E7B52] hover:bg-emerald-50 font-bold shadow-xs flex items-center gap-1.5 rounded-xl h-10 px-4"
            >
              <Download className="h-4 w-4" />
              {isGerman ? 'e-Tax Dossier (.zip)' : 'e-Tax Dossier (.zip)'}
            </Button>
          </div>
        </div>
      )}

      {/* ── Validation Summary with Direct Links ── */}
      {missingItems.length > 0 && !isAlreadyConfirmed && (
        <div className="p-4 rounded-2xl border border-amber-300 bg-amber-50 space-y-2">
          <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
            <AlertTriangle className="h-4 w-4 text-amber-700 flex-shrink-0" />
            <span>
              {isGerman
                ? `Vor dem Einreichen ausstehend (${missingItems.length} Angabe(n)):`
                : `Pending before submission (${missingItems.length} item(s)):`}
            </span>
          </div>
          <ul className="space-y-1.5 pl-6 list-disc text-xs text-amber-950">
            {missingItems.map(item => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onNavigateTab?.(item.stepId)}
                  className="font-bold underline text-[#1E7B52] hover:text-[#165C3D] text-left cursor-pointer"
                >
                  {isGerman ? item.labelDe : item.labelEn}
                </button>
                <span className="text-amber-800 ml-1.5">
                  ({isGerman ? item.hintDe : item.hintEn})
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Personal & Filing Overview */}
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-bold text-slate-900">
              {isGerman ? 'Steuerpflichtige Person & Veranlagung' : 'Taxpayer & Assessment Overview'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 text-xs text-slate-700">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Name & Vorname' : 'Full Name'}</span>
              <strong className="text-slate-900">{fullName || (isGerman ? 'Unvollständig' : 'Incomplete')}</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Wohnadresse' : 'Address'}</span>
              <span className="text-slate-900 font-medium">{fullAddress || (isGerman ? 'Gemäss Lohnausweis' : 'As per salary slip')}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Zivilstand' : 'Civil Status'}</span>
              <span className="text-slate-900 font-medium">{civilStatus}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Kanton & Steuerjahr' : 'Canton & Tax Year'}</span>
              <strong className="text-slate-900">
                {isGerman ? 'Kanton' : 'Canton'} {taxReturn.canton_code} • {isGerman ? 'Steuerjahr' : 'Tax Year'} {taxReturn.tax_year}
              </strong>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">{isGerman ? 'Wohngemeinde' : 'Municipality'}</span>
              <span className="text-slate-900 font-medium">{taxReturn.municipality_name || taxReturn.municipality_code}</span>
            </div>
          </CardContent>
        </Card>

        {/* Calculation Summary with « ca. CHF … » */}
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900">
                {isGerman ? 'Steuerberechnung (Schätzung)' : 'Tax Calculation (Estimate)'}
              </CardTitle>
              <Badge variant="outline" className="text-[10px] text-[#1E7B52] border-emerald-200 bg-emerald-50">
                {isGerman ? 'Unverbindliche Schätzung' : 'Non-binding estimate'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 text-xs text-slate-700">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Steuerbares Einkommen (Kanton)' : 'Taxable Income (Canton)'}</span>
              <strong className="text-slate-900">{fmtChf(r.canton_taxable_income ?? r.taxable_income)}</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Direkte Bundessteuer' : 'Direct Federal Tax'}</span>
              <span className="font-mono text-slate-900">{fmtChf(r.federal_income_tax)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Kantonssteuer' : 'Cantonal Tax'}</span>
              <span className="font-mono text-slate-900">{fmtChf(r.cantonal_income_tax)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">{isGerman ? 'Gemeindesteuer' : 'Municipal Tax'} ({taxReturn.municipality_name})</span>
              <span className="font-mono text-slate-900">{fmtChf(r.municipal_income_tax)}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-2.5 text-sm font-extrabold text-[#1E7B52] border-t border-slate-200">
              <span>{isGerman ? 'Geschätzter Steuerbetrag Total' : 'Estimated Total Tax Due'}</span>
              <span className="font-mono whitespace-nowrap">{fmtChf(r.total_tax)}</span>
            </div>
            {savingsAnalysis && (
              <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                <p className="font-bold text-[#1E7B52] text-xs">
                  {isGerman
                    ? `Dank deinen Abzügen sparst du ca. CHF ${(savingsTotalChf ?? 0).toLocaleString('de-CH')}.`
                    : `Thanks to your deductions, you save approx. CHF ${(savingsTotalChf ?? 0).toLocaleString('de-CH')}.`}
                </p>
                <p className="text-[11px] text-slate-600">
                  {isGerman
                    ? 'Unverbindliche Schätzung – die definitive Steuer berechnet das Steueramt.'
                    : 'Non-binding estimate – definitive tax is assessed by the tax authority.'}
                </p>
                {savingsAnalysis.rough_estimate_notice && (
                  <p className="text-[11px] text-amber-800">{savingsAnalysis.rough_estimate_notice}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Addendum 1 Section 4: Data-Driven Receipt Check (required vs keep_only) ── */}
      {receiptCheck && (
        <Card data-testid="receipt-check-card" className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
              <FileText className="h-4 w-4 text-[#1E7B52]" />
              <span>
                {isGerman
                  ? `Belegprüfung & Beilagen (Kanton ${taxReturn.canton_code})`
                  : `Receipts & Annexes Check (${taxReturn.canton_code})`}
              </span>
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              {isGerman
                ? 'Unterscheidung zwischen zwingend einzureichenden Belegen und Belegen zum blossen Aufbewahren.'
                : 'Separates receipts required for submission from keep-only supporting records.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-3 text-xs">
            {Array.isArray(receiptCheck.required_missing) && receiptCheck.required_missing.length > 0 && (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                <p className="font-bold text-amber-950">
                  {isGerman ? 'Zwingend beizulegende Belege (noch ausstehend):' : 'Required receipts (missing):'}
                </p>
                <ul className="list-disc pl-5 text-amber-900 space-y-0.5">
                  {receiptCheck.required_missing.map((item: any) => (
                    <li key={item.key}>{getReceiptLabel(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(receiptCheck.attached_ok) && receiptCheck.attached_ok.length > 0 && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-1">
                <p className="font-bold text-emerald-950">
                  {isGerman ? 'Erforderliche Belege hochgeladen:' : 'Required receipts attached:'}
                </p>
                <ul className="list-disc pl-5 text-emerald-900 space-y-0.5">
                  {receiptCheck.attached_ok.map((item: any) => (
                    <li key={item.key}>{getReceiptLabel(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(receiptCheck.missing_personal_data) && receiptCheck.missing_personal_data.length > 0 && (
              <div data-testid="missing-personal-data-box" className="p-3 rounded-xl bg-amber-50 border border-amber-200 space-y-1">
                <p className="font-bold text-amber-950">
                  {isGerman ? 'Fehlende persönliche Angaben vor dem Einreichen:' : 'Missing personal information before filing:'}
                </p>
                <ul className="list-disc pl-5 text-amber-900 space-y-0.5">
                  {receiptCheck.missing_personal_data.map((mp: any) => (
                    <li key={mp.key}>{getPersonalDataLabel(mp)}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(receiptCheck.keep_only_items) && receiptCheck.keep_only_items.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <p className="font-bold text-slate-800">
                  {isGerman
                    ? 'Nur aufbewahren (nicht beilegen, nur auf Verlangen einreichen):'
                    : 'Keep for your records only (do not attach):'}
                </p>
                <ul className="list-disc pl-5 text-slate-600 space-y-0.5">
                  {receiptCheck.keep_only_items.map((item: any) => (
                    <li key={item.key}>{getReceiptLabel(item)}</li>
                  ))}
                </ul>
              </div>
            )}

            {Array.isArray(receiptCheck.app_generated_annexes) && receiptCheck.app_generated_annexes.length > 0 && (
              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200 space-y-1">
                <p className="font-bold text-blue-950">
                  {isGerman
                    ? `Automatisch von ${BRAND.name} erstellte Beilagen:`
                    : `Automatically generated annexes by ${BRAND.name}:`}
                </p>
                <ul className="list-disc pl-5 text-blue-900 space-y-0.5">
                  {receiptCheck.app_generated_annexes.map((a: any) => (
                    <li key={a.key}>{getAnnexTitle(a)}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Filing Instructions Card (Paper Filing) */}
      <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
            <Printer className="h-4 w-4 text-[#1E7B52]" />
            <span>
              {isGerman
                ? 'Filing per Postversand (Offizielles Schweizer Verfahren)'
                : 'Postal Filing Procedure (Official Swiss Method)'}
            </span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            {isGerman
              ? `Das elektronische Filing für Drittanbieter wird im Kanton Zürich aktuell schrittweise eingeführt. Die amtliche Einreichung erfolgt via ausgedrucktem, unterschriebenem Dossier.`
              : `Electronic third-party filing is currently being phased in for Canton Zurich. Official filing is conducted via printed, signed tax dossiers.`}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">
                {isGerman ? '1. PDF herunterladen' : '1. Download PDF'}
              </span>
              <p className="text-[11px] text-slate-500">
                {isGerman
                  ? 'Lade die fertig aufbereitete Steuererklärung mit allen Ziffern herunter.'
                  : 'Download the completed tax form containing all extracted boxes.'}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">
                {isGerman ? '2. Unterschreiben' : '2. Sign Document'}
              </span>
              <p className="text-[11px] text-slate-500">
                {isGerman
                  ? 'Drucke das Dokument aus und unterzeichne es auf der Schlussseite.'
                  : 'Print the dossier and sign the declaration page.'}
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">
                {isGerman ? '3. Per Post absenden' : '3. Mail by Post'}
              </span>
              <p className="text-[11px] text-slate-500">
                {isGerman
                  ? `Zusammen mit dem Original-Lohnausweis an das Steueramt ${taxReturn.municipality_name} senden.`
                  : `Send along with original salary slips to the municipal tax office of ${taxReturn.municipality_name}.`}
              </p>
            </div>
          </div>

          {/* Explicit disclaimer confirming SunTax does NOT transmit automatically to the tax authority */}
          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900 space-y-1">
            <span className="font-bold flex items-center gap-1.5 text-amber-950">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
              {isGerman ? 'Wichtiger rechtlicher Hinweis zur Einreichung:' : 'Important legal notice regarding submission:'}
            </span>
            <p className="leading-relaxed">
              {isGerman
                ? `${BRAND.name} finalisiert Ihr Steuerdossier gemäss Art. 110 DBG (Selbstdeklaration). Die Steuererklärung wird von uns NICHT elektronisch an das Steueramt übertragen. Bitte drucken Sie das amtliche Hauptformular aus, unterschreiben Sie es handschriftlich und senden Sie es zusammen mit dem Original-Lohnausweis per Post an das Steueramt Ihrer Wohngemeinde.`
                : `${BRAND.name} finalizes your tax dossier according to Art. 110 DBG (self-declaration). SunTax does NOT automatically transmit your tax return to the tax authority. You must print out the official declaration form, sign it by hand, and mail it with your original salary certificate to your municipal tax office.`}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={Boolean(exporting)}
              className="text-xs h-10 font-bold border-[#1E7B52]/30 text-[#1E7B52] hover:bg-emerald-50 rounded-xl flex items-center gap-1.5"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isGerman ? 'Amtliche Steuererklärung als PDF herunterladen' : 'Download official tax return PDF'}
            </Button>

            <Button
              variant="outline"
              onClick={() => handleExport('xml')}
              disabled={Boolean(exporting)}
              className="text-xs h-10 font-semibold text-slate-700 hover:bg-slate-50 rounded-xl flex items-center gap-1.5"
            >
              {exporting === 'xml' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {isGerman ? 'eCH-0119 Steuerdaten XML' : 'eCH-0119 Tax Data XML'}
            </Button>

            <Button
              variant="outline"
              onClick={() => handleExport('dossier')}
              disabled={Boolean(exporting)}
              className="text-xs h-10 font-bold border-emerald-600/30 text-emerald-800 bg-emerald-50/50 hover:bg-emerald-100/60 rounded-xl flex items-center gap-1.5"
            >
              {exporting === 'dossier' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              {isGerman ? 'e-Tax Dossier (.zip mit Belegen)' : 'e-Tax Dossier (.zip with attachments)'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Partner 2 Confirmation Section (Art. 113 DBG) ── */}
      {isMarried && (
        <Card className="border-[#ECE8DF] bg-white rounded-2xl shadow-xs">
          <CardHeader className="pb-3 border-b border-slate-100">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                <Users className="h-4 w-4 text-[#1E7B52]" />
                <span>{isGerman ? 'Gemeinsame Steuererklärung (Art. 113 DBG)' : 'Joint Tax Declaration (Art. 113 DBG)'}</span>
              </CardTitle>
              <Badge className={partner2Confirmed ? 'bg-emerald-50 text-[#1E7B52] border-emerald-200' : 'bg-amber-50 text-amber-800 border-amber-200'}>
                {partner2Confirmed
                  ? (isGerman ? 'Partner 2 bestätigt' : 'Partner 2 confirmed')
                  : (isGerman ? 'Bestätigung ausstehend' : 'Confirmation pending')}
              </Badge>
            </div>
            <CardDescription className="text-xs text-slate-500">
              {isGerman
                ? 'Verheiratete und eingetragene Paare müssen die Steuererklärung gemeinsam einreichen.'
                : 'Married couples and registered partners must file their tax return jointly.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4 text-xs">
            {partner2Confirmed ? (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-emerald-950 font-medium">
                <CheckCircle className="h-4 w-4 text-[#1E7B52] flex-none" />
                <span>
                  {isGerman
                    ? `Persönliche Bestätigung von ${partner2Status?.confirmed_name || taxReturn.partner2_confirmed_name || 'Partner 2'} am ${formatDate(partner2Status?.confirmed_at || taxReturn.partner2_confirmed_at)} erfasst.`
                    : `Personal confirmation from ${partner2Status?.confirmed_name || taxReturn.partner2_confirmed_name || 'Partner 2'} recorded on ${formatDate(partner2Status?.confirmed_at || taxReturn.partner2_confirmed_at)}.`}
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-600 flex-none mt-0.5" />
                  <div>
                    <strong>{isGerman ? 'Rechtliche Voraussetzung:' : 'Legal Requirement:'}</strong>{' '}
                    {isGerman
                      ? 'Partner 1 darf nicht für Partner 2 unterschreiben. Bitte sende deiner Partnerin / deinem Partner den persönlichen Bestätigungslink.'
                      : 'Partner 1 cannot legally sign on behalf of Partner 2. Please send your spouse the personal confirmation link.'}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-2">
                  <Input
                    type="email"
                    placeholder={isGerman ? 'E-Mail-Adresse von Partner 2' : "Partner 2's email address"}
                    value={partner2Email}
                    onChange={e => setPartner2Email(e.target.value)}
                    className="h-10 text-xs flex-1 rounded-xl"
                  />
                  <Button
                    onClick={handlePartner2Invite}
                    disabled={partner2InviteLoading || !partner2Email.trim()}
                    className="h-10 bg-[#1E7B52] hover:bg-[#165C3D] text-white text-xs font-semibold px-4 flex-none rounded-xl"
                  >
                    {partner2InviteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <ExternalLink className="h-3.5 w-3.5 mr-1" />}
                    {isGerman ? 'Einladung generieren' : 'Generate invitation'}
                  </Button>
                </div>

                {partner2InviteUrl && (
                  <div className="p-3 bg-[#FAFAF8] border border-slate-200 rounded-xl space-y-1">
                    <p className="text-[11px] font-semibold text-slate-700">
                      {isGerman ? 'Persönlicher Bestätigungslink für Partner 2:' : 'Personal confirmation link for Partner 2:'}
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        readOnly
                        value={partner2InviteUrl}
                        className="w-full text-[11px] font-mono bg-white p-2 rounded-lg border border-slate-300 text-slate-700 select-all"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          navigator.clipboard.writeText(partner2InviteUrl);
                          toast({ title: isGerman ? 'Link kopiert!' : 'Link copied!' });
                        }}
                        className="text-xs h-9 px-3 flex-none rounded-lg font-bold"
                      >
                        {isGerman ? 'Kopieren' : 'Copy'}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Confirmation & Payment Action Box */}
      {!isAlreadyConfirmed && (
        <Card className="border-emerald-200 shadow-sm bg-gradient-to-b from-white to-emerald-50/20 rounded-2xl">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                <ShieldCheck className="h-4 w-4 text-[#1E7B52]" />
                <span>
                  {isGerman ? 'Steuererklärung freischalten & finalisieren' : 'Unlock & finalize tax return'}
                </span>
              </CardTitle>
              <Badge className={isPaid ? 'bg-[#1E7B52] text-white' : 'bg-slate-800 text-white'}>
                {isPaid
                  ? (isGerman ? 'CHF 39.00 bezahlt' : 'CHF 39.00 paid')
                  : (isGerman ? 'Pauschale: CHF 39.00' : 'Flat fee: CHF 39.00')}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>{isGerman ? 'Hinweis zur rechtlichen Verbindlichkeit:' : 'Notice on legal binding:'}</strong>{' '}
                {isGerman
                  ? 'Nach der Bestätigung wird das Dossier gesperrt und mit einem rechtssicheren Zeitstempel versehen. Nachträgliche Korrekturen können nur durch einen Administrator freigeschaltet werden.'
                  : 'Upon confirmation, the dossier is locked and recorded with an audit timestamp. Subsequent edits require administrative unlocking.'}
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={!canConfirm}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-[#1E7B52] focus:ring-[#1E7B52]"
              />
              <span className="text-xs text-slate-700 leading-relaxed">{CONFIRMATION_TEXT}</span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {!cantonAvailable ? (
                <div className="w-full p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-950 font-semibold">
                  {isGerman
                    ? `Dein Kanton (${taxReturn.canton_code}) kommt bald – für noch nicht freigeschaltete Kantone ist keine Zahlung möglich.`
                    : `Your canton (${taxReturn.canton_code}) is coming soon — payment is disabled until live.`}
                </div>
              ) : !isPaid ? (
                <Button
                  onClick={() => setShowPaymentModal(true)}
                  disabled={!confirmed || !canConfirm}
                  className="w-full bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-11 rounded-xl shadow-md shadow-[#1E7B52]/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CreditCard className="h-4 w-4" />
                  {isGerman ? 'Zur Bezahlung (CHF 39.00 via TWINT / Karte)' : 'Proceed to Payment (CHF 39.00 via TWINT / Card)'}
                </Button>
              ) : (
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={!confirmed || !canConfirm || submitting}
                  className="w-full bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-11 rounded-xl shadow-md shadow-[#1E7B52]/20 flex items-center justify-center gap-2 cursor-pointer"
                >
                  <CheckCircle className="h-4 w-4" />
                  {isGerman ? 'Steuererklärung verbindlich abschliessen' : 'Confirm and submit tax return'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── PAYMENT MODAL (Part B6: CHF 39 TWINT / Card) ── */}
      {showPaymentModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-50 text-[#1E7B52] flex items-center justify-center font-bold">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">
                    {isGerman ? 'Einmalige Pauschale' : 'One-time flat fee'}
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    {isGerman ? `${BRAND.name} Flatrate: CHF 39.00 inkl. MwSt.` : `${BRAND.name} flat rate: CHF 39.00 incl. VAT`}
                  </p>
                </div>
              </div>
              <span className="text-xl font-black text-slate-900 font-mono">CHF 39.00</span>
            </div>

            {/* Active Provider Session or Method Selector */}
            {activeGateway ? (
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 space-y-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-900 font-bold">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  <span>
                    {isGerman ? 'Zahlungsvorgang bei Payrexx eingeleitet' : 'Payment session initiated with Payrexx'}
                  </span>
                </div>
                <p className="text-emerald-800 leading-relaxed">
                  {isGerman
                    ? 'Ein Bezahlfenster für deine Pauschale von CHF 39.00 wurde geöffnet. Falls dein Browser das Pop-up blockiert hat, klicke bitte hier:'
                    : 'A secure checkout window for your CHF 39.00 flat fee was opened. If pop-ups were blocked, click here:'}
                </p>
                <a
                  href={activeGateway.checkout_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-3 py-1.5 bg-white border border-emerald-300 rounded-lg text-emerald-700 font-bold hover:bg-emerald-100 transition-colors"
                >
                  {isGerman ? 'Payrexx Bezahlfenster öffnen →' : 'Open Payrexx checkout window →'}
                </a>
                <p className="text-[11px] text-slate-500 pt-1">
                  {isGerman
                    ? 'Sobald du die Zahlung über TWINT oder Kreditkarte abgeschlossen hast, klicke auf «Zahlung überprüfen».'
                    : 'Once payment is completed, click "Verify payment status".'}
                </p>
              </div>
            ) : (
              <>
                {/* Payment Method Selector */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('twint')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedPaymentMethod === 'twint'
                        ? 'border-[#1E7B52] bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">TWINT</span>
                      <QrCode className="h-4 w-4 text-[#1E7B52]" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 font-normal">
                      {isGerman ? 'Schweizer Standard' : 'Swiss Standard'}
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethod('credit_card')}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                      selectedPaymentMethod === 'credit_card'
                        ? 'border-[#1E7B52] bg-emerald-50 text-[#1E7B52] font-bold ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold">
                        {isGerman ? 'Kreditkarte' : 'Credit Card'}
                      </span>
                      <CreditCard className="h-4 w-4 text-[#1E7B52]" />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1 font-normal">Mastercard / Visa</p>
                  </button>
                </div>

                {selectedPaymentMethod === 'twint' ? (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-3">
                    <div className="h-28 w-28 bg-white border-2 border-slate-800 rounded-lg mx-auto flex items-center justify-center shadow-xs">
                      <QrCode className="h-20 w-20 text-slate-800" />
                    </div>
                    <p className="text-xs text-slate-600">
                      {isGerman
                        ? 'Öffne deine TWINT App und bestätige die Zahlung von CHF 39.00.'
                        : 'Open your TWINT app and approve the payment of CHF 39.00.'}
                    </p>
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>{isGerman ? 'Empfänger:' : 'Recipient:'}</span>
                      <strong className="text-slate-900">{BRAND.companyLegalName}</strong>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>{isGerman ? 'Betrag:' : 'Amount:'}</span>
                      <strong className="text-slate-900">CHF 39.00</strong>
                    </div>
                    <p className="text-[11px] text-slate-500 pt-2 border-t">
                      {isGerman
                        ? 'Sichere Zahlungsabwicklung via PCI-DSS konformem Schweizer Payment Gateway.'
                        : 'Secure transaction via PCI-DSS certified Swiss payment provider.'}
                    </p>
                  </div>
                )}
              </>
            )}

            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>{isGerman ? 'Sicherheits-Garantie:' : 'Security Guarantee:'}</strong>{' '}
                {isGerman
                  ? `${BRAND.name} verwaltet zu keinem Zeitpunkt Kundengelder. Die Abrechnung erfolgt direkt über zertifizierte Schweizer Zahlungsprovider.`
                  : `${BRAND.name} never holds customer funds directly. Transactions are processed via certified Swiss payment providers.`}
              </span>
            </div>

            {/* Local Sandbox Test Simulator */}
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 space-y-2">
              <div className="flex items-center justify-between font-semibold">
                <span className="flex items-center gap-1.5 text-amber-900 font-bold">
                  <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  {isGerman ? 'Test- & Sandbox-Modus' : 'Test & Sandbox Mode'}
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 bg-amber-200/60 rounded text-amber-900 font-bold">Local Dev</span>
              </div>
              <p className="text-[11px] text-amber-800 leading-snug">
                {isGerman
                  ? 'Für lokale Tests ohne echtes Geld: Simuliere den erfolgreichen Zahlungseingang von CHF 39.00.'
                  : 'For local testing without real funds: Simulate successful CHF 39.00 payment receipt.'}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleSimulateSandboxPayment}
                disabled={checkingPayment}
                className="w-full bg-white hover:bg-amber-100 border-amber-300 text-amber-950 font-bold text-xs h-9 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {checkingPayment ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <CheckCircle className="h-3.5 w-3.5 text-emerald-600" />
                )}
                <span>
                  {isGerman
                    ? `Test-Zahlung simulieren (CHF 39.00 ${selectedPaymentMethod === 'twint' ? 'TWINT' : 'Karte'})`
                    : `Simulate Test Payment (CHF 39.00 ${selectedPaymentMethod === 'twint' ? 'TWINT' : 'Card'})`}
                </span>
              </Button>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-xs rounded-xl"
                onClick={() => {
                  setShowPaymentModal(false);
                  setActiveGateway(null);
                }}
                disabled={paymentProcessing || checkingPayment}
              >
                {isGerman ? 'Abbrechen' : 'Cancel'}
              </Button>
              {activeGateway ? (
                <Button
                  className="flex-1 bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs rounded-xl"
                  onClick={handleVerifyPayment}
                  disabled={checkingPayment}
                >
                  {checkingPayment ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {isGerman ? 'Prüfe Zahlung...' : 'Verifying payment...'}
                    </>
                  ) : (
                    isGerman ? 'Zahlungsstatus überprüfen' : 'Verify payment status'
                  )}
                </Button>
              ) : (
                <Button
                  className="flex-1 bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs rounded-xl"
                  onClick={handleInitiatePayment}
                  disabled={paymentProcessing}
                >
                  {paymentProcessing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      {isGerman ? 'Initialisiere Checkout...' : 'Initializing checkout...'}
                    </>
                  ) : (
                    isGerman
                      ? `Jetzt CHF 39.00 ${selectedPaymentMethod === 'twint' ? 'mit TWINT' : 'mit Karte'} zahlen`
                      : `Pay CHF 39.00 ${selectedPaymentMethod === 'twint' ? 'with TWINT' : 'with Card'}`
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOG MODAL (Art. 110 DBG) ── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <ShieldCheck className="h-5 w-5 text-[#1E7B52]" />
              <h3>
                {isGerman ? 'Steuererklärung definitiv finalisieren?' : 'Definitively finalize tax return?'}
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {isGerman
                ? 'Möchtest du diese Steuererklärung verbindlich abschliessen? Nach der Bestätigung werden die Berechnungen gemäss Art. 110 DBG unwiderruflich verankert und für den Postversand freigegeben.'
                : 'Do you want to definitively lock this tax declaration? After confirmation, numbers are irrevocably committed under Art. 110 DBG and cleared for filing.'}
            </p>

            {currentUser?.totp_enabled && (
              <div className="space-y-3 pt-1">
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-950 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-emerald-800">
                    <Lock className="h-3.5 w-3.5 text-[#1E7B52]" />
                    <span>
                      {isGerman ? 'Zwei-Faktor-Autorisierung erforderlich' : 'Two-Factor Authentication Required'}
                    </span>
                  </div>
                  <p className="text-[11px] text-emerald-800 leading-snug">
                    {isGerman
                      ? 'Gib den 6-stelligen Code aus deiner Authenticator App ein, um diese rechtsgültige Deklaration zu signieren.'
                      : 'Enter the 6-digit code from your authenticator app to authorize this legal submission.'}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm2fa" className="text-xs font-semibold text-slate-700 block">
                    {isGerman ? '6-stelliger Sicherheitscode' : '6-digit security code'}
                  </label>
                  <Input
                    id="confirm2fa"
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    className="text-center tracking-widest font-mono text-lg h-11 border-slate-300 focus:border-[#1E7B52] rounded-xl"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-xs rounded-xl"
                onClick={() => {
                  setShowConfirmDialog(false);
                  setTwoFactorCode('');
                }}
                disabled={submitting}
              >
                {isGerman ? 'Abbrechen' : 'Cancel'}
              </Button>
              <Button
                className="flex-1 bg-[#1E7B52] hover:bg-[#165C3D] text-white text-xs font-bold rounded-xl"
                onClick={handleConfirm}
                disabled={submitting || (Boolean(currentUser?.totp_enabled) && twoFactorCode.trim().length !== 6)}
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {currentUser?.totp_enabled
                  ? (isGerman ? 'Autorisieren & Finalisieren' : 'Authorize & Finalize')
                  : (isGerman ? 'Ja, definitiv bestätigen' : 'Yes, definitively confirm')}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
