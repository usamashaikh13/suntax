'use client'

import { useEffect, useState } from 'react'
import { FileText, Filter, Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DocumentList } from '@/components/document-upload/DocumentList'
import { DocumentUploader } from '@/components/document-upload/DocumentUploader'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Document, DocumentType } from '@/types'
import { formatDate } from '@/lib/utils'

const DOC_TYPE_LABELS: Record<string, string> = {
  salary_certificate: 'Salary Certificate',
  bank_statement: 'Bank Statement',
  pillar3a: 'Pillar 3a',
  insurance: 'Insurance',
  mortgage: 'Mortgage',
  donation: 'Donation Receipt',
  other: 'Other',
}

const PROCESSING_STATUS_CONFIG: Record<
  string,
  { label: string; className: string }
> = {
  pending: { label: 'Pending', className: 'bg-gray-100 text-gray-600' },
  processing: { label: 'Processing', className: 'bg-blue-100 text-blue-600' },
  completed: { label: 'Done', className: 'bg-green-100 text-green-700' },
  failed: { label: 'Failed', className: 'bg-red-100 text-red-700' },
}

export default function DocumentsPage() {
  const { toast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploader, setShowUploader] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>('all')

  const load = async () => {
    try {
      const docs = await api.documents.list()
      setDocuments(docs)
    } catch {
      toast({ title: 'Failed to load documents', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filteredDocs = typeFilter === 'all'
    ? documents
    : documents.filter(d => d.document_type === typeFilter)

  const uniqueTypes = Array.from(
    new Set(documents.map(d => d.document_type).filter((t): t is DocumentType => Boolean(t)))
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Documents</h2>
          <p className="text-gray-500 text-sm mt-1">
            All your uploaded tax documents in one place.
          </p>
        </div>
        <Button
          onClick={() => setShowUploader(prev => !prev)}
          className="bg-red-600 hover:bg-red-700"
        >
          <Upload className="h-4 w-4 mr-2" />
          Upload Documents
        </Button>
      </div>

      {/* Uploader (toggleable) */}
      {showUploader && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Upload className="h-4 w-4" />
              Upload New Document
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DocumentUploader
              taxReturnId=""
              onUploadComplete={() => { load(); setShowUploader(false) }}
            />
          </CardContent>
        </Card>
      )}

      {/* Filter */}
      {uniqueTypes.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Filter className="h-4 w-4 text-gray-400" />
          <button
            onClick={() => setTypeFilter('all')}
            className={`px-3 py-1 rounded-full text-sm transition-colors ${
              typeFilter === 'all'
                ? 'bg-red-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            All ({documents.length})
          </button>
          {uniqueTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                typeFilter === type
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {DOC_TYPE_LABELS[type] ?? type} (
              {documents.filter(d => d.document_type === type).length})
            </button>
          ))}
        </div>
      )}

      {/* Document list */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filteredDocs.length} document{filteredDocs.length !== 1 ? 's' : ''}
            {typeFilter !== 'all' && ` · ${DOC_TYPE_LABELS[typeFilter] ?? typeFilter}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-red-600" />
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-14 text-center">
              <FileText className="h-12 w-12 text-gray-200 mx-auto mb-4" />
              <p className="text-gray-500 font-medium">No documents uploaded yet</p>
              <p className="text-gray-400 text-sm mt-1">
                Click &quot;Upload Documents&quot; to get started.
              </p>
            </div>
          ) : (
            <DocumentList documents={filteredDocs} onDelete={load} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
