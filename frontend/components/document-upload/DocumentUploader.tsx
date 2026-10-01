'use client'

import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { Upload, File, X, CheckCircle, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { formatFileSize } from '@/lib/utils'

interface UploadFile {
  file: File
  id: string
  status: 'pending' | 'uploading' | 'done' | 'error'
  progress: number
  error?: string
}

interface Props {
  taxReturnId: string
  onUploadComplete?: () => void
}

const ACCEPTED_TYPES = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
}

const MAX_SIZE = 50 * 1024 * 1024 // 50MB

export function DocumentUploader({ taxReturnId, onUploadComplete }: Props) {
  const { toast } = useToast()
  const [files, setFiles] = useState<UploadFile[]>([])

  const onDrop = useCallback((accepted: File[], rejected: any[]) => {
    if (rejected.length > 0) {
      toast({
        title: 'Invalid file(s)',
        description: `${rejected.length} file(s) were rejected. Allowed formats: PDF, JPG, PNG (max. 50 MB)`,
        variant: 'destructive',
      })
    }

    const newFiles: UploadFile[] = accepted.map(f => ({
      file: f,
      id: Math.random().toString(36).slice(2),
      status: 'pending',
      progress: 0,
    }))
    setFiles(prev => [...prev, ...newFiles])
  }, [toast])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: MAX_SIZE,
    multiple: true,
  })

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id))
  }

  const uploadAll = async () => {
    const pending = files.filter(f => f.status === 'pending')
    if (pending.length === 0) return

    for (const uf of pending) {
      setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'uploading' } : f))

      try {
        await api.documents.upload(taxReturnId, uf.file, (progress) => {
          setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, progress } : f))
        })

        setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'done', progress: 100 } : f))
      } catch (err: any) {
        const msg = err?.response?.data?.detail || 'Upload failed'
        setFiles(prev => prev.map(f => f.id === uf.id ? { ...f, status: 'error', error: msg } : f))
      }
    }

    onUploadComplete?.()
    toast({ title: 'Upload complete', description: 'Documents are now being analysed.' })
  }

  const hasPending = files.some(f => f.status === 'pending')

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${isDragActive ? 'border-red-500 bg-red-50' : 'border-gray-300 hover:border-red-400 hover:bg-gray-50'}`}
      >
        <input {...getInputProps()} />
        <Upload className={`h-10 w-10 mx-auto mb-3 ${isDragActive ? 'text-red-500' : 'text-gray-400'}`} />
        <p className="text-gray-700 font-medium">
          {isDragActive ? 'Drop files here...' : 'Drag files here or click to browse'}
        </p>
        <p className="text-sm text-gray-400 mt-1">PDF, JPG, PNG – max. 50 MB per file</p>
        <p className="text-xs text-gray-400 mt-1">
          Salary certificate, bank statement, Pillar 3a, insurance, mortgage, donations, etc.
        </p>
      </div>

      {/* File list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map(uf => (
            <div key={uf.id} className="flex items-center gap-3 p-3 rounded-lg border bg-white">
              <File className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{uf.file.name}</p>
                <p className="text-xs text-gray-400">{formatFileSize(uf.file.size)}</p>
                {uf.status === 'uploading' && (
                  <Progress value={uf.progress} className="mt-1 h-1" />
                )}
                {uf.status === 'error' && (
                  <p className="text-xs text-red-600 mt-1">{uf.error}</p>
                )}
              </div>
              <div className="flex-shrink-0">
                {uf.status === 'pending' && (
                  <button onClick={() => removeFile(uf.id)} className="text-gray-400 hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                )}
                {uf.status === 'uploading' && <Loader2 className="h-4 w-4 animate-spin text-blue-500" />}
                {uf.status === 'done' && <CheckCircle className="h-4 w-4 text-green-500" />}
                {uf.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
              </div>
            </div>
          ))}

          {hasPending && (
            <Button onClick={uploadAll} className="w-full bg-red-600 hover:bg-red-700">
              <Upload className="h-4 w-4 mr-2" />
              Upload {files.filter(f => f.status === 'pending').length} file(s)
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
