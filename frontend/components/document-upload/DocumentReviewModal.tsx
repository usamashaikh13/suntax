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
  confidence: number;
  status: 'needs_review' | 'approved' | 'rejected' | 'edited';
}

const HUMAN_FIELD_LABELS: Record<string, string> = {
  employer_name: 'Employer Name',
  gross_salary: 'Gross Annual Salary (Box 8)',
  net_salary: 'Net Annual Salary (Box 11)',
  social_deductions: 'Social Security / AHV (Box 9)',
  pension_deductions: 'Pillar 2 / BVG Pension (Box 10)',
  withholding_tax: 'Withholding Tax (Quellensteuer)',
  bank_name: 'Bank / Financial Institution',
  iban: 'IBAN Account Number',
  balance: 'Account Balance (as of Dec 31)',
  interest_earned: 'Gross Interest Income',
  provider_name: 'Pillar 3a Foundation / Provider',
  contribution_amount: 'Pillar 3a Contribution Amount',
  lender_name: 'Mortgage Lender / Creditor',
  mortgage_balance: 'Mortgage Principal Debt',
  interest_paid: 'Mortgage Interest Paid',
  organisation_name: 'Charitable Organisation',
  amount: 'Donation Amount',
  insurer_name: 'Health / Life Insurer',
  premium_amount: 'Annual Insurance Premium',
  policy_type: 'Insurance Policy Type',
  security_name: 'Security / Asset Name',
  isin: 'ISIN / Security Number',
  quantity: 'Units / Shares Quantity',
  total_value: 'Taxable Market Value (Steuerwert)',
  dividends_received: 'Gross Dividends / Income',
};

