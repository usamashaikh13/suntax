'use client'

import { useEffect, useState } from 'react'
import {
  FileText, Upload, ShieldCheck, CheckCircle2,
  FolderOpen
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DocumentList } from '@/components/document-upload/DocumentList'
import { DocumentUploader } from '@/components/document-upload/DocumentUploader'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { Document } from '@/types'
import { useTranslation } from '@/lib/i18n/LanguageContext'

export default function DocumentsPage() {
  const { toast } = useToast()
  const { isGerman, dict } = useTranslation()
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [showUploader, setShowUploader] = useState(false)

  const load = async () => {
    try {
      const docs = await api.documents.list()
      const list = Array.isArray(docs) ? docs : []
      setDocuments(list)
    } catch {
      toast({ title: dict.documents.toastLoadFailed, variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    const hasActiveProcessing = documents.some(
      d =>
        d.processing_status === 'processing' ||
        d.processing_status === 'queued' ||
        d.processing_status === 'pending'
    )
    if (!hasActiveProcessing) return

    const timer = setInterval(() => {
      load()
    }, 2500)

    return () => clearInterval(timer)
  }, [documents])

  const stats = {
    total: documents.length,
    completed: documents.filter(d => d.processing_status === 'done' || d.processing_status === 'completed').length,
    needs_review: documents.filter(d => d.processing_status === 'needs_review').length,
    processing: documents.filter(d => d.processing_status === 'processing' || d.processing_status === 'pending' || d.processing_status === 'queued').length,
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold text-primary bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
              {dict.documents.ocrBadge}
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-medium">{dict.documents.encryptionBadge}</span>
          </div>
          <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{dict.documents.vaultTitle}</h2>
          <p className="text-sm text-slate-500 mt-1">
            {dict.documents.vaultSubtitle}
          </p>
        </div>

        <Button
          onClick={() => setShowUploader(prev => !prev)}
          className="bg-primary hover:bg-primary-600 text-white shadow-sm font-semibold h-10 px-4"
        >
          <Upload className="h-4 w-4 mr-2" />
          {showUploader ? dict.documents.closeUploadBtn : dict.documents.uploadDocsBtn}
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
              <p className="text-xs text-slate-500">{dict.documents.statTotalDocs}</p>
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
              <p className="text-xs text-slate-500">{dict.documents.statVerified}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 shadow-xs">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-slate-900">{dict.documents.statDataResidency}</p>
              <p className="text-xs text-slate-500">{dict.documents.statDataResidencySub}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Upload Drawer (Collapsible) */}
      {showUploader && (
        <Card className="border-emerald-200 bg-emerald-50/20 shadow-md">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-bold flex items-center gap-2 text-slate-900">
              <Upload className="h-4 w-4 text-primary" />
              {dict.documents.uploadDocsBtn}
            </CardTitle>
            <CardDescription className="text-xs">
              {isGerman
                ? 'Lade PDF- oder Bilddateien hoch (bis zu 50 MB pro Datei). Lohnausweise, Säule 3a und Bankauszüge werden automatisch erkannt.'
                : 'Upload PDF or image files (up to 50 MB per file). Salary certificates, Pillar 3a, and bank statements are automatically detected.'}
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

      {/* Documents Content */}
      <Card className="border-slate-200 shadow-sm overflow-hidden">
        <CardContent className="p-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-2">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
              <p className="text-xs text-slate-500 font-medium">{dict.common.loading}</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="py-16 text-center space-y-4">
              <div className="h-14 w-14 rounded-2xl bg-emerald-50 text-primary flex items-center justify-center mx-auto shadow-sm">
                <FileText className="h-7 w-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">
                  {dict.documents.emptyTitle}
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  {dict.documents.emptySubtitle}
                </p>
              </div>
              <Button
                onClick={() => setShowUploader(true)}
                className="bg-primary hover:bg-primary-600 text-white text-xs"
              >
                <Upload className="h-3.5 w-3.5 mr-1.5" />
                {isGerman ? 'Erstes Dokument hochladen' : 'Upload first document'}
              </Button>
            </div>
          ) : (
            <DocumentList documents={documents} onDelete={load} onRefresh={load} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
