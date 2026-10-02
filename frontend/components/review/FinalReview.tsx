'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { TaxReturn, TaxProfile } from '@/types';
import { formatCurrency, formatDate } from '@/lib/utils';

interface Props {
  taxReturn: TaxReturn;
  profile: TaxProfile | null;
  calculation: any;
  onConfirm?: () => void;
  onNavigateTab?: (tab: string) => void;
}

const CONFIRMATION_TEXT =
  'I have reviewed my tax return and confirm that all information provided is complete and accurate. I accept full responsibility for the information submitted.';

export function FinalReview({
  taxReturn,
  profile,
  calculation,
  onConfirm,
  onNavigateTab,
}: Props) {
  const { toast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'xml' | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const isReady = Boolean(profile && calculation);
  const isAlreadyConfirmed = taxReturn.status === 'confirmed';

  const pd = (profile?.personal_data || {}) as Record<string, any>;
  const r = calculation?.results || {};

  const fullName =
    pd.name ||
    [pd.first_name, pd.last_name].filter(Boolean).join(' ') ||
    '';
  const fullAddress =
    pd.address ||
    [pd.address_street, pd.address_zip, pd.address_city].filter(Boolean).join(', ') ||
    '';
  const civilStatus = pd.civil_status || pd.marital_status || 'Single';

  // Check required data completeness
  const missingItems: string[] = [];
  if (!fullName || fullName.trim() === '') {
    missingItems.push('Taxpayer full name (in Personal Details)');
  }
  if (!taxReturn.canton_code) {
    missingItems.push('Canton code');
  }

  // Check smart questions completion
  const questions = (profile?.tax_questions || profile?.questions || []) as any[];
  const unansweredRequiredQs = questions.filter(
    (q) => q.is_required && !q.is_answered && !q.answer,
  );
  if (unansweredRequiredQs.length > 0) {
    missingItems.push(
      `${unansweredRequiredQs.length} mandatory clarification question(s) pending answer`,
    );
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
        let detail = 'Export failed.';
        try {
          const parsed = JSON.parse(text);
          if (parsed.detail) detail = parsed.detail;
        } catch {}
        toast({ title: 'Export failed', description: detail, variant: 'destructive' });
        return;
      }

      const ext = type === 'pdf' ? 'pdf' : 'xml';
      const mime = type === 'pdf' ? 'application/pdf' : 'application/xml';
      const url = URL.createObjectURL(new Blob([blob], { type: mime }));
      const a = document.createElement('a');
      a.href = url;
      a.download =
        type === 'pdf'
          ? `SunTax_${taxReturn.canton_code}_${taxReturn.tax_year}_Summary.pdf`
          : `SunTax_${taxReturn.canton_code}_${taxReturn.tax_year}_Draft_Data.xml`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({
        title: 'Export failed',
        description: err?.message || 'Please ensure tax calculation has been completed.',
        variant: 'destructive',
      });
    } finally {
      setExporting(null);
    }
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;

    setSubmitting(true);
    try {
      await api.taxEngine.confirm(taxReturn.id, CONFIRMATION_TEXT);
      toast({
        title: 'Tax return draft confirmed',
        description: 'Your tax return draft has been finalized.',
      });
      setShowConfirmDialog(false);
      onConfirm?.();
    } catch (error: any) {
      toast({
        title: 'Confirmation failed',
        description: error?.response?.data?.detail || 'Please complete all required items before confirming.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isReady) {
    return (
      <Card className="border-amber-200 bg-amber-50/20">
        <CardContent className="py-12 text-center space-y-3">
          <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
          <h3 className="font-bold text-gray-900 text-base">Review & Export Not Ready</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Please upload your documents and calculate the tax estimation first before completing the final review.
          </p>
          {onNavigateTab && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateTab('calculation')}
              className="text-xs mt-2"
            >
              Go to Calculation
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
        <div className="p-4 rounded-xl border border-green-200 bg-green-50/50 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
            <div>
              <h4 className="text-sm font-bold text-green-900">Tax Return Draft Confirmed</h4>
              <p className="text-xs text-green-700">
                Finalized on {taxReturn.confirmed_at ? formatDate(taxReturn.confirmed_at) : 'recently'}. You can download the completed filing documents below.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={exporting === 'pdf'}
              className="text-xs bg-white"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Tax Return Summary PDF
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleExport('xml')}
              disabled={exporting === 'xml'}
              className="text-xs bg-white"
            >
              <FileText className="h-3.5 w-3.5 mr-1.5" />
              Draft Structured Tax Data XML
            </Button>
          </div>
        </div>
      )}

      {/* Completion & Verification Status Card */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-bold flex items-center justify-between">
            <span>Filing Verification & Readiness</span>
            <span className="text-xs font-semibold text-gray-500">
              Profile Completeness: <strong className="text-gray-900">{Math.round(completionPct)}%</strong>
            </span>
          </CardTitle>
          <Progress value={completionPct} className="h-2 mt-2" />
        </CardHeader>
        <CardContent className="pt-3">
          {missingItems.length > 0 ? (
            <div className="p-3 rounded-lg border border-amber-200 bg-amber-50/60 text-xs text-amber-900 space-y-1.5">
              <div className="flex items-center gap-2 font-semibold">
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
                <span>Required Items Missing Before Confirmation:</span>
              </div>
              <ul className="list-disc list-inside ml-5 space-y-0.5 text-amber-800">
                {missingItems.map((item, idx) => (
                  <li key={idx}>{item}</li>
                ))}
              </ul>
              <p className="text-[11px] text-amber-700 mt-1">
                Confirmation is temporarily blocked until mandatory details are filled.
              </p>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-green-200 bg-green-50/60 text-xs text-green-900 flex items-center gap-2">
              <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span>All mandatory profile details and clarification questions are complete.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary of Data & Calculation */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Personal & Filing Overview */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold">Taxpayer & Declaration Details</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-2.5 text-xs text-gray-700">
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Full Name</span>
              <strong className="text-gray-900">{fullName || 'Incomplete'}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Address</span>
              <span className="text-gray-900 font-medium">{fullAddress || 'Incomplete'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Marital Status</span>
              <span className="text-gray-900 font-medium">{civilStatus}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Canton & Year</span>
              <strong className="text-gray-900">
                Canton {taxReturn.canton_code} • Tax Year {taxReturn.tax_year}
              </strong>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-gray-500">Municipality (Gemeinde)</span>
              <span className="text-gray-900 font-medium">{taxReturn.municipality_name || taxReturn.municipality_code}</span>
            </div>
          </CardContent>
        </Card>

        {/* Calculation Summary */}
        <Card className="border-gray-200 shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold">Estimated Tax Calculation Summary</CardTitle>
          </CardHeader>
          <CardContent className="pt-3 space-y-2 text-xs text-gray-700">
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Taxable Income</span>
              <strong className="text-gray-900">{formatCurrency(r.taxable_income || 0)}</strong>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Direct Federal Tax (Bund)</span>
              <span>{formatCurrency(r.federal_income_tax || 0)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Cantonal Income Tax (Kanton)</span>
              <span>{formatCurrency(r.cantonal_income_tax || 0)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Municipal Income Tax (Gemeinde)</span>
              <span>{formatCurrency(r.municipal_income_tax || 0)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-100">
              <span className="text-gray-500">Wealth Tax (Vermögenssteuer)</span>
              <span>{formatCurrency(r.wealth_tax || 0)}</span>
            </div>
            <div className="flex justify-between py-2 text-sm font-bold text-red-700 border-t border-gray-200">
              <span>Total Estimated Tax</span>
              <span>{formatCurrency(r.total_tax || 0)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Export & Cantonal Filing Instructions */}
      <Card className="border-gray-200 shadow-sm">
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-sm font-bold">Filing Package & Cantonal Guidance</CardTitle>
          <CardDescription className="text-xs">
            Download your completed tax return package or follow canton-specific declaration procedures.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 space-y-4 text-xs">
          {/* Informational Canton Guidance */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-blue-950 space-y-1.5">
            <div className="flex items-center gap-1.5 font-semibold text-blue-900">
              <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
              <span>Informational Filing Instructions for Canton {taxReturn.canton_code}:</span>
            </div>
            {taxReturn.canton_code === 'AI' ? (
              <p className="text-blue-900 leading-relaxed">
                In Canton Appenzell Innerrhoden (AI), official electronic filing is submitted through{' '}
                <a
                  href="https://ai.ch/themen/steuern/etax"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold text-blue-700"
                >
                  eTax.AI
                </a>{' '}
                using your declaration PID and access code, or by mailing the signed Tax Return Summary PDF with your original Lohnausweis.
              </p>
            ) : taxReturn.canton_code === 'ZH' ? (
              <p className="text-blue-900 leading-relaxed">
                In Canton Zurich (ZH), submit your return online via the ZHservices / eTax.zh portal or print and mail the signed Tax Return Summary PDF to your local municipal tax administration ({taxReturn.municipality_name}).
              </p>
            ) : taxReturn.canton_code === 'BE' ? (
              <p className="text-blue-900 leading-relaxed">
                In Canton Bern (BE), tax declaration can be completed online via TaxMe-Online (BE-Login), or by printing and submitting the signed Tax Return Summary PDF alongside your original salary slip.
              </p>
            ) : (
              <p className="text-blue-900 leading-relaxed">
                Submit your official tax return via your canton&apos;s designated tax portal, or print and mail the signed Tax Return Summary PDF with your original salary certificate (Lohnausweis) and bank statements to your communal tax office.
              </p>
            )}
            <p className="text-[11px] text-blue-800 italic pt-1">
              Note: SunTax provides draft structured data and calculation summaries; direct automated transmission to cantonal tax servers is not performed.
            </p>
          </div>

          {/* Download Action Buttons */}
          <div className="flex flex-wrap gap-3 pt-1">
            <Button
              variant="outline"
              onClick={() => handleExport('pdf')}
              disabled={Boolean(exporting)}
              className="text-xs h-9 font-semibold border-red-300 text-red-700 hover:bg-red-50 flex items-center gap-1.5"
            >
              {exporting === 'pdf' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
              Download Tax Return Summary PDF
            </Button>

            <Button
              variant="outline"
              onClick={() => handleExport('xml')}
              disabled={Boolean(exporting)}
              className="text-xs h-9 font-semibold text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
            >
              {exporting === 'xml' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              Download Draft Structured Tax Data XML
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Confirmation & Finalization */}
      {!isAlreadyConfirmed && (
        <Card className="border-red-200 shadow-sm">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-red-600" />
              <span>Confirm Tax Return Draft</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900 leading-relaxed">
              <AlertTriangle className="h-4 w-4 inline mr-1.5 text-amber-600" />
              By confirming, you acknowledge that you have reviewed the calculated tax deductions, income items, and wealth balances. Once confirmed, this draft will be locked from further edits.
            </div>

            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                disabled={!canConfirm}
                className="mt-0.5 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-xs text-gray-700 leading-snug">{CONFIRMATION_TEXT}</span>
            </label>

            <Button
              onClick={() => setShowConfirmDialog(true)}
              disabled={!confirmed || !canConfirm || submitting}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold text-xs h-10 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {canConfirm ? (
                <>
                  <CheckCircle className="h-4 w-4" />
                  Confirm Tax Return Draft
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4" />
                  Complete Required Items to Confirm Draft
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Confirm Dialog Modal */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-gray-900">Confirm Tax Return Draft?</h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to finalize this tax return draft? Once confirmed, the data is marked final and calculations are locked.
            </p>
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 text-xs"
                onClick={() => setShowConfirmDialog(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Yes, Confirm Draft
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