export function DocumentReviewModal({
  document: doc,
  isOpen,
  onClose,
  onApplySuccess,
}: Props) {
  const { toast } = useToast();
  const [fields, setFields] = useState<LocalFieldReview[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('other');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  useEffect(() => {
    if (!doc || !isOpen) return;

    setSelectedCategory(doc.document_type || 'other');

    const extData = doc.extracted_data || {};
    const extConf = doc.extraction_confidence || {};
    const reviews = (extData._reviews as Record<string, any>) || {};

    const localList: LocalFieldReview[] = [];

    // Filter out internal keys starting with underscore
    const keys = Object.keys(extData).filter((k) => !k.startsWith('_'));

    keys.forEach((key) => {
      const origVal = extData[key];
      const rev = reviews[key] || {};
      const status = rev.status || 'needs_review';
      const curVal = rev.value !== undefined ? rev.value : origVal;
      const conf = typeof extConf[key] === 'number' ? extConf[key] : (doc.classification_confidence ?? 0.85);

      localList.push({
        fieldName: key,
        label: HUMAN_FIELD_LABELS[key] || key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        originalValue: origVal,
        currentValue: curVal,
        confidence: Math.round(conf * 100),
        status,
      });
    });

    setFields(localList);

    // Fetch presigned preview/download URL
    setLoadingPreview(true);
    api.documents
      .getDownloadUrl(doc.id)
      .then((res) => setPreviewUrl(res.url))
      .catch(() => setPreviewUrl(null))
      .finally(() => setLoadingPreview(false));
  }, [doc, isOpen]);

  if (!doc) return null;

  const handleFieldValueChange = (fieldName: string, val: string) => {
    setFields((prev) =>
      prev.map((f) =>
        f.fieldName === fieldName
          ? {
              ...f,
              currentValue: val,
              status: 'edited',
            }
          : f,
      ),
    );
  };

  const handleStatusChange = (
    fieldName: string,
    newStatus: 'needs_review' | 'approved' | 'rejected',
  ) => {
    setFields((prev) =>
      prev.map((f) =>
        f.fieldName === fieldName ? { ...f, status: newStatus } : f,
      ),
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
      prev.map((f) => (f.status === 'rejected' ? f : { ...f, status: 'approved' })),
    );
  };

  const saveReviews = async (andApply = false) => {
    if (!doc) return;

    setIsSaving(true);
    try {
      const fieldValues: Record<string, any> = {};
      const fieldStatuses: Record<string, string> = {};

      fields.forEach((f) => {
        fieldValues[f.fieldName] = f.currentValue;
        fieldStatuses[f.fieldName] = f.status;
      });

      await api.documents.review(doc.id, {
        document_type: selectedCategory,
        fields: fieldValues,
        field_statuses: fieldStatuses,
        apply_to_profile: andApply,
      });

      toast({
        title: 'Review saved',
        description: andApply
          ? 'Approved fields have been merged into your tax profile.'
          : 'Extracted fields updated successfully.',
      });

      if (andApply) {
        onApplySuccess?.();
      }
      onClose();
    } catch (err: any) {
      toast({
        title: 'Save failed',
        description: err?.response?.data?.detail || 'Could not update document fields.',
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
      // First save current review choices and apply directly
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
        title: 'OCR Retry Started',
        description: 'The document has been re-queued for optical recognition and extraction.',
      });
      onClose();
    } catch (err: any) {
      toast({
        title: 'Retry failed',
        description: err?.response?.data?.detail || 'Unable to retry OCR at this time.',
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
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="border-b pb-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <span>OCR Field Review</span>
                <span className="text-sm font-normal text-muted-foreground truncate max-w-sm">
                  ({doc.original_filename})
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-1">
                Inspect AI-extracted data points, correct amounts if necessary, and approve fields before merging into your Swiss tax profile.
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              {previewUrl && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowPreviewModal(!showPreviewModal)}
                  className="text-xs flex items-center gap-1"
                >
                  <Eye className="h-3.5 w-3.5" />
                  {showPreviewModal ? 'Hide Document' : 'View Document'}
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetryOcr}
                disabled={isRetrying}
                className="text-xs flex items-center gap-1"
              >
                {isRetrying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Retry OCR
              </Button>
            </div>
          </div>

          {/* Classification & Confidence Banner */}
          <div className="mt-3 flex items-center justify-between p-3 rounded-lg bg-red-50/50 border border-red-100 text-sm">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-red-600" />
              <span className="text-gray-700 font-medium">Classified Type:</span>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="text-xs font-semibold rounded border border-gray-300 px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-red-500"
              >
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">
                AI Confidence: <strong className="text-gray-900">{Math.round((doc.classification_confidence ?? 0.85) * 100)}%</strong>
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleApproveAll}
                className="text-xs h-7 text-green-700 hover:text-green-800 hover:bg-green-50"
              >
                Approve All Fields
              </Button>
            </div>
          </div>
        </DialogHeader>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {/* Optional inline preview panel */}
          {showPreviewModal && previewUrl && (
            <div className="border rounded-lg overflow-hidden bg-gray-100 p-2 max-h-72 flex justify-center">
              {isPdf ? (
                <iframe
                  src={`${previewUrl}#toolbar=0`}
                  className="w-full h-64 rounded bg-white"
                  title="Document Preview"
                />
              ) : isImage ? (
                <img
                  src={previewUrl}
                  alt="Document Preview"
                  className="max-h-64 object-contain rounded shadow"
                />
              ) : (
                <div className="p-4 text-center text-sm text-gray-500">
                  Preview not available in-line.{' '}
                  <a
                    href={previewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-blue-600 underline"
                  >
                    Open in new tab
                  </a>
                </div>
              )}
            </div>
          )}

          {fields.length === 0 ? (
            <div className="text-center py-10 px-4 border border-dashed rounded-lg bg-gray-50">
              <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-gray-700">No Structured Fields Extracted</p>
              <p className="text-xs text-gray-500 max-w-md mx-auto mt-1">
                The optical recognition system detected text but found no high-confidence structured values matching this category. You can retry OCR or manually assign amounts in the Tax Profile.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b text-xs text-gray-600 uppercase">
                  <tr>
                    <th className="py-2.5 px-4 font-semibold">Field Name</th>
                    <th className="py-2.5 px-4 font-semibold">Extracted Value</th>
                    <th className="py-2.5 px-3 font-semibold">Confidence</th>
                    <th className="py-2.5 px-3 font-semibold">Status</th>
                    <th className="py-2.5 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {fields.map((f) => {
                    const isEdited = f.status === 'edited';
                    const isApproved = f.status === 'approved';
                    const isRejected = f.status === 'rejected';

                    return (
                      <tr
                        key={f.fieldName}
                        className={`transition-colors ${
                          isRejected
                            ? 'bg-red-50/30 text-gray-400'
                            : isApproved
                            ? 'bg-green-50/20'
                            : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <td className="py-3 px-4 font-medium text-gray-800">
                          {f.label}
                          <div className="text-[11px] text-gray-400 font-mono">{f.fieldName}</div>
                        </td>
                        <td className="py-3 px-4">
                          <Input
                            value={f.currentValue ?? ''}
                            onChange={(e) => handleFieldValueChange(f.fieldName, e.target.value)}
                            disabled={isRejected}
                            className={`h-8 text-xs font-semibold ${
                              isEdited ? 'border-amber-400 bg-amber-50/30' : ''
                            } ${isRejected ? 'line-through text-gray-400' : ''}`}
                          />
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              f.confidence >= 85
                                ? 'bg-green-100 text-green-700'
                                : f.confidence >= 70
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-red-100 text-red-700'
                            }`}
                          >
                            {f.confidence}%
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {isApproved && (
                            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-[11px]">
                              Approved
                            </Badge>
                          )}
                          {isRejected && (
                            <Badge variant="outline" className="text-red-600 border-red-200 text-[11px]">
                              Rejected
                            </Badge>
                          )}
                          {isEdited && (
                            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 text-[11px]">
                              Edited
                            </Badge>
                          )}
                          {f.status === 'needs_review' && (
                            <Badge variant="outline" className="text-gray-600 border-gray-200 text-[11px]">
                              Needs review
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleStatusChange(f.fieldName, 'approved')}
                              title="Approve field"
                              className={`p-1.5 rounded transition-colors ${
                                isApproved
                                  ? 'bg-green-600 text-white'
                                  : 'text-gray-400 hover:text-green-600 hover:bg-green-50'
                              }`}
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleStatusChange(f.fieldName, 'rejected')}
                              title="Reject / Discard field"
                              className={`p-1.5 rounded transition-colors ${
                                isRejected
                                  ? 'bg-red-600 text-white'
                                  : 'text-gray-400 hover:text-red-600 hover:bg-red-50'
                              }`}
                            >
                              <X className="h-4 w-4" />
                            </button>
                            {(isEdited || isRejected) && (
                              <button
                                onClick={() => handleResetField(f.fieldName)}
                                title="Reset to OCR original"
                                className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors"
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
        <DialogFooter className="border-t pt-4 flex flex-row items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={isSaving || isApplying}>
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => saveReviews(false)}
              disabled={isSaving || isApplying}
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Save Changes
            </Button>
            <Button
              size="sm"
              onClick={handleApplyToProfile}
              disabled={isSaving || isApplying}
              className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5"
            >
              {isApplying ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileCheck2 className="h-4 w-4" />
              )}
              Apply to Tax Profile
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
