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
  Printer
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { TaxReturn, TaxProfile, User } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
  taxReturn: TaxReturn;
  profile: TaxProfile | null;
  calculation: any;
  onConfirm?: () => void;
  onNavigateTab?: (tab: string) => void;
}

const CONFIRMATION_TEXT =
  'Gemäss Art. 110 DBG (schweizerisches Selbstdeklarationsprinzip) habe ich meine Steuererklärung sorgfältig überprüft und bestätige, dass alle gemachten Angaben vollständig, wahrheitsgetreu und belegt sind. Ich nehme zur Kenntnis, dass die Steuerberechnung von SunTax eine unverbindliche Schätzung (« ca. CHF … ») darstellt und die rechtsgültige Veranlagung ausschliesslich durch das kantonale Steueramt erfolgt.';

export function FinalReview({
  taxReturn,
  profile,
  calculation,
  onConfirm,
  onNavigateTab,
}: Props) {
  const { toast } = useToast();
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xml' | null>(null);

  // Payment states (Milestone 2 Part B6)
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'twint' | 'credit_card'>('twint');
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [isPaid, setIsPaid] = useState<boolean>(taxReturn.payment_status === 'paid');

  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');

  useEffect(() => {
    api.auth.getMe().then(setCurrentUser).catch(() => {});
    // Check payment status from backend
    api.taxReturns.getPaymentStatus(taxReturn.id)
      .then(res => setIsPaid(res.is_paid))
      .catch(() => {});
  }, [taxReturn.id]);

  const isReady = Boolean(profile && calculation);
  const isAlreadyConfirmed = taxReturn.status === 'confirmed';

  const pd = (profile?.personal_data || {}) as Record<string, any>;
  const inc = (profile?.income_data || {}) as Record<string, any>;
  const ded = (profile?.deductions_data || {}) as Record<string, any>;
  const r = calculation?.results || {};

  const fullName =
    pd.name ||
    [pd.first_name, pd.last_name].filter(Boolean).join(' ') ||
    '';
  const fullAddress =
    pd.address ||
    [pd.address_street, pd.address_zip, pd.address_city].filter(Boolean).join(', ') ||
    '';
  const civilStatus = pd.civil_status || pd.marital_status || 'Ledig';

  // Format CHF with Swiss apostrophes
  const fmtChf = (val: any) => {
    const num = Math.round(Number(val || 0));
    return `« ca. CHF ${num.toLocaleString('de-CH')} »`;
  };

  // Check required data completeness
  const missingItems: string[] = [];
  if (!fullName || fullName.trim() === '') {
    missingItems.push('Vollständiger Name des Steuerpflichtigen (in den Stammdaten)');
  }
  if (!taxReturn.canton_code) {
    missingItems.push('Kantonscode');
  }

  const completionPct = profile?.completeness_score ?? (missingItems.length === 0 ? 100 : 75);
  const canConfirm = isReady && missingItems.length === 0 && !isAlreadyConfirmed;

  const handleExport = async (type: 'pdf' | 'xml') => {
    setExporting(type);
    try {
      const blob =
        type === 'pdf'
          ? await api.taxEngine.exportPdf(taxReturn.id)
          : await api.taxEngine.exportXml(taxReturn.id);

      if (blob.type && blob.type.includes('json')) {
        const text = await blob.text();
        let detail = 'Export fehlgeschlagen.';
        try {
          const parsed = JSON.parse(text);
          if (parsed.detail) detail = parsed.detail;
        } catch {}
        toast({ title: 'Export fehlgeschlagen', description: detail, variant: 'destructive' });
        return;
      }

      const ext = type === 'pdf' ? 'pdf' : 'xml';
      const mime = type === 'pdf' ? 'application/pdf' : 'application/xml';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download =
        type === 'pdf'
          ? `SunTax_${taxReturn.canton_code}_${taxReturn.tax_year}_Steuererklaerung.pdf`
          : `SunTax_${taxReturn.canton_code}_${taxReturn.tax_year}_Filing_Data.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: 'Download fehlgeschlagen',
        description: err?.message || 'Bitte stellen Sie sicher, dass die Berechnung abgeschlossen ist.',
        variant: 'destructive',
      });
    } finally {
      setExporting(null);
    }
  };

  // Payment Execution (Part B6)
  const handlePayment = async () => {
    setPaymentProcessing(true);
    try {
      await api.taxReturns.confirmPayment(taxReturn.id, selectedPaymentMethod);
      setIsPaid(true);
      setShowPaymentModal(false);
      toast({
        title: 'Zahlung erfolgreich!',
        description: 'Die Pauschale von CHF 39.00 wurde verbucht. Sie können Ihre Steuererklärung nun bestätigen und herunterladen.',
      });
    } catch (err: any) {
      toast({
        title: 'Zahlung fehlgeschlagen',
        description: err?.response?.data?.detail || 'Bitte versuchen Sie es erneut.',
        variant: 'destructive',
      });
    } finally {
      setPaymentProcessing(false);
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
        title: 'Sicherheitscode erforderlich',
        description: 'Bitte geben Sie den 6-stelligen Code aus Ihrer Authenticator App ein.',
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      await api.taxEngine.confirm(taxReturn.id, CONFIRMATION_TEXT, twoFactorCode.trim() || undefined);
      toast({
        title: 'Steuererklärung erfolgreich bestätigt!',
        description: 'Ihr Dossier wurde finalisiert und für den Postversand freigegeben.',
      });
      setShowConfirmDialog(false);
      onConfirm?.();
    } catch (error: any) {
      toast({
        title: 'Bestätigung fehlgeschlagen',
        description: error?.response?.data?.detail || 'Bitte vervollständigen Sie alle Pflichtfelder.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <Card className="border-amber-200 bg-amber-50/30">
        <CardContent className="py-12 text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h3 className="font-bold text-slate-900 text-base">Prüfung & Export noch nicht bereit</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Bitte laden Sie zuerst Ihre Dokumente hoch und führen Sie die Steuerberechnung durch, bevor Sie die Schlussprüfung abschliessen.
          </p>
          {onNavigateTab && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab('calculation')}
              className="text-xs mt-2"
            >
              Zur Steuerberechnung
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
            <div className="h-10 w-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold flex-shrink-0 shadow-xs">
              <CheckCircle className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-emerald-950">Steuererklärung erfolgreich finalisiert!</h4>
              <p className="text-xs text-emerald-800">
                Bestätigt am {taxReturn.confirmed_at ? formatDate(taxReturn.confirmed_at) : 'kürzlich'} gemäss Art. 110 DBG.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={exporting === 'pdf'}
              className="text-xs bg-red-600 hover:bg-red-700 text-white font-bold shadow-xs flex items-center gap-1.5"
            >
              <Download className="h-4 w-4" />
              Amtliches PDF für Postversand
            </Button>
          </div>
        </div>
      )}

      {/* Overview Cards (Part B6) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Personal & Filing Overview */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <CardTitle className="text-sm font-bold text-slate-900">
              Steuerpflichtige Person & Veranlagung
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 text-xs text-slate-700">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Name & Vorname</span>
              <strong className="text-slate-900">{fullName || 'Unvollständig'}</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Wohnadresse</span>
              <span className="text-slate-900 font-medium">{fullAddress || 'Gemäss Lohnausweis'}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Zivilstand</span>
              <span className="text-slate-900 font-medium">{civilStatus}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Kanton & Steuerjahr</span>
              <strong className="text-slate-900">
                Kanton {taxReturn.canton_code} • Steuerjahr {taxReturn.tax_year}
              </strong>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Wohngemeinde</span>
              <span className="text-slate-900 font-medium">{taxReturn.municipality_name || taxReturn.municipality_code}</span>
            </div>
          </CardContent>
        </Card>

        {/* Calculation Summary with « ca. CHF … » */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="pb-3 border-b bg-slate-50/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold text-slate-900">
                Steuerberechnung (Schätzung)
              </CardTitle>
              <Badge variant="outline" className="text-[10px] text-red-600 border-red-200">
                Unverbindliche Schätzung
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 text-xs text-slate-700">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Steuerbares Einkommen (Kanton)</span>
              <strong className="text-slate-900">{fmtChf(r.canton_taxable_income ?? r.taxable_income)}</strong>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Direkte Bundessteuer</span>
              <span className="font-mono text-slate-900">{fmtChf(r.federal_income_tax)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Kantonssteuer (Staatssteuer)</span>
              <span className="font-mono text-slate-900">{fmtChf(r.cantonal_income_tax)}</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Gemeindesteuer ({taxReturn.municipality_name})</span>
              <span className="font-mono text-slate-900">{fmtChf(r.municipal_income_tax)}</span>
            </div>
            {Number(r.church_tax || 0) > 0 && (
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Kirchensteuer</span>
                <span className="font-mono text-slate-900">{fmtChf(r.church_tax)}</span>
              </div>
            )}
            <div className="flex justify-between py-2.5 text-sm font-extrabold text-red-700 border-t border-slate-200">
              <span>Geschätzter Steuerbetrag Total</span>
              <span className="font-mono">{fmtChf(r.total_tax)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filing Instructions Card (Paper Filing - Part B6) */}
      <Card className="border-slate-200 shadow-sm">
        <CardHeader className="pb-3 border-b bg-slate-50/50">
          <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
            <Printer className="h-4 w-4 text-red-600" />
            <span>Filing per Postversand (Offizielles Schweizer Verfahren)</span>
          </CardTitle>
          <CardDescription className="text-xs text-slate-500">
            Das elektronische Filing für Drittanbieter wird im Kanton Zürich aktuell schrittweise eingeführt. Die amtliche Einreichung erfolgt via ausgedrucktem, unterschriebenem Dossier.
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">1. PDF herunterladen</span>
              <p className="text-[11px] text-slate-500">
                Laden Sie die fertig aufbereitete Steuererklärung mit allen Ziffern herunter.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">2. Unterschreiben</span>
              <p className="text-[11px] text-slate-500">
                Drucken Sie das Dokument aus und unterzeichnen Sie es auf der Schlussseite.
              </p>
            </div>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
              <span className="font-bold text-slate-900 block">3. Per Post absenden</span>
              <p className="text-[11px] text-slate-500">
                Zusammen mit dem Original-Lohnausweis an das Steueramt {taxReturn.municipality_name} senden.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={Boolean(exporting)}
              className="text-xs h-9 font-bold border-red-300 text-red-700 hover:bg-red-50 flex items-center gap-1.5"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Amtliche Steuererklärung als PDF herunterladen
            </Button>

            <Button
              variant="outline"
              onClick={() => handleExport('xml')}
              disabled={Boolean(exporting)}
              className="text-xs h-9 font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
            >
              {exporting === 'xml' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              eCH-0119/eCH-0276 Steuerdaten XML
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation & Payment Action Box */}
      {!isAlreadyConfirmed && (
        <Card className="border-red-200 shadow-sm bg-gradient-to-b from-white to-red-50/20">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2 text-slate-900">
                <ShieldCheck className="h-4 w-4 text-red-600" />
                <span>Steuererklärung freischalten & finalisieren</span>
              </CardTitle>
              <Badge className={isPaid ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}>
                {isPaid ? 'CHF 39.00 bezahlt' : 'Pauschale: CHF 39.00'}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="pt-4 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-950 leading-relaxed flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <strong>Hinweis zur rechtlichen Verbindlichkeit:</strong> Nach der Bestätigung wird das Dossier
                gesperrt und mit einem rechtssicheren Zeitstempel versehen. Nachträgliche Korrekturen können nur durch
                einen Administrator freigeschaltet werden.
              </div>
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={!canConfirm}
                className="mt-1 w-4 h-4 rounded border-slate-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-xs text-slate-700 leading-relaxed">{CONFIRMATION_TEXT}</span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              {!isPaid ? (
                <Button
                  onClick={() => setShowPaymentModal(true)}
                  disabled={!confirmed || !canConfirm}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold text-xs h-11 shadow-md shadow-red-600/20 flex items-center justify-center gap-2"
                >
                  <CreditCard className="h-4 w-4" />
                  Zur Bezahlung (CHF 39.00 via TWINT / Karte)
                </Button>
              ) : (
                <Button
                  onClick={() => setShowConfirmDialog(true)}
                  disabled={!confirmed || !canConfirm || submitting}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-11 shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Steuererklärung verbindlich abschliessen
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
                <div className="h-8 w-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold">
                  <CreditCard className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-900 text-base">Einmalige Pauschale</h3>
                  <p className="text-[11px] text-slate-500">SunTax Flatrate: CHF 39.00 inkl. MwSt.</p>
                </div>
              </div>
              <span className="text-xl font-black text-slate-900 font-mono">CHF 39.00</span>
            </div>

            {/* Payment Method Selector */}
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPaymentMethod('twint')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  selectedPaymentMethod === 'twint'
                    ? 'border-emerald-600 bg-emerald-50 text-emerald-950 font-bold ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">TWINT</span>
                  <QrCode className="h-4 w-4 text-emerald-600" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 font-normal">Schweizer Standard</p>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPaymentMethod('credit_card')}
                className={`p-3.5 rounded-xl border text-left transition-all ${
                  selectedPaymentMethod === 'credit_card'
                    ? 'border-red-600 bg-red-50 text-red-950 font-bold ring-2 ring-red-500/20'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">Kreditkarte</span>
                  <CreditCard className="h-4 w-4 text-red-600" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 font-normal">Mastercard / Visa</p>
              </button>
            </div>

            {/* TWINT Details / Simulator */}
            {selectedPaymentMethod === 'twint' ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-center space-y-3">
                <div className="h-28 w-28 bg-white border-2 border-slate-800 rounded-lg mx-auto flex items-center justify-center shadow-xs">
                  <QrCode className="h-20 w-20 text-slate-800" />
                </div>
                <p className="text-xs text-slate-600">
                  Öffnen Sie Ihre <strong>TWINT App</strong> und bestätigen Sie die Zahlung von <strong>CHF 39.00</strong>.
                </p>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Empfänger:</span>
                  <strong className="text-slate-900">SunTax Switzerland AG</strong>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Betrag:</span>
                  <strong className="text-slate-900">CHF 39.00</strong>
                </div>
                <p className="text-[11px] text-slate-500 pt-2 border-t">
                  Sichere Zahlungsabwicklung via PCI-DSS konformem Schweizer Payment Gateway.
                </p>
              </div>
            )}

            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-[11px] text-blue-900 flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <span>
                <strong>Sicherheits-Garantie:</strong> SunTax verwaltet zu keinem Zeitpunkt Kundengelder. Die Abrechnung erfolgt direkt über zertifizierte Schweizer Zahlungsprovider.
              </span>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setShowPaymentModal(false)}
                disabled={paymentProcessing}
              >
                Abbrechen
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold text-xs"
                onClick={handlePayment}
                disabled={paymentProcessing}
              >
                {paymentProcessing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Wird verarbeitet...
                  </>
                ) : (
                  `Jetzt CHF 39.00 ${selectedPaymentMethod === 'twint' ? 'mit TWINT' : 'mit Karte'} zahlen`
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRM DIALOG MODAL (Art. 110 DBG) ── */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-base">
              <ShieldCheck className="h-5 w-5 text-red-600" />
              <h3>Steuererklärung definitiv finalisieren?</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Möchten Sie diese Steuererklärung verbindlich abschliessen? Nach der Bestätigung werden die Berechnungen
              gemäss Art. 110 DBG unwiderruflich verankert und für den Postversand freigegeben.
            </p>

            {currentUser?.totp_enabled && (
              <div className="space-y-3 pt-1">
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-900 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5 text-red-800">
                    <Lock className="h-3.5 w-3.5 text-red-600" />
                    <span>Zwei-Faktor-Autorisierung erforderlich</span>
                  </div>
                  <p className="text-[11px] text-red-700 leading-snug">
                    Geben Sie den 6-stelligen Code aus Ihrer Authenticator App ein, um diese rechtsgültige Deklaration zu signieren.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="confirm2fa" className="text-xs font-semibold text-slate-700 block">
                    6-stelliger Sicherheitscode
                  </label>
                  <Input
                    id="confirm2fa"
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={twoFactorCode}
                    onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                    className="text-center tracking-widest font-mono text-lg h-11 border-slate-300 focus:border-red-500 focus:ring-red-500"
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => {
                  setShowConfirmDialog(false);
                  setTwoFactorCode('');
                }}
                disabled={submitting}
              >
                Abbrechen
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold"
                onClick={handleConfirm}
                disabled={submitting || (Boolean(currentUser?.totp_enabled) && twoFactorCode.trim().length !== 6)}
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                {currentUser?.totp_enabled ? 'Autorisieren & Finalisieren' : 'Ja, definitiv bestätigen'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
