'use client';

import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  Upload,
  File,
  X,
  CheckCircle,
  Loader2,
  AlertCircle,
  Info,
  CheckSquare,
  Sparkles,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { formatFileSize } from '@/lib/utils';
import { DOCUMENT_CATEGORIES } from '@/types';

interface UploadFile {
  file: File;
  id: string;
  category?: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  progress: number;
  error?: string;
}

interface Props {
  taxReturnId: string;
  onUploadComplete?: () => void;
  uploadedCategories?: string[];
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/tiff': ['.tif', '.tiff'],
  'image/heic': ['.heic'],
  'image/heif': ['.heif'],
};

const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

const RECOMMENDED_DOCUMENTS = [
  {
    category: 'salary_certificate',
    title: 'Salary Certificate (Lohnausweis)',
    description: 'Mandatory annual salary slip from each Swiss employer.',
    required: true,
  },
  {
    category: 'bank_statement',
    title: 'Bank & Savings Statements (Steuerauszug)',
    description: 'Account balance as of Dec 31st and gross interest received.',
    required: true,
  },
  {
    category: 'pillar3a',
    title: 'Pillar 3a Pension Certificate',
    description: 'Annual contribution confirmation (up to CHF 7,258 for employees).',
    required: false,
  },
  {
    category: 'insurance',
    title: 'Health & Life Insurance Premium Statement',
    description: 'Annual health insurance premiums paid for taxpayer and children.',
    required: false,
  },
  {
    category: 'securities_statement',
    title: 'Securities / Depot Statement',
    description: 'Portfolio valuation as of Dec 31st and gross dividend income.',
    required: false,
  },
  {
    category: 'mortgage',
    title: 'Mortgage / Debt Interest Certificate',
    description: 'Principal debt balance and annual interest paid on loans.',
    required: false,
  },
  {
    category: 'donation',
    title: 'Donation Receipts (Spendenbescheinigung)',
    description: 'Contributions to recognized Swiss non-profits and charities.',
    required: false,
  },
  {
    category: 'childcare',
    title: 'Childcare & Daycare Receipts',
    description: 'Third-party day care, nursery, or crèche expenses for children.',
    required: false,
  },
  {
    category: 'education',
    title: 'Continuing Professional Education',
    description: 'Tuition and course invoices directly related to career growth.',
    required: false,
  },
  {
    category: 'medical',
    title: 'Medical & Dental Self-Paid Invoices',
    description: 'Unreimbursed health expenses exceeding cantonal deductible threshold.',
    required: false,
  },
];

