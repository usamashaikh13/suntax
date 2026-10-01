'use client'

import { useEffect, useState } from 'react'
import { Upload } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DocumentList } from '@/components/document-upload/DocumentList'
import { DocumentUploader } from '@/components/document-upload/DocumentUploader'
import { api } from '@/lib/api'
import { Document } from '@/types'

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    try {
      const docs = await api.documents.list()
      setDocuments(docs)
    } catch {}
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  return (
    <div className="space-y-6">
      <p className="text-gray-500">All your uploaded tax documents.</p>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" /> Upload a new document
          </CardTitle>
        </CardHeader>
        <CardContent>
          <DocumentUploader taxReturnId="" onUploadComplete={load} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All documents ({documents.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading
            ? <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-7 w-7 border-b-2 border-red-600" /></div>
            : <DocumentList documents={documents} onDelete={load} />
          }
        </CardContent>
      </Card>
    </div>
  )
}
