'use client';

import React, { useState } from 'react';
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
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { Document as TaxDocument, DOCUMENT_CATEGORIES } from '@/types';
import { formatFileSize, formatDate } from '@/lib/utils';
import { DocumentReviewModal } from './DocumentReviewModal';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  queued: { label: 'Queued', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Loader2 },
  pending: { label: 'Queued', color: 'bg-yellow-50 text-yellow-700 border-yellow-200', icon: Loader2 },
  processing: { label: 'Processing...', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Loader2 },
  needs_review: { label: 'Needs Review', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: SlidersHorizontal },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  done: { label: 'Completed', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
  error: { label: 'Error', color: 'bg-red-100 text-red-700 border-red-200', icon: AlertTriangle },
};

const CATEGORY_LABEL_MAP: Record<string, string> = {};
DOCUMENT_CATEGORIES.forEach((c) => {
  CATEGORY_LABEL_MAP[c.value] = c.label;
});

interface Props {
  documents: TaxDocument[];
  onDelete?: () => void;
  onRefresh?: () => void;
}

export function DocumentList({ documents, onDelete, onRefresh }: Props) {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [reviewingDoc, setReviewingDoc] = useState<TaxDocument | null>(null);

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Are you sure you want to remove "${filename}"? This will unlink extracted fields.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await api.documents.delete(id);
      toast({ title: 'Document removed' });
      onDelete?.();
      onRefresh?.();
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err?.response?.data?.detail || 'Unable to delete document.',
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
        title: 'File access failed',
        description: 'Storage service or document is currently unreachable.',
        variant: 'destructive',
      });
    }
  };

  const handleRetryOcr = async (id: string) => {
    setRetryingId(id);
    try {
      await api.documents.retry(id);
      toast({
        title: 'OCR Retry Initiated',
        description: 'Document has been re-queued for processing.',
      });
      onRefresh?.();
    } catch (err: any) {
      toast({
        title: 'Retry failed',
        description: err?.response?.data?.detail || 'OCR retry failed.',
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
            placeholder="Search by filename or category..."
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
            className="h-9 text-xs rounded-md border border-gray-300 bg-white px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">All Categories</option>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            className="h-9 text-xs rounded-md border border-gray-300 bg-white px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed / Ready</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Document Count Header */}
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          Showing {filteredDocuments.length} of {documents.length} document{documents.length !== 1 ? 's' : ''}
        </span>
        {documents.some((d) => d.is_duplicate_suspect) && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <AlertTriangle className="h-3.5 w-3.5" />
            Duplicate warning detected
          </span>
        )}
      </div>

      {/* Empty State */}
      {filteredDocuments.length === 0 ? (
        <div className="text-center py-10 px-4 border border-dashed rounded-lg bg-gray-50">
          <FileText className="h-9 w-9 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-gray-600">
            {documents.length === 0
              ? 'No documents uploaded yet.'
              : 'No documents match the current filter.'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {documents.length === 0
              ? 'Upload salary slips, bank statements, or Pillar 3a certificates above.'
              : 'Try clearing your search query or reset category filter.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredDocuments.map((doc) => {
            const statusKey = doc.processing_status || 'pending';
            const statusCfg = STATUS_CONFIG[statusKey] ?? STATUS_CONFIG.pending!;
            const StatusIcon = statusCfg.icon;
            const categoryLabel =
              (doc.document_type && CATEGORY_LABEL_MAP[doc.document_type]) ||
              doc.document_type ||
              'Unclassified';

            const hasExtractedFields =
              doc.extracted_data &&
              Object.keys(doc.extracted_data).some((k) => !k.startsWith('_'));

            return (
              <div
                key={doc.id}
                className="flex items-center justify-between gap-3 p-3 rounded-lg border bg-white hover:border-gray-300 transition-colors shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2 rounded-lg bg-red-50 text-red-600 flex-shrink-0">
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
                          <AlertTriangle className="h-3 w-3 mr-1" /> Duplicate Suspect
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>{formatFileSize(doc.file_size_bytes)}</span>
                      <span>•</span>
                      <span>Uploaded {formatDate(doc.uploaded_at)}</span>
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
                            Confidence: {Math.round(doc.classification_confidence * 100)}%
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
                    className="h-8 text-xs font-medium text-gray-700 hover:text-red-600 hover:bg-red-50 flex items-center gap-1"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    Review Fields
                  </Button>

                  {/* Preview Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadOrPreview(doc.id, doc.original_filename, true)}
                    title="View Document"
                    className="h-8 w-8 p-0 text-gray-500 hover:text-blue-600 hover:bg-blue-50"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>

                  {/* Download Button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDownloadOrPreview(doc.id, doc.original_filename, false)}
                    title="Download Original"
                    className="h-8 w-8 p-0 text-gray-500 hover:text-gray-900 hover:bg-gray-100"
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
                      title="Retry OCR Processing"
                      className="h-8 w-8 p-0 text-gray-500 hover:text-amber-600 hover:bg-amber-50"
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
                    title="Delete Document"
                    className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                  >
                    {deletingId === doc.id ? (
                      <Loader2 className="h-4 w-4 animate-spin text-red-600" />
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
