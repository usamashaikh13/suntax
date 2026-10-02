'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  FileText, Filter, Upload, ShieldCheck, CheckCircle2,
  Clock, AlertCircle, Sparkles, Plus, Search, FolderOpen
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DocumentList } from '@/components/document-upload/DocumentList'
import { DocumentUploader } from '@/components/document-upload/DocumentUploader'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Document, DocumentType } from '@/types'
import { cn } from '@/lib/utils'

const DOC_TYPE_LABELS: Record<string, string> = {
  salary_certificate: 'Salary Certificate (Lohnausweis)',
  bank_statement: 'Bank Statement',
  securities_statement: 'Securities Statement',
  pillar3a: 'Pillar 3a Certificate',
  insurance: 'Health Insurance Premium',
  mortgage: 'Mortgage Interest Statement',
  tax_assessment: 'Prior Tax Assessment',
  donation_receipt: 'Donation Receipt',
  medical_expense: 'Medical & Dental Bills',
  other: 'Other Tax Receipt',
}

export default function DocumentsPage() {
  const { toast } = useToast()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploader, setShowUploader] = useState(false)
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')

  const load = async () => {
    try {
      const docs = await api.documents.list()
      const list = Array.isArray(docs) ? docs : []
      setDocuments(list)
    } catch {
      toast({ title: 'Failed to load documents', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const filteredDocs = useMemo(() => {
    return documents.filter(d => {
      const matchesType = typeFilter === 'all' || d.document_type === typeFilter
      const filename = (d.original_filename || '').toLowerCase()
      const matchesSearch = !searchQuery || filename.includes(searchQuery.toLowerCase())
      return matchesType && matchesSearch
    })
  }, [documents, typeFilter, searchQuery])

  const uniqueTypes = useMemo(() => {
    return Array.from(
      new Set(documents.map(d => d.document_type).filter((t): t is DocumentType => Boolean(t)))
    )
  }, [documents])

  const stats = {
    total: documents.length,
    completed: documents.filter(d => d.processing_status === 'done' || d.processing_status === 'completed').length,
    processing: documents.filter(d => d.processing_status === 'processing' || d.processing_status === 'pending').length,
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full">
              Gemini 3.8 Flash Vision OCR
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-medium">End-to-End Encrypted</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Documents Vault</h2>
          <p className="text-sm text-slate-500 mt-1">
            Store and manage tax slips with automatic cantonal deduction and salary extraction.
          </p>
        </div>

        <Button
          onClick={() => setShowUploader(prev => !prev)}
          className="bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20 font-semibold h-10 px-4"
        >
          <Upload className="h-4 w-4 mr-2" />
          {showUploader ? 'Close Uploader' : 'Upload Documents'}
        </Button>
      </div>

      {/* KPI Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              <FolderOpen className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{stats.total}</p>
              <p className="text-xs text-slate-500">Total Tax Files</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{stats.completed}</p>
              <p className="text-xs text-slate-500">AI Processed & Verified</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">Zero Leakage</p>
              <p className="text-xs text-slate-500">Swiss FADP Compliant</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Drawer (Collapsible) */}
      {showUploader && (
        <Card className="border-red-200 bg-red-50/10 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Upload className="h-4 w-4 text-red-600" />
              Upload Tax Documents
            </CardTitle>
            <CardDescription className="text-xs">
              Upload PDF or image files (up to 50MB each). Lohnausweis, Pillar 3a, and bank statements are automatically classified.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentUploader
              taxReturnId=""
              onUploadComplete={() => {
                load()
                setShowUploader(false)
              }}
            />
          </CardContent>
        </Card>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-2 bg-white rounded-xl border border-slate-200/80 shadow-xs">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search documents by filename..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 text-xs sm:text-sm bg-transparent rounded-lg border-none focus:outline-none focus:ring-1 focus:ring-red-600 text-slate-900 placeholder:text-slate-400"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100/80 rounded-lg flex-shrink-0 overflow-x-auto max-w-full">
          <button
            onClick={() => setTypeFilter('all')}
            className={cn(
              'px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap',
              typeFilter === 'all'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            All ({documents.length})
          </button>
          {uniqueTypes.map(type => (
            <button
              key={type}
              onClick={() => setTypeFilter(type)}
              className={cn(
                'px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap',
                typeFilter === type
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              )}
            >
              {DOC_TYPE_LABELS[type] || type} ({documents.filter(d => d.document_type === type).length})
            </button>
          ))}
        </div>
      </div>

      {/* Documents Content */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent" />
              <p className="text-xs text-slate-500 font-medium">Loading files...</p>
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-red-50 text-red-600 flex items-center justify-center mx-auto shadow-sm">
                <FileText className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {searchQuery || typeFilter !== 'all' ? 'No matching documents' : 'No documents uploaded yet'}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {searchQuery || typeFilter !== 'all'
                    ? 'Try clearing your filter or searching for another file.'
                    : 'Upload your Swiss salary certificates, bank statements, or insurance slips to extract numbers automatically.'}
                </p>
              </div>
              {!searchQuery && typeFilter === 'all' && (
                <Button
                  onClick={() => setShowUploader(true)}
                  className="bg-red-600 hover:bg-red-700 text-white text-xs"
                >
                  <Upload className="h-3.5 w-3.5 mr-1.5" />
                  Upload First Document
                </Button>
              )}
            </div>
          ) : (
            <DocumentList documents={filteredDocs} onDelete={load} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