export function DocumentUploader({
  taxReturnId,
  onUploadComplete,
  uploadedCategories = [],
}: Props) {
  const { toast } = useToast();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('auto');
  const [showChecklist, setShowChecklist] = useState<boolean>(true);
  const [storageUnavailableError, setStorageUnavailableError] = useState<string | null>(null);

  const onDrop = useCallback(
    (accepted: File[], rejected: any[]) => {
      setStorageUnavailableError(null);
      if (rejected.length > 0) {
        const errorDescriptions = rejected.map((r) => {
          const reasons = r.errors.map((e: any) => e.message).join(', ');
          return `${r.file.name}: ${reasons}`;
        });
        toast({
          title: 'Invalid file(s) rejected',
          description: errorDescriptions.slice(0, 2).join('; ') + (rejected.length > 2 ? ` (+${rejected.length - 2} more)` : ''),
          variant: 'destructive',
        });
      }

      const newFiles: UploadFile[] = accepted.map((f) => ({
        file: f,
        id: Math.random().toString(36).slice(2),
        category: selectedCategory !== 'auto' ? selectedCategory : undefined,
        status: 'pending',
        progress: 0,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    },
    [toast, selectedCategory],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: true,
  });

  const removeFile = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const uploadAll = async () => {
    const pending = files.filter((f) => f.status === 'pending');
    if (pending.length === 0) return;

    setStorageUnavailableError(null);

    let hasSuccess = false;
    for (const uf of pending) {
      setFiles((prev) =>
        prev.map((f) => (f.id === uf.id ? { ...f, status: 'uploading' } : f)),
      );

      try {
        await api.documents.upload(taxReturnId, uf.file, (progress) => {
          setFiles((prev) =>
            prev.map((f) => (f.id === uf.id ? { ...f, progress } : f)),
          );
        });

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id ? { ...f, status: 'done', progress: 100 } : f,
          ),
        );
        hasSuccess = true;
      } catch (err: any) {
        const status = err?.response?.status;
        const msg =
          status === 503
            ? 'Storage service is currently unavailable. Please verify storage backend.'
            : status === 413
            ? 'File exceeds 50MB maximum upload limit.'
            : status === 415
            ? 'Unsupported format. Allowed: PDF, JPG, PNG, WEBP, TIFF, HEIC.'
            : err?.response?.data?.detail || 'Document upload failed. Please try again.';

        if (status === 503) {
          setStorageUnavailableError(msg);
        }

        setFiles((prev) =>
          prev.map((f) =>
            f.id === uf.id ? { ...f, status: 'error', error: msg } : f,
          ),
        );
      }
    }

    if (hasSuccess) {
      onUploadComplete?.();
      toast({
        title: 'Upload successful',
        description: 'Uploaded documents are now being analyzed by the OCR extraction engine.',
      });
    }
  };

  const hasPending = files.some((f) => f.status === 'pending');

  return (
    <div className="space-y-5">
      {/* Upload Guidance Card */}
      <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-900 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-blue-950 mb-2">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span>Document Capture Best Practices for Accurate OCR</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-blue-800">
          <div className="bg-white/70 p-2.5 rounded-lg border border-blue-100/80">
            <strong className="block text-blue-950 font-medium mb-0.5">1. Full Page Visible</strong>
            Ensure all 4 borders and QR/barcodes are within the frame.
          </div>
          <div className="bg-white/70 p-2.5 rounded-lg border border-blue-100/80">
            <strong className="block text-blue-950 font-medium mb-0.5">2. Crisp & No Blur</strong>
            Make sure small figures, Box numbers, and text are pin-sharp.
          </div>
          <div className="bg-white/70 p-2.5 rounded-lg border border-blue-100/80">
            <strong className="block text-blue-950 font-medium mb-0.5">3. Clean Lighting</strong>
            Avoid heavy reflections, dark shadows, or flash glare over numbers.
          </div>
          <div className="bg-white/70 p-2.5 rounded-lg border border-blue-100/80">
            <strong className="block text-blue-950 font-medium mb-0.5">4. Legible Amounts</strong>
            Check that CHF amounts, deductions, and balances are clearly printed.
          </div>
        </div>
      </div>

      {/* Storage Unavailable Alert */}
      {storageUnavailableError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-900">Document Service Unavailable</h4>
            <p className="text-xs mt-1 text-red-700">{storageUnavailableError}</p>
          </div>
        </div>
      )}

      {/* Category selector + Drop Zone */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-gray-700 flex items-center gap-1.5">
            <span>Pre-select Document Category (optional):</span>
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs rounded-md border border-gray-300 bg-white px-2.5 py-1 text-gray-700 focus:outline-none focus:ring-1 focus:ring-red-500"
          >
            <option value="auto">Auto-Detect with AI (Default)</option>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
            isDragActive
              ? 'border-red-500 bg-red-50/70 scale-[0.99]'
              : 'border-gray-300 hover:border-red-400 hover:bg-gray-50/70'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto mb-3">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-gray-800 font-semibold text-sm">
            {isDragActive
              ? 'Drop files here to upload...'
              : 'Drag & drop your tax documents here, or click to browse'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Supported formats: <strong>PDF, JPG, JPEG, PNG, WEBP, TIFF, HEIC, HEIF</strong> (Max 50 MB)
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
            <span className="text-[11px] text-gray-400">Supported:</span>
            {DOCUMENT_CATEGORIES.slice(0, 7).map((c) => (
              <span
                key={c.value}
                className="text-[11px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600"
              >
                {c.label}
              </span>
            ))}
            <span className="text-[11px] text-gray-400">+10 more</span>
          </div>
        </div>
      </div>

      {/* Selected Pending / Uploading File List */}
      {files.length > 0 && (
        <div className="space-y-2 border rounded-xl p-4 bg-white shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-gray-700 pb-2 border-b">
            <span>Selected Files ({files.length})</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiles([])}
              className="text-xs text-gray-400 hover:text-red-600 h-6"
            >
              Clear List
            </Button>
          </div>

          <div className="space-y-2 pt-1 max-h-60 overflow-y-auto">
            {files.map((uf) => (
              <div
                key={uf.id}
                className="flex items-center gap-3 p-2.5 rounded-lg border bg-gray-50/50 hover:bg-white transition-colors"
              >
                <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-gray-800 truncate">{uf.file.name}</p>
                    <span className="text-[11px] text-gray-400">{formatFileSize(uf.file.size)}</span>
                  </div>
                  {uf.status === 'uploading' && (
                    <Progress value={uf.progress} className="mt-1.5 h-1.5" />
                  )}
                  {uf.status === 'error' && (
                    <p className="text-[11px] text-red-600 font-medium mt-1">{uf.error}</p>
                  )}
                </div>

                <div className="flex-shrink-0">
                  {uf.status === 'pending' && (
                    <button
                      onClick={() => removeFile(uf.id)}
                      className="text-gray-400 hover:text-red-600 transition-colors p-1"
                      title="Remove"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {uf.status === 'uploading' && (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  )}
                  {uf.status === 'done' && (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  )}
                  {uf.status === 'error' && (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                </div>
              </div>
            ))}
          </div>

          {hasPending && (
            <Button
              onClick={uploadAll}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-medium text-xs h-9 mt-2 flex items-center justify-center gap-2"
            >
              <Upload className="h-4 w-4" />
              Upload & Process {files.filter((f) => f.status === 'pending').length} Document(s)
            </Button>
          )}
        </div>
      )}

      {/* Recommended Documents Checklist */}
      <div className="border rounded-xl p-4 bg-white shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-red-600" />
            <h4 className="text-xs font-bold text-gray-900 uppercase tracking-wider">
              Recommended Documents Checklist
            </h4>
          </div>
          <button
            onClick={() => setShowChecklist(!showChecklist)}
            className="text-xs text-gray-500 hover:text-gray-900"
          >
            {showChecklist ? 'Hide Checklist' : 'Show Checklist'}
          </button>
        </div>

        {showChecklist && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {RECOMMENDED_DOCUMENTS.map((docItem) => {
              const isUploaded = uploadedCategories.includes(docItem.category);

              return (
                <div
                  key={docItem.category}
                  className={`p-3 rounded-lg border text-xs transition-all flex items-start gap-2.5 ${
                    isUploaded
                      ? 'bg-green-50/50 border-green-200'
                      : 'bg-gray-50/60 border-gray-200'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isUploaded ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-gray-300 bg-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-900">{docItem.title}</span>
                      {docItem.required ? (
                        <Badge variant="outline" className="text-[10px] text-red-700 border-red-200">
                          Recommended
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-gray-500 border-gray-200">
                          Optional
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
                      {docItem.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
