'use client';

import React, { useState, useEffect } from 'react';
import {
  FileText,
  Trash2,
  Download,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Search,
  Filter,
  Eye,
  SlidersHorizontal,
  RotateCcw,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { Document as TaxDocument, DOCUMENT_CATEGORIES } from '@/types';
import { formatFileSize, formatDate } from '@/lib/utils';
import { DocumentReviewModal } from './DocumentReviewModal';
import { useTranslation } from '@/lib/i18n/LanguageContext';

interface Props {
  documents: TaxDocument[];
  onDelete?: () => void;
  onRefresh?: () => void;
}

export function DocumentList({ documents, onDelete, onRefresh }: Props) {
  const { toast } = useToast();
  const { t, isGerman, dict } = useTranslation();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [reviewingDoc, setReviewingDoc] = useState<TaxDocument | null>(null);

  const statusConfigMap: Record<string, { label: string; color: string; icon: any }> = {
    queued: { label: dict.documents.statusQueued, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Loader2 },
    pending: { label: dict.documents.statusQueued, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Loader2 },
    processing: { label: dict.documents.statusProcessing, color: 'bg-blue-50 text-blue-700 border-blue-200', icon: Loader2 },
    needs_review: { label: dict.documents.statusNeedsReview, color: 'bg-amber-50 text-amber-800 border-amber-200', icon: SlidersHorizontal },
    completed: { label: dict.documents.statusDone, color: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: CheckCircle },
    done: { label: dict.documents.statusDone, color: 'bg-emerald-50 text-emerald-800 border-emerald-200', icon: CheckCircle },
    failed: { label: dict.documents.statusFailed, color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
    error: { label: dict.documents.statusError, color: 'bg-red-50 text-red-700 border-red-200', icon: AlertTriangle },
  };

  const categoryLabels: Record<string, string> = {
    salary_certificate: dict.documents.typeSalary,
    bank_statement: dict.documents.typeBank,
    securities_statement: dict.documents.typeSecurities,
    pillar3a: dict.documents.typePillar3a,
    insurance: dict.documents.typeInsurance,
    mortgage: dict.documents.typeMortgage,
    tax_assessment: dict.documents.typeTaxAssessment,
    donation_receipt: dict.documents.typeDonation,
    donation: dict.documents.typeDonation,
    charitable_donation: dict.documents.typeDonation,
    medical_expense: dict.documents.typeMedical,
    medical: dict.documents.typeMedical,
    commuting: isGerman ? 'Berufsauslagen / Arbeitsweg' : 'Commuting / Travel',
    education: isGerman ? 'Weiterbildungskosten' : 'Continuing Education',
    childcare: isGerman ? 'Kinderbetreuungskosten' : 'Childcare Costs',
    property: isGerman ? 'Liegenschaft / Immobilien' : 'Real Estate / Property',
    self_employment: isGerman ? 'Selbstständige Erwerbstätigkeit' : 'Self-Employment',
    foreign_income: isGerman ? 'Ausländische Einkünfte' : 'Foreign Income',
    previous_tax_return: isGerman ? 'Vorjahres-Steuererklärung' : 'Previous Tax Return',
    other: dict.documents.typeOther,
  };

  // Auto-poll document list while any document is in processing or queued status
  useEffect(() => {
    const hasActive = documents.some(
      (d) =>
        d.processing_status === 'processing' ||
        d.processing_status === 'queued' ||
        d.processing_status === 'pending'
    );
    if (!hasActive) return;

    const timer = setInterval(() => {
      onRefresh?.();
    }, 2500);

    return () => clearInterval(timer);
  }, [documents, onRefresh]);

  const handleDelete = async (id: string, filename: string) => {
    const confirmMsg = t('documents.deleteConfirm', { filename });
    if (!confirm(confirmMsg)) {
      return;
    }
    setDeletingId(id);
    try {
      await api.documents.delete(id);
      toast({ title: dict.documents.toastDocDeleted });
      onDelete?.();
      onRefresh?.();
    } catch (err: any) {
      toast({
        title: dict.documents.toastDeleteFailed,
        description: err?.response?.data?.detail || (isGerman ? 'Dokument konnte nicht gelöscht werden.' : 'Unable to delete document.'),
        variant: 'destructive',
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDownloadOrPreview = async (id: string, filename: string, openPreview = false) => {
    try {
      const { url } = await api.documents.getDownloadUrl(id);
      if (openPreview) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      }
    } catch {
      toast({
        title: isGerman ? 'Dateizugriff fehlgeschlagen' : 'File access failed',
        description: isGerman ? 'Der Speicherdienst oder das Dokument ist aktuell nicht erreichbar.' : 'Storage service or document is currently unreachable.',
        variant: 'destructive',
      });
    }
  };

  const handleRetryOcr = async (id: string) => {
    setRetryingId(id);
    try {
      await api.documents.retry(id);
      toast({
        title: dict.documents.toastRetryInitiated,
        description: isGerman ? 'Das Dokument wurde zur erneuten Verarbeitung eingereiht.' : 'Document has been re-queued for processing.',
      });
      onRefresh?.();
    } catch (err: any) {
      toast({
        title: dict.documents.toastRetryFailed,
        description: err?.response?.data?.detail || (isGerman ? 'OCR-Wiederholung fehlgeschlagen.' : 'OCR retry failed.'),
        variant: 'destructive',
      });
    } finally {
      setRetryingId(null);
    }
  };

  // Filter documents
  const filteredDocuments = documents.filter((doc) => {
    const matchesSearch =
      !searchTerm ||
      doc.original_filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (doc.document_type && doc.document_type.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      selectedCategoryFilter === 'all' || doc.document_type === selectedCategoryFilter;

    const matchesStatus =
      selectedStatusFilter === 'all' ||
      (selectedStatusFilter === 'completed' && (doc.processing_status === 'completed' || doc.processing_status === 'done')) ||
      doc.processing_status === selectedStatusFilter;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  return (
    <div className="space-y-4">
      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder={dict.documents.searchPlaceholder}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategoryFilter}
            onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            className="h-9 text-xs rounded-md border border-gray-300 bg-white px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">{dict.documents.allCategories}</option>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {categoryLabels[cat.value] || cat.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="h-9 text-xs rounded-md border border-gray-300 bg-white px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          >
            <option value="all">{dict.documents.allStatuses}</option>
            <option value="completed">{dict.documents.statusDone}</option>
            <option value="processing">{dict.documents.statusProcessing}</option>
            <option value="pending">{dict.documents.statusQueued}</option>
            <option value="failed">{dict.documents.statusFailed}</option>
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onRefresh?.()}
            title={isGerman ? 'Dokumentenstatus aktualisieren' : 'Refresh document status'}
            className="h-9 px-2.5 text-xs text-slate-700 hover:text-primary hover:bg-emerald-50 flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{isGerman ? 'Aktualisieren' : 'Refresh'}</span>
          </Button>
        </div>
      </div>

      {/* Document Count Header */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {isGerman
            ? `${filteredDocuments.length} von ${documents.length} Dokument(en)`
            : `Showing ${filteredDocuments.length} of ${documents.length} document${documents.length !== 1 ? 's' : ''}`}
        </span>
        {documents.some((d) => d.is_duplicate_suspect) && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            {isGerman ? 'Mögliches Duplikat erkannt' : 'Duplicate warning detected'}
          </span>
        )}
      </div>

      {/* Empty State */}
      {filteredDocuments.length === 0 ? (
        <div className="text-center py-10 px-4 border border-dashed rounded-lg bg-gray-50">
          <FileText className="h-9 w-9 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">
            {documents.length === 0
              ? dict.documents.emptyTitle
              : (isGerman ? 'Keine passenden Dokumente gefunden.' : 'No documents match the current filter.')}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {documents.length === 0
              ? dict.documents.emptySubtitle
              : (isGerman ? 'Versuche, den Suchfilter oder die Kategorie anzupassen.' : 'Try clearing your search query or reset category filter.')}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => {
            const statusKey = doc.processing_status || 'pending';
            const defaultStatusCfg = { label: dict.documents.statusQueued, color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Loader2 };
            const statusCfg = statusConfigMap[statusKey] || statusConfigMap.pending || defaultStatusCfg;
            const StatusIcon = statusCfg.icon;
            const categoryLabel =
              (doc.document_type && categoryLabels[doc.document_type]) ||
              doc.document_type ||
              (isGerman ? 'Nicht klassifiziert' : 'Unclassified');

            const hasExtractedFields =
              doc.extracted_data &&
              Object.keys(doc.extracted_data).some((k) => !k.startsWith('_'));

            return (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-white hover:border-gray-300 transition-colors shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-emerald-50 text-primary flex-shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {doc.original_filename}
                      </p>
                      <Badge variant="outline" className="text-[11px] font-normal">
                        {categoryLabel}
                      </Badge>
                      {doc.is_duplicate_suspect && (
                        <Badge className="bg-amber-100 text-amber-800 border border-amber-200 text-[11px]">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {isGerman ? 'Mögliches Duplikat' : 'Duplicate Suspect'}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{formatFileSize(doc.file_size_bytes)}</span>
                      <span>•</span>
                      <span>{isGerman ? `Hochgeladen ${formatDate(doc.uploaded_at)}` : `Uploaded ${formatDate(doc.uploaded_at)}`}</span>
                      <span>•</span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusCfg.color}`}
                      >
                        <StatusIcon
                          className={`h-3 w-3 ${
                            statusKey === 'processing' || statusKey === 'pending'
                              ? 'animate-spin'
                              : ''
                          }`}
                        />
                        {statusCfg.label}
                      </span>
                      {doc.classification_confidence !== null &&
                        doc.classification_confidence !== undefined && (
                          <span className="text-gray-400">
                            {isGerman ? `Konfidenz: ${Math.round(doc.classification_confidence * 100)}%` : `Confidence: ${Math.round(doc.classification_confidence * 100)}%`}
                          </span>
                        )}
                    </div>
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {/* Review Button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setReviewingDoc(doc)}
                    className="h-8 text-xs font-medium text-slate-700 hover:text-primary hover:bg-emerald-50 flex items-center gap-1"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    {isGerman ? 'Felder prüfen' : 'Review fields'}
                  </Button>

                  {/* Preview Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadOrPreview(doc.id, doc.original_filename, true)}
                    title={isGerman ? 'Dokument anzeigen' : 'Preview document'}
                    className="h-8 w-8 p-0 text-slate-500 hover:text-primary hover:bg-emerald-50"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  {/* Download Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadOrPreview(doc.id, doc.original_filename, false)}
                    title={isGerman ? 'Original herunterladen' : 'Download original'}
                    className="h-8 w-8 p-0 text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                  >
                    <Download className="h-4 w-4" />
                  </Button>

                  {/* Retry OCR button for failed or unextracted documents */}
                  {(statusKey === 'failed' || statusKey === 'error' || !hasExtractedFields) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRetryOcr(doc.id)}
                      disabled={retryingId === doc.id}
                      title={isGerman ? 'OCR-Verarbeitung wiederholen' : 'Retry OCR processing'}
                      className="h-8 w-8 p-0 text-slate-500 hover:text-amber-600 hover:bg-amber-50"
                    >
                      {retryingId === doc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
                      ) : (
                        <RotateCcw className="h-4 w-4" />
                      )}
                    </Button>
                  )}

                  {/* Delete Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(doc.id, doc.original_filename)}
                    disabled={deletingId === doc.id}
                    title={isGerman ? 'Dokument löschen' : 'Delete document'}
                    className="h-8 w-8 p-0 text-slate-400 hover:text-rose-600 hover:bg-rose-50"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-rose-600" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review Modal */}
      {reviewingDoc && (
        <DocumentReviewModal
          document={reviewingDoc}
          isOpen={Boolean(reviewingDoc)}
          onClose={() => setReviewingDoc(null)}
          onApplySuccess={() => {
            onRefresh?.();
          }}
        />
      )}
    </div>
  );
}
