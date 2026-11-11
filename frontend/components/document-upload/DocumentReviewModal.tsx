'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { Document as TaxDocument, DOCUMENT_CATEGORIES } from '@/types';
import {
  Check,
  X,
  RotateCcw,
  Sparkles,
  ExternalLink,
  Loader2,
  FileCheck2,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n/LanguageContext';

interface Props {
  document: TaxDocument | null;
  isOpen: boolean;
  onClose: () => void;
  onApplySuccess?: () => void;
}

interface LocalFieldReview {
  fieldName: string;
  label: string;
  originalValue: any;
  currentValue: any;
  confidence: number | null;
  status: 'needs_review' | 'approved' | 'rejected' | 'edited';
}

const HUMAN_FIELD_LABELS_DE: Record<string, string> = {
  employer_name: 'Arbeitgeber / Firma',
  gross_salary: 'Bruttolohn (Ziffer 8)',
  net_salary: 'Nettolohn (Ziffer 11)',
  social_deductions: 'AHV/IV/EO/ALV-Beiträge (Ziffer 9)',
  pension_deductions: 'Berufliche Vorsorge / BVG (Ziffer 10)',
  withholding_tax: 'Quellensteuerabzug',
  bank_name: 'Bank / Finanzinstitut',
  iban: 'IBAN / Kontonummer',
  balance: 'Steuerwert / Kontostand per 31.12.',
  interest_earned: 'Bruttozinsertrag',
  provider_name: 'Vorsorgestiftung / Bank (Säule 3a)',
  contribution_amount: 'Einzahlungsbetrag Säule 3a',
  lender_name: 'Hypothekargläubiger / Bank',
  mortgage_balance: 'Hypothekarschuld per 31.12.',
  interest_paid: 'Schuldzinsen',
  organisation_name: 'Gemeinnützige Organisation',
  amount: 'Spendenbetrag',
  insurer_name: 'Krankenkasse / Versicherung',
  premium_amount: 'Krankenkassenprämie / Beiträge',
  policy_type: 'Versicherungsart',
  security_name: 'Wertschrift / Titel',
  isin: 'Valorennummer / ISIN',
  quantity: 'Stückzahl / Nominalwert',
  total_value: 'Steuerwert per 31.12.',
  dividends_received: 'Bruttoertrag / Dividenden',
};

const HUMAN_FIELD_LABELS_EN: Record<string, string> = {
  employer_name: 'Employer / Company Name',
  gross_salary: 'Gross Salary (Box 8)',
  net_salary: 'Net Salary (Box 11)',
  social_deductions: 'OASI / DI / EO / UI contributions (Box 9)',
  pension_deductions: 'Occupational Pension / BVG (Box 10)',
  withholding_tax: 'Withholding Tax Deducted',
  bank_name: 'Bank / Financial Institution',
  iban: 'IBAN / Account Number',
  balance: 'Tax Value / Balance as of Dec 31st',
  interest_earned: 'Gross Interest Income',
  provider_name: 'Pension Foundation / Bank (Pillar 3a)',
  contribution_amount: 'Pillar 3a Annual Contribution',
  lender_name: 'Mortgage Lender / Bank',
  mortgage_balance: 'Mortgage Balance as of Dec 31st',
  interest_paid: 'Debt Interest Paid',
  organisation_name: 'Charitable Organisation',
  amount: 'Donation Amount',
  insurer_name: 'Health Insurer / Carrier',
  premium_amount: 'Insurance Premiums Paid',
  policy_type: 'Policy Type',
  security_name: 'Security / Stock Name',
  isin: 'Valor Number / ISIN',
  quantity: 'Quantity / Nominal Value',
  total_value: 'Taxable Value as of Dec 31st',
  dividends_received: 'Gross Dividends / Income',
};

const CATEGORY_NAMES_DE: Record<string, string> = {
  salary_certificate: 'Lohnausweis',
  bank_statement: 'Bankauszug / Kontoauszug',
  securities_statement: 'Wertschriftenverzeichnis',
  pillar3a: 'Säule 3a Bescheinigung',
  insurance: 'Versicherungspolice',
  mortgage: 'Hypothekarschuldzinsen',
  donation: 'Spendenbescheinigung',
  donation_receipt: 'Spendenbescheinigung',
  charitable_donation: 'Spendenbescheinigung',
  medical: 'Krankheits- & Zahnarztkosten',
  medical_expense: 'Krankheits- & Zahnarztkosten',
  commuting: 'Berufsauslagen / Arbeitsweg',
  education: 'Weiterbildungskosten',
  childcare: 'Kinderbetreuungskosten',
  property: 'Liegenschaft / Immobilien',
  self_employment: 'Selbstständige Erwerbstätigkeit',
  foreign_income: 'Ausländische Einkünfte',
  previous_tax_return: 'Vorjahres-Steuererklärung',
  tax_assessment: 'Veranlagungsverfügung',
  other: 'Sonstige Belege',
};

const CATEGORY_NAMES_EN: Record<string, string> = {
  salary_certificate: 'Salary Certificate',
  bank_statement: 'Bank Statement',
  securities_statement: 'Securities Statement',
  pillar3a: 'Pillar 3a Certificate',
  insurance: 'Insurance Policy',
  mortgage: 'Mortgage Statement',
  donation: 'Donation Receipt',
  donation_receipt: 'Donation Receipt',
  charitable_donation: 'Donation Receipt',
  medical: 'Medical Expenses',
  medical_expense: 'Medical Expenses',
  commuting: 'Commuting / Travel',
  education: 'Continuing Education',
  childcare: 'Childcare Costs',
  property: 'Real Estate / Property',
  self_employment: 'Self-Employment',
  foreign_income: 'Foreign Income',
  previous_tax_return: 'Previous Tax Return',
  tax_assessment: 'Tax Assessment',
  other: 'Other Document',
};

export function DocumentReviewModal({
  document: doc,
  isOpen,
  onClose,
  onApplySuccess,
}: Props) {
  const { toast } = useToast();
  const { isGerman } = useTranslation();
  const [fields, setFields] = useState<LocalFieldReview[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('other');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  const labels = isGerman ? HUMAN_FIELD_LABELS_DE : HUMAN_FIELD_LABELS_EN;

  useEffect(() => {
    if (!doc || !isOpen) return;

    setSelectedCategory(doc.document_type || 'other');

    const extData = doc.extracted_data || {};
    const extConf = doc.extraction_confidence || {};
    const reviews = (extData._reviews as Record<string, any>) || {};
    const nestedFields = (extData._fields as Record<string, any>) || {};

    const localList: LocalFieldReview[] = [];

    // Keys to ignore from review table: internal keys, OCR text buffers, metadata
    const ignored = new Set([
      '_reviews',
      '_applied_to_profile',
      '_applied_at',
      '_metadata',
      '_fields',
      'raw_text',
      'text',
      'ocr_text',
      'file_url',
      'url',
    ]);

    for (const [key, val] of Object.entries(extData)) {
      // Exclude internal underscore keys and ignored metadata
      if (key.startsWith('_') || ignored.has(key)) continue;

      // Exclude nested objects or arrays that cannot be edited as scalar table values
      if (val !== null && typeof val === 'object') continue;

      const reviewInfo = reviews[key] || {};
      const status: 'needs_review' | 'approved' | 'rejected' | 'edited' =
        reviewInfo.status || 'needs_review';

      // Use actual OCR confidence if present; do not fabricate fake percentages
      let confVal: number | null = null;
      if (typeof extConf[key] === 'number') {
        confVal = Math.round(extConf[key] * 100);
      } else if (typeof nestedFields[key]?.confidence === 'number') {
        confVal = Math.round(nestedFields[key].confidence * 100);
      }

      localList.push({
        fieldName: key,
        label: labels[key] || key.replace(/_/g, ' '),
        originalValue: reviewInfo.original_value !== undefined ? reviewInfo.original_value : val,
        currentValue: val,
        confidence: confVal,
        status,
      });
    }

    setFields(localList);

    // Fetch viewable preview URL
    if (doc.id) {
      setLoadingPreview(true);
      api.documents
        .getDownloadUrl(doc.id)
        .then((res) => setPreviewUrl(res.url))
        .catch(() => setPreviewUrl(null))
        .finally(() => setLoadingPreview(false));
    }
  }, [doc, isOpen, isGerman]);

  if (!doc) return null;

  const handleStatusChange = (fieldName: string, status: 'approved' | 'rejected') => {
    setFields((prev) =>
      prev.map((f) => (f.fieldName === fieldName ? { ...f, status } : f)),
    );
  };

  const handleFieldValueChange = (fieldName: string, newValue: string) => {
    setFields((prev) =>
      prev.map((f) => {
        if (f.fieldName !== fieldName) return f;
        const isModified = String(newValue) !== String(f.originalValue);
        return {
          ...f,
          currentValue: newValue,
          status: isModified ? 'edited' : 'needs_review',
        };
      }),
    );
  };

  const handleResetField = (fieldName: string) => {
    setFields((prev) =>
      prev.map((f) =>
        f.fieldName === fieldName
          ? {
              ...f,
              currentValue: f.originalValue,
              status: 'needs_review',
            }
          : f,
      ),
    );
  };

  const handleApproveAll = () => {
    setFields((prev) =>
      prev.map((f) => ({
        ...f,
        status: f.status === 'rejected' ? 'rejected' : 'approved',
      })),
    );
  };

  const saveReviews = async (andApply: boolean = false) => {
    if (!doc) return;
    setIsSaving(true);

    try {
      const fieldsPayload: Record<string, any> = {};
      const statusesPayload: Record<string, string> = {};

      for (const f of fields) {
        fieldsPayload[f.fieldName] = f.currentValue;
        statusesPayload[f.fieldName] = f.status;
      }

      await api.documents.review(doc.id, {
        document_type: selectedCategory,
        fields: fieldsPayload,
        field_statuses: statusesPayload,
        apply_to_profile: andApply,
      });

      if (andApply) {
        try {
          await api.documents.apply(doc.id);
        } catch {}
      }

      toast({
        title: isGerman ? 'Prüfung gespeichert' : 'Review saved',
        description: andApply
          ? (isGerman ? 'Bestätigte Werte wurden in dein Steuerprofil übernommen.' : 'Approved fields have been merged into your tax profile.')
          : (isGerman ? 'Ausgelesene Felder wurden erfolgreich aktualisiert.' : 'Extracted fields updated successfully.'),
      });

      if (andApply) {
        onApplySuccess?.();
      }
      onClose();
    } catch (err: any) {
      toast({
        title: isGerman ? 'Speichern fehlgeschlagen' : 'Save failed',
        description: err?.response?.data?.detail || (isGerman ? 'Konnte Felder nicht aktualisieren.' : 'Could not update document fields.'),
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleApplyToProfile = async () => {
    if (!doc) return;
    setIsApplying(true);
    try {
      await saveReviews(true);
    } finally {
      setIsApplying(false);
    }
  };

  const handleRetryOcr = async () => {
    if (!doc) return;
    setIsRetrying(true);
    try {
      await api.documents.retry(doc.id);
      toast({
        title: isGerman ? 'OCR-Wiederholung gestartet' : 'OCR Retry Started',
        description: isGerman ? 'Das Dokument wird erneut mit optischer Erkennung eingelesen.' : 'The document has been re-queued for optical recognition and extraction.',
      });
      onClose();
    } catch (err: any) {
      toast({
        title: isGerman ? 'Wiederholung fehlgeschlagen' : 'Retry failed',
        description: err?.response?.data?.detail || (isGerman ? 'Konnte OCR nicht erneut starten.' : 'Unable to retry OCR at this time.'),
        variant: 'destructive',
      });
    } finally {
      setIsRetrying(false);
    }
  };

  const isPdf = doc.mime_type === 'application/pdf' || doc.original_filename.toLowerCase().endsWith('.pdf');
  const isImage = doc.mime_type.startsWith('image/') || /\.(jpe?g|png|webp|tiff?|heic|heif)$/i.test(doc.original_filename);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden rounded-2xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-lg font-bold flex items-center gap-2 text-slate-900">
                <span>{isGerman ? 'Dokumentenprüfung & Auslesedaten' : 'OCR Field Review'}</span>
                <span className="text-xs font-normal text-slate-500 truncate max-w-sm">
                  ({doc.original_filename})
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-500 mt-1">
                {isGerman
                  ? 'Überprüfe die von der KI ausgelesenen Werte, passe Beträge bei Bedarf an und übernimm sie in deine Steuererklärung.'
                  : 'Inspect AI-extracted data points, adjust amounts if necessary, and approve fields before merging into your tax profile.'}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {previewUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreviewModal(!showPreviewModal)}
                  className="text-xs flex items-center gap-1 rounded-xl"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showPreviewModal
                    ? (isGerman ? 'Dokument schliessen' : 'Hide Document')
                    : (isGerman ? 'Beleg ansehen' : 'View Document')}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryOcr}
                disabled={isRetrying}
                className="text-xs flex items-center gap-1 rounded-xl"
              >
                {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                {isGerman ? 'Neu einlesen' : 'Retry OCR'}
              </Button>
            </div>
          </div>

          {/* Classification & Confidence Banner */}
          <div className="mt-3 flex items-center justify-between p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 text-xs">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#1E7B52]" />
              <span className="text-slate-700 font-semibold">
                {isGerman ? 'Erkannter Typ:' : 'Detected Category:'}
              </span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs font-bold rounded-lg border border-slate-300 px-2.5 py-1 bg-white focus:outline-none focus:border-[#1E7B52]"
              >
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {(isGerman ? CATEGORY_NAMES_DE[cat.value] : CATEGORY_NAMES_EN[cat.value]) || cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-500">
                {isGerman ? 'Genauigkeit:' : 'Confidence:'}{' '}
                {typeof doc.classification_confidence === 'number' ? (
                  <strong className="text-slate-900">{Math.round(doc.classification_confidence * 100)}%</strong>
                ) : (
                  <span className="text-slate-400 font-medium">—</span>
                )}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleApproveAll}
                className="text-xs h-7 text-[#1E7B52] hover:text-[#165C3D] hover:bg-emerald-50 font-bold"
              >
                {isGerman ? 'Alle Felder bestätigen' : 'Approve All Fields'}
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Optional inline preview panel */}
          {showPreviewModal && previewUrl && (
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-100 p-2 max-h-72 flex justify-center">
              {isPdf ? (
                <iframe
                  src={`${previewUrl}#toolbar=0`}
                  className="w-full h-64 rounded-lg bg-white"
                  title="Document Preview"
                />
              ) : isImage ? (
                <img
                  src={previewUrl}
                  alt="Document Preview"
                  className="max-h-64 object-contain rounded-lg shadow-xs"
                />
              ) : (
                <div className="p-4 text-center text-xs text-slate-500">
                  {isGerman ? 'Vorschau nicht eingebettet verfügbar.' : 'Preview not available inline.'}{' '}
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[#1E7B52] underline font-bold"
                  >
                    {isGerman ? 'In neuem Tab öffnen' : 'Open in new tab'}
                  </a>
                </div>
              )}
            </div>
          )}

          {fields.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed border-slate-200 rounded-2xl bg-slate-50">
              <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-800">
                {isGerman ? 'Keine strukturierten Felder erkannt' : 'No Structured Fields Extracted'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                {isGerman
                  ? 'Das System hat Text erkannt, aber keine eindeutigen Beträge für diese Kategorie extrahieren können. Du kannst die Zahlen direkt in Schritt 4 manuell ergänzen.'
                  : 'The system detected text but found no high-confidence structured values for this category. You can manually enter values in Step 4.'}
              </p>
            </div>
          ) : (
            <div className="border border-[#ECE8DF] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase font-bold text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">{isGerman ? 'Feldname' : 'Field Name'}</th>
                    <th className="py-2.5 px-4 font-semibold">{isGerman ? 'Ausgelesener Wert' : 'Extracted Value'}</th>
                    <th className="py-2.5 px-3 font-semibold">{isGerman ? 'Genauigkeit' : 'Confidence'}</th>
                    <th className="py-2.5 px-3 font-semibold">{isGerman ? 'Status' : 'Status'}</th>
                    <th className="py-2.5 px-4 font-semibold text-right">{isGerman ? 'Aktionen' : 'Actions'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {fields.map((f) => {
                    const isEdited = f.status === 'edited';
                    const isApproved = f.status === 'approved';
                    const isRejected = f.status === 'rejected';

                    return (
                      <tr
                        key={f.fieldName}
                        className={`transition-colors ${
                          isRejected
                            ? 'bg-red-50/30 text-slate-400'
                            : isApproved
                            ? 'bg-emerald-50/20'
                            : 'hover:bg-slate-50/60'
                        }`}
                      >
                        <td className="py-3 px-4 font-semibold text-slate-800">
                          {f.label}
                          <div className="text-[10px] text-slate-400 font-mono">{f.fieldName}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Input
                            value={f.currentValue ?? ''}
                            onChange={(e) => handleFieldValueChange(f.fieldName, e.target.value)}
                            disabled={isRejected}
                            className={`h-8 text-xs font-semibold ${
                              isEdited ? 'border-amber-400 bg-amber-50/30' : ''
                            } ${isRejected ? 'line-through text-slate-400' : ''}`}
                          />
                        </td>
                        <td className="py-3 px-3">
                          {f.confidence !== null ? (
                            <span
                              className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                                f.confidence >= 85
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : f.confidence >= 70
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                              }`}
                            >
                              {f.confidence}%
                            </span>
                          ) : (
                            <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-slate-100 text-slate-500">
                              —
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {isApproved && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">
                              {isGerman ? 'Bestätigt' : 'Approved'}
                            </Badge>
                          )}
                          {isRejected && (
                            <Badge variant="outline" className="text-red-600 border-red-200 text-[10px]">
                              {isGerman ? 'Verworfen' : 'Rejected'}
                            </Badge>
                          )}
                          {isEdited && (
                            <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">
                              {isGerman ? 'Geändert' : 'Edited'}
                            </Badge>
                          )}
                          {f.status === 'needs_review' && (
                            <Badge variant="outline" className="text-slate-600 border-slate-200 text-[10px]">
                              {isGerman ? 'Zu prüfen' : 'Needs review'}
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleStatusChange(f.fieldName, 'approved')}
                              title={isGerman ? 'Feld bestätigen' : 'Approve field'}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isApproved
                                  ? 'bg-[#1E7B52] text-white'
                                  : 'text-slate-400 hover:text-[#1E7B52] hover:bg-emerald-50'
                              }`}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleStatusChange(f.fieldName, 'rejected')}
                              title={isGerman ? 'Feld verwerfen' : 'Reject field'}
                              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                                isRejected
                                  ? 'bg-red-600 text-white'
                                  : 'text-slate-400 hover:text-red-600 hover:bg-red-50'
                              }`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                            {(isEdited || isRejected) && (
                              <button
                                onClick={() => handleResetField(f.fieldName)}
                                title={isGerman ? 'Auf Originalwert zurücksetzen' : 'Reset to original'}
                                className="p-1.5 text-slate-400 hover:text-blue-600 rounded-lg hover:bg-blue-50 transition-colors cursor-pointer"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <DialogFooter className="border-t border-slate-200 pt-4 flex flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving || isApplying} className="text-xs">
            {isGerman ? 'Abbrechen' : 'Cancel'}
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveReviews(false)}
              disabled={isSaving || isApplying}
              className="text-xs rounded-xl"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              {isGerman ? 'Änderungen speichern' : 'Save changes'}
            </Button>
            <Button
              size="sm"
              onClick={handleApplyToProfile}
              disabled={isSaving || isApplying}
              className="bg-[#1E7B52] hover:bg-[#165C3D] text-white flex items-center gap-1.5 text-xs rounded-xl shadow-xs"
            >
              {isApplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="h-4 w-4" />
              )}
              {isGerman ? 'In Steuerprofil übernehmen' : 'Apply to tax profile'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
