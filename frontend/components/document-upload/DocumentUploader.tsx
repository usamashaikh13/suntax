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
import { useTranslation } from '@/lib/i18n/LanguageContext';

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

export function DocumentUploader({
  taxReturnId,
  onUploadComplete,
  uploadedCategories = [],
}: Props) {
  const { toast } = useToast();
  const { isGerman } = useTranslation();
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('auto');
  const [showChecklist, setShowChecklist] = useState<boolean>(true);
  const [storageUnavailableError, setStorageUnavailableError] = useState<string | null>(null);

  const RECOMMENDED_DOCUMENTS = [
    {
      category: 'salary_certificate',
      titleDe: 'Lohnausweis (vom Arbeitgeber)',
      titleEn: 'Salary Certificate (Lohnausweis)',
      descDe: 'Obligatorischer Jahreslohnausweis von jedem Schweizer Arbeitgeber.',
      descEn: 'Mandatory annual salary slip from each Swiss employer.',
      required: true,
    },
    {
      category: 'bank_statement',
      titleDe: 'Bank- & Sparkontoauszüge (Steuerauszug)',
      titleEn: 'Bank & Savings Statements (Tax Statement)',
      descDe: 'Kontostand per 31.12. und Bruttozinserträge des Jahres.',
      descEn: 'Account balance as of Dec 31st and gross interest received.',
      required: true,
    },
    {
      category: 'pillar3a',
      titleDe: 'Säule 3a Steuerbescheinigung',
      titleEn: 'Pillar 3a Pension Certificate',
      descDe: 'Jährliche Einzahlungsbestätigung (bis CHF 7’258 für Angestellte abziehbar).',
      descEn: 'Annual contribution confirmation (up to CHF 7,258 deductible for employees).',
      required: false,
    },
    {
      category: 'insurance',
      titleDe: 'Krankenkassen- & Versicherungsausweis',
      titleEn: 'Health & Insurance Premium Statement',
      descDe: 'Prämienbestätigung der Grund- und Zusatzversicherung.',
      descEn: 'Annual health insurance premiums paid for taxpayer and family.',
      required: false,
    },
    {
      category: 'securities_statement',
      titleDe: 'Wertschriften- & Depotauszug',
      titleEn: 'Securities / Depot Statement',
      descDe: 'Steuerwert per 31.12. und Bruttodividenden zur Rückforderung der VSt.',
      descEn: 'Portfolio valuation as of Dec 31st and gross dividend income.',
      required: false,
    },
    {
      category: 'mortgage',
      titleDe: 'Hypothekar- & Schuldzinsausweis',
      titleEn: 'Mortgage / Debt Interest Certificate',
      descDe: 'Schuldsaldo per 31.12. und bezahlte Schuldzinsen.',
      descEn: 'Principal debt balance and annual interest paid on loans.',
      required: false,
    },
    {
      category: 'donation',
      titleDe: 'Spendenquittungen',
      titleEn: 'Donation Receipts',
      descDe: 'Zuwendungen an steuerbefreite gemeinnützige Organisationen.',
      descEn: 'Contributions to recognized Swiss non-profits and charities.',
      required: false,
    },
    {
      category: 'childcare',
      titleDe: 'Drittbetreuungskosten (Kita, Hort)',
      titleEn: 'Childcare & Daycare Receipts',
      descDe: 'Kosten für externe Kinderbetreuung während der Erwerbstätigkeit.',
      descEn: 'Third-party day care, nursery, or crèche expenses for children.',
      required: false,
    },
  ];

  const onDrop = useCallback(
    (accepted: File[], rejected: any[]) => {
      setStorageUnavailableError(null);
      if (rejected.length > 0) {
        const errorDescriptions = rejected.map((r) => {
          const reasons = r.errors.map((e: any) => e.message).join(', ');
          return `${r.file.name}: ${reasons}`;
        });
        toast({
          title: isGerman ? 'Ungültige Datei(en) abgewiesen' : 'Invalid file(s) rejected',
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
    [toast, selectedCategory, isGerman],
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
            ? (isGerman ? 'Speicherdienst vorübergehend nicht verfügbar.' : 'Storage service is currently unavailable.')
            : status === 413
            ? (isGerman ? 'Datei überschreitet das Limit von 50 MB.' : 'File exceeds 50MB maximum upload limit.')
            : status === 415
            ? (isGerman ? 'Nicht unterstütztes Format. Erlaubt: PDF, JPG, PNG, WEBP, TIFF, HEIC.' : 'Unsupported format. Allowed: PDF, JPG, PNG, WEBP, TIFF, HEIC.')
            : err?.response?.data?.detail || (isGerman ? 'Dokumenten-Upload fehlgeschlagen.' : 'Document upload failed.');

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
        title: isGerman ? 'Upload erfolgreich' : 'Upload successful',
        description: isGerman
          ? 'Hochgeladene Dokumente werden jetzt mit KI ausgelesen und zugeordnet.'
          : 'Uploaded documents are now being analyzed by optical character recognition.',
      });
      // Fire staged refreshes so the UI automatically catches background completion
      setTimeout(() => onUploadComplete?.(), 2500);
      setTimeout(() => onUploadComplete?.(), 5500);
    }
  };

  const hasPending = files.some((f) => f.status === 'pending');

  return (
    <div className="space-y-5">
      {/* Upload Guidance Card */}
      <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 text-xs text-blue-900 shadow-sm">
        <div className="flex items-center gap-2 font-semibold text-blue-950 mb-2">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <span>
            {isGerman
              ? 'Tipps für optimale optische Zeichenerkennung (OCR)'
              : 'Document Capture Best Practices for Accurate OCR'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-blue-800">
          <div className="bg-white/80 p-2.5 rounded-xl border border-blue-100/80">
            <strong className="block text-blue-950 font-bold mb-0.5">
              {isGerman ? '1. Ganze Seite sichtbar' : '1. Full Page Visible'}
            </strong>
            {isGerman ? 'Alle 4 Ecken und Barcodes im Bild erfassen.' : 'Ensure all 4 corners and barcodes are within the frame.'}
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-blue-100/80">
            <strong className="block text-blue-950 font-bold mb-0.5">
              {isGerman ? '2. Scharf & ohne Unschärfe' : '2. Crisp & Sharp'}
            </strong>
            {isGerman ? 'Kleine Ziffern und Tabellenzeilen lesbar halten.' : 'Make sure numbers, box references, and text are sharp.'}
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-blue-100/80">
            <strong className="block text-blue-950 font-bold mb-0.5">
              {isGerman ? '3. Gute Beleuchtung' : '3. Good Lighting'}
            </strong>
            {isGerman ? 'Spiegelungen, Schatten und Blitzreflexionen meiden.' : 'Avoid heavy reflections, dark shadows, or flash glare.'}
          </div>
          <div className="bg-white/80 p-2.5 rounded-xl border border-blue-100/80">
            <strong className="block text-blue-950 font-bold mb-0.5">
              {isGerman ? '4. Klare Beträge' : '4. Legible Totals'}
            </strong>
            {isGerman ? 'CHF-Beträge und Abzugspositionen deutlich erkennbar.' : 'Check that CHF amounts and deduction lines are legible.'}
          </div>
        </div>
      </div>

      {/* Storage Unavailable Alert */}
      {storageUnavailableError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="font-semibold text-red-900">
              {isGerman ? 'Dokumentenspeicher nicht erreichbar' : 'Document Service Unavailable'}
            </h4>
            <p className="text-xs mt-1 text-red-700">{storageUnavailableError}</p>
          </div>
        </div>
      )}

      {/* Category selector + Drop Zone */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
            <span>
              {isGerman
                ? 'Dokumentenkategorie vorwählen (optional):'
                : 'Pre-select Document Category (optional):'}
            </span>
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-xs rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-slate-700 focus:outline-none focus:border-[#1E7B52]"
          >
            <option value="auto">
              {isGerman ? 'Automatische Erkennung mit KI (Standard)' : 'Automatic AI Detection (Default)'}
            </option>
            {DOCUMENT_CATEGORIES.map((cat) => (
              <option key={cat.value} value={cat.value}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all bg-white ${
            isDragActive
              ? 'border-[#1E7B52] bg-emerald-50/50 scale-[0.99]'
              : 'border-[#ECE8DF] hover:border-[#1E7B52] hover:bg-slate-50/60'
          }`}
        >
          <input {...getInputProps()} />
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-[#1E7B52] flex items-center justify-center mx-auto mb-3 border border-emerald-100">
            <Upload className="h-6 w-6" />
          </div>
          <p className="text-slate-800 font-bold text-sm">
            {isDragActive
              ? (isGerman ? 'Dateien hier loslassen zum Hochladen...' : 'Drop files here to upload...')
              : (isGerman ? 'Steuerdokumente hier hineinziehen oder klicken zum Auswählen' : 'Drag and drop tax documents here, or click to browse')}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {isGerman
              ? 'Unterstützte Formate: PDF, JPG, PNG, WEBP, TIFF, HEIC (Max. 50 MB)'
              : 'Supported formats: PDF, JPG, PNG, WEBP, TIFF, HEIC (Max. 50 MB)'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
            <span className="text-[11px] text-slate-400">
              {isGerman ? 'Geeignet für:' : 'Suitable for:'}
            </span>
            {DOCUMENT_CATEGORIES.slice(0, 6).map((c) => (
              <span
                key={c.value}
                className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600"
              >
                {c.label}
              </span>
            ))}
            <span className="text-[11px] text-slate-400">
              {isGerman ? '+ weitere Belege' : '+ more documents'}
            </span>
          </div>
        </div>
      </div>

      {/* Selected Pending / Uploading File List */}
      {files.length > 0 && (
        <div className="space-y-2 border border-[#ECE8DF] rounded-2xl p-4 bg-white shadow-xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-700 pb-2 border-b border-slate-100">
            <span>
              {isGerman ? `Ausgewählte Dateien (${files.length})` : `Selected files (${files.length})`}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setFiles([])}
              className="text-xs text-slate-400 hover:text-red-600 h-6"
            >
              {isGerman ? 'Liste leeren' : 'Clear list'}
            </Button>
          </div>

          <div className="space-y-2 pt-1 max-h-60 overflow-y-auto">
            {files.map((uf) => (
              <div
                key={uf.id}
                className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white transition-colors"
              >
                <File className="h-5 w-5 text-slate-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold text-slate-800 truncate">{uf.file.name}</p>
                    <span className="text-[11px] text-slate-400 font-mono">{formatFileSize(uf.file.size)}</span>
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
                      className="text-slate-400 hover:text-red-600 transition-colors p-1"
                      title={isGerman ? 'Entfernen' : 'Remove'}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                  {uf.status === 'uploading' && (
                    <Loader2 className="h-4 w-4 animate-spin text-[#1E7B52]" />
                  )}
                  {uf.status === 'done' && (
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
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
              className="w-full bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-10 mt-2 rounded-xl flex items-center justify-center gap-2 shadow-sm"
            >
              <Upload className="h-4 w-4" />
              {files.filter((f) => f.status === 'pending').length}{' '}
              {isGerman ? 'Dokument(e) hochladen & analysieren' : 'Document(s) upload & analyze'}
            </Button>
          )}
        </div>
      )}

      {/* Recommended Documents Checklist */}
      <div className="border border-[#ECE8DF] rounded-2xl p-4 sm:p-5 bg-white shadow-xs">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4 text-[#1E7B52]" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              {isGerman ? 'Checkliste für deine Steuerdokumente' : 'Checklist for your tax documents'}
            </h4>
          </div>
          <button
            onClick={() => setShowChecklist(!showChecklist)}
            className="text-xs text-slate-500 hover:text-slate-900 cursor-pointer"
          >
            {showChecklist ? (isGerman ? 'Ausblenden' : 'Hide') : (isGerman ? 'Einblenden' : 'Show')}
          </button>
        </div>

        {showChecklist && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {RECOMMENDED_DOCUMENTS.map((docItem) => {
              const isUploaded = uploadedCategories.includes(docItem.category);
              const title = isGerman ? docItem.titleDe : docItem.titleEn;
              const desc = isGerman ? docItem.descDe : docItem.descEn;

              return (
                <div
                  key={docItem.category}
                  className={`p-3 rounded-xl border text-xs transition-all flex items-start gap-2.5 ${
                    isUploaded
                      ? 'bg-emerald-50/50 border-emerald-200'
                      : 'bg-slate-50/60 border-slate-200'
                  }`}
                >
                  <div className="mt-0.5 flex-shrink-0">
                    {isUploaded ? (
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border border-slate-300 bg-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-slate-900">{title}</span>
                      {docItem.required ? (
                        <Badge variant="outline" className="text-[10px] text-emerald-800 border-emerald-300 bg-emerald-50">
                          {isGerman ? 'Empfohlen' : 'Recommended'}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-slate-500 border-slate-200">
                          {isGerman ? 'Optional' : 'Optional'}
                        </Badge>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                      {desc}
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
