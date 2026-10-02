import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';
import { DocumentType, ProcessingStatus, TaxReturnStatus } from '@/types';

/**
 * Merges Tailwind CSS class names safely, resolving conflicts.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats a number as a Swiss Franc currency string.
 * @example formatCurrency(12345.67) → 'CHF 12'345.67'
 */
export function formatCurrency(amount: number, currency = 'CHF'): string {
  return new Intl.NumberFormat('de-CH', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Formats a date string or Date object to Swiss German locale.
 * @example formatDate('2024-03-15T10:00:00Z') → '15.03.2024'
 */
export function formatDate(date: string | Date, pattern = 'dd.MM.yyyy'): string {
  try {
    const d = typeof date === 'string' ? parseISO(date) : date;
    return format(d, pattern, { locale: de });
  } catch {
    return '—';
  }
}

/**
 * Formats a date with time.
 * @example formatDateTime('2024-03-15T10:30:00Z') → '15.03.2024, 10:30'
 */
export function formatDateTime(date: string | Date): string {
  return formatDate(date, 'dd.MM.yyyy, HH:mm');
}

/**
 * Formats file size bytes into a human-readable string.
 * @example formatFileSize(1024) → '1.0 KB'
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const size = sizes[i];
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${size ?? 'B'}`;
}

/**
 * Returns Tailwind color classes for a given TaxReturnStatus.
 */
export function getStatusColor(status: TaxReturnStatus | ProcessingStatus): {
  bg: string;
  text: string;
  border: string;
} {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    [TaxReturnStatus.DRAFT]: {
      bg: 'bg-slate-100',
      text: 'text-slate-700',
      border: 'border-slate-200',
    },
    [TaxReturnStatus.DOCUMENTS_UPLOADED]: {
      bg: 'bg-blue-50',
      text: 'text-blue-700',
      border: 'border-blue-200',
    },
    [TaxReturnStatus.PROCESSING]: {
      bg: 'bg-amber-50',
      text: 'text-amber-700',
      border: 'border-amber-200',
    },
    [TaxReturnStatus.QUESTIONS_PENDING]: {
      bg: 'bg-orange-50',
      text: 'text-orange-700',
      border: 'border-orange-200',
    },
    [TaxReturnStatus.CALCULATING]: {
      bg: 'bg-purple-50',
      text: 'text-purple-700',
      border: 'border-purple-200',
    },
    [TaxReturnStatus.REVIEW]: {
      bg: 'bg-indigo-50',
      text: 'text-indigo-700',
      border: 'border-indigo-200',
    },
    [TaxReturnStatus.COMPLETED]: {
      bg: 'bg-green-50',
      text: 'text-green-700',
      border: 'border-green-200',
    },
    [TaxReturnStatus.SUBMITTED]: {
      bg: 'bg-emerald-50',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
    },
    [TaxReturnStatus.ERROR]: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
    },
    [ProcessingStatus.PENDING]: {
      bg: 'bg-slate-100',
      text: 'text-slate-600',
      border: 'border-slate-200',
    },
    [ProcessingStatus.FAILED]: {
      bg: 'bg-red-50',
      text: 'text-red-700',
      border: 'border-red-200',
    },
    [ProcessingStatus.MANUAL_REVIEW]: {
      bg: 'bg-yellow-50',
      text: 'text-yellow-700',
      border: 'border-yellow-200',
    },
  };

  return (
    map[status] ?? {
      bg: 'bg-gray-100',
      text: 'text-gray-700',
      border: 'border-gray-200',
    }
  );
}

/**
 * Returns a human-readable English label for a document type.
 */
export function getDocumentTypeLabel(type: DocumentType | string | null): string {
  const labels: Record<string, string> = {
    [DocumentType.SALARY_STATEMENT]: 'Salary certificate',
    [DocumentType.BANK_STATEMENT]: 'Bank statement',
    [DocumentType.SECURITIES_STATEMENT]: 'Securities statement',
    [DocumentType.REAL_ESTATE_DOCUMENT]: 'Real-estate document',
    [DocumentType.INSURANCE_CERTIFICATE]: 'Insurance certificate',
    [DocumentType.PENSION_STATEMENT]: 'Pension certificate',
    [DocumentType.DIVIDEND_STATEMENT]: 'Dividend statement',
    [DocumentType.INTEREST_STATEMENT]: 'Interest certificate',
    [DocumentType.RENTAL_INCOME]: 'Rental income',
    [DocumentType.BUSINESS_INCOME]: 'Business income',
    [DocumentType.MEDICAL_EXPENSES]: 'Medical expenses',
    [DocumentType.CHARITABLE_DONATION]: 'Donation receipt',
    [DocumentType.MORTGAGE_STATEMENT]: 'Mortgage statement',
    [DocumentType.TAX_ASSESSMENT]: 'Tax assessment',
    [DocumentType.OTHER]: 'Other',
  };
  if (!type) return 'Unknown';
  return labels[type] ?? type;
}

/**
 * Returns English label for TaxReturnStatus.
 */
export function getStatusLabel(status: TaxReturnStatus | string): string {
  const labels: Record<string, string> = {
    [TaxReturnStatus.DRAFT]: 'Draft',
    [TaxReturnStatus.DOCUMENTS_UPLOADED]: 'Documents uploaded',
    [TaxReturnStatus.PROCESSING]: 'In progress',
    [TaxReturnStatus.QUESTIONS_PENDING]: 'Questions pending',
    [TaxReturnStatus.CALCULATING]: 'Calculating',
    [TaxReturnStatus.REVIEW]: 'In review',
    [TaxReturnStatus.COMPLETED]: 'Complete',
    [TaxReturnStatus.CONFIRMED]: 'Confirmed',
    [TaxReturnStatus.SUBMITTED]: 'Submitted',
    [TaxReturnStatus.ERROR]: 'Error',
  };
  return labels[status] ?? status;
}

/**
 * Truncates a string to a maximum length, adding ellipsis if truncated.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return `${str.slice(0, maxLength)}…`;
}

/**
 * Extracts initials from a full name (up to 2 characters).
 * @example getInitials('Anna Müller') → 'AM'
 */
export function getInitials(fullName: string): string {
  return fullName
    .split(' ')
    .slice(0, 2)
    .map((n) => n[0] ?? '')
    .join('')
    .toUpperCase();
}

/**
 * Converts a percentage (0–100) to a color class indicating confidence.
 */
export function confidenceToColorClass(confidence: number): string {
  if (confidence >= 0.85) return 'text-green-600';
  if (confidence >= 0.6) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Converts a percentage to a label string.
 */
export function confidenceToLabel(confidence: number): string {
  if (confidence >= 0.85) return 'Hoch';
  if (confidence >= 0.6) return 'Mittel';
  return 'Niedrig';
}
