'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxReturn, TaxProfile, Document } from '@/types'
import { DocumentUploader } from '@/components/document-upload/DocumentUploader'
import { DocumentList } from '@/components/document-upload/DocumentList'
import { TaxProfileViewer } from '@/components/tax-profile/TaxProfileViewer'
import { TaxQuestions } from '@/components/tax-profile/TaxQuestions'
import { TaxCalculationDisplay } from '@/components/calculation/TaxCalculationDisplay'
import { FinalReview } from '@/components/review/FinalReview'
import { TaxAssistant } from '@/components/tax-assistant/TaxAssistant'
import { Loader2, AlertCircle } from 'lucide-react'

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zurich', ZG: 'Zug', SZ: 'Schwyz',
  SG: 'St. Gallen', AG: 'Aargau', BE: 'Bern', BS: 'Basel-Stadt',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', in_progress: 'In progress',
  review: 'In review', confirmed: 'Confirmed', exported: 'Exported',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  in_progress: 'bg-blue-100 text-blue-700',
  review: 'bg-yellow-100 text-yellow-700',
  confirmed: 'bg-green-100 text-green-700',
  exported: 'bg-purple-100 text-purple-700',
}

export default function TaxReturnDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { toast } = useToast()
  const [taxReturn, setTaxReturn] = useState<TaxReturn | null>(null)
  const [profile, setProfile] = useState<TaxProfile | null>(null)
  const [documents, setDocuments] = useState<Document[]>([])
  const [calculation, setCalculation] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const loadData = async () => {
    try {
      const [tr, docs] = await Promise.all([
        api.taxReturns.get(id),
        api.documents.list(id),
      ])
      setTaxReturn(tr)
      setDocuments(docs)

      try {
        const prof = await api.taxProfile.get(id)
        setProfile(prof)
      } catch {}

      try {
        const calc = await api.taxEngine.getCalculation(id)
        setCalculation(calc)
      } catch {}
    } catch (e) {
      toast({ title: 'Could not load tax return', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [id])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-red-600" />
      </div>
    )
  }

  if (!taxReturn) {
    return (
      <div className="flex items-center justify-center h-48 gap-2 text-red-600">
        <AlertCircle className="h-6 w-6" /> Tax return not found.
      </div>
    )
  }

  const unansweredQuestions = (profile?.questions || []).filter((q: any) => !q.is_answered).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold">
              {CANTON_NAMES[taxReturn.canton_code]} – {taxReturn.municipality_name}
            </h2>
            <Badge className={STATUS_COLORS[taxReturn.status]}>
              {STATUS_LABELS[taxReturn.status]}
            </Badge>
          </div>
          <p className="text-gray-500 mt-1">Tax year {taxReturn.tax_year}</p>
        </div>
        <TaxAssistant taxReturnId={id} />
      </div>

      {/* Progress */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Documents', value: `${documents.filter(d => d.processing_status === 'completed').length}/${documents.length}`, done: documents.length > 0 },
          { label: 'Profile', value: profile ? 'Created' : 'Pending', done: !!profile },
          { label: 'Questions', value: unansweredQuestions > 0 ? `${unansweredQuestions} open` : 'Answered', done: unansweredQuestions === 0 },
          { label: 'Calculation', value: calculation ? 'Complete' : 'Pending', done: !!calculation },
        ].map(item => (
          <div key={item.label} className={`p-3 rounded-lg border text-center ${item.done ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
            <p className="text-xs text-gray-500">{item.label}</p>
            <p className={`text-sm font-medium ${item.done ? 'text-green-700' : 'text-gray-600'}`}>{item.value}</p>
          </div>
        ))}
      </div>

      {/* Main Tabs */}
      <Tabs defaultValue="documents" className="space-y-4">
        <TabsList className="grid grid-cols-5 w-full">
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="questions">
            Questions {unansweredQuestions > 0 && <span className="ml-1 bg-red-500 text-white rounded-full text-xs w-4 h-4 flex items-center justify-center">{unansweredQuestions}</span>}
          </TabsTrigger>
          <TabsTrigger value="calculation">Calculation</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="space-y-4">
          <DocumentUploader taxReturnId={id} onUploadComplete={loadData} />
          <DocumentList documents={documents} onDelete={loadData} />
        </TabsContent>

        <TabsContent value="profile">
          {profile ? (
            <TaxProfileViewer profile={profile} taxReturnId={id} onUpdate={loadData} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <p>No profile yet. Upload documents first.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="questions">
          {profile ? (
            <TaxQuestions profile={profile} taxReturnId={id} onUpdate={loadData} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <p>Upload documents first to generate questions.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="calculation">
          <TaxCalculationDisplay
            taxReturnId={id}
            calculation={calculation}
            onCalculate={loadData}
          />
        </TabsContent>

        <TabsContent value="review">
          <FinalReview
            taxReturn={taxReturn}
            profile={profile}
            calculation={calculation}
            onConfirm={loadData}
          />
        </TabsContent>
      </Tabs>
    </div>
  )
}
