'use client'

import { useState } from 'react'
import { FileText, Trash2, Download, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Document } from '@/types'
import { formatFileSize, formatDate } from '@/lib/utils'

const DOC_TYPE_LABELS: Record<string, string> = {
  salary_certificate: 'Salary certificate',
  bank_statement: 'Bank statement',
  securities_statement: 'Securities statement',
  pillar3a: 'Pillar 3a',
  insurance: 'Insurance',
  mortgage: 'Mortgage',
  tax_assessment: 'Tax assessment',
  tax_return: 'Tax return',
  donation_receipt: 'Donation receipt',
  medical_expense: 'Medical expenses',
  education: 'Education',
  real_estate: 'Real estate',
  other: 'Other',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pending', color: 'bg-gray-100 text-gray-600', icon: Loader2 },
  processing: { label: 'Processing...', color: 'bg-blue-100 text-blue-600', icon: Loader2 },
  completed: { label: 'Complete', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-600', icon: AlertTriangle },
}

interface Props {
  documents: Document[]
  onDelete?: () => void
}

export function DocumentList({ documents, onDelete }: Props) {
  const { toast } = useToast()
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = async (id: string, filename: string) => {
    if (!confirm(`Do you really want to delete "${filename}"?`)) return
    setDeleting(id)
    try {
      await api.documents.delete(id)
      toast({ title: 'Document deleted' })
      onDelete?.()
    } catch {
      toast({ title: 'Delete failed', variant: 'destructive' })
    } finally {
      setDeleting(null)
    }
  }

  const handleDownload = async (id: string, filename: string) => {
    try {
      const { url } = await api.documents.getDownloadUrl(id)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
    } catch {
      toast({ title: 'Download failed', variant: 'destructive' })
    }
  }

  if (documents.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400">
        <FileText className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No documents uploaded yet</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-gray-700">
        {documents.length} document{documents.length !== 1 ? 's' : ''} uploaded
      </h3>
      {documents.map(doc => {
        const statusCfg = STATUS_CONFIG[doc.processing_status] ?? STATUS_CONFIG.pending!
        const StatusIcon = statusCfg.icon

        return (
          <div key={doc.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white hover:border-gray-300 transition-colors">
            <FileText className="h-5 w-5 text-gray-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium truncate">{doc.original_filename}</p>
                {doc.document_type && (
                  <Badge variant="outline" className="text-xs">
                    {DOC_TYPE_LABELS[doc.document_type] || doc.document_type}
                  </Badge>
                )}
                {doc.is_duplicate_suspect && (
                  <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                    <AlertTriangle className="h-3 w-3 mr-1" /> Possible duplicate
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-xs text-gray-400">{formatFileSize(doc.file_size_bytes)}</span>
                <span className="text-xs text-gray-400">{formatDate(doc.uploaded_at)}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full flex items-center gap-1 ${statusCfg.color}`}>
                  <StatusIcon className={`h-3 w-3 ${doc.processing_status === 'processing' ? 'animate-spin' : ''}`} />
                  {statusCfg.label}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={() => handleDownload(doc.id, doc.original_filename)}
                className="p-1.5 text-gray-400 hover:text-blue-600 rounded hover:bg-blue-50 transition-colors">
                <Download className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleDelete(doc.id, doc.original_filename)}
                disabled={deleting === doc.id}
                className="p-1.5 text-gray-400 hover:text-red-600 rounded hover:bg-red-50 transition-colors"
              >
                {deleting === doc.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
