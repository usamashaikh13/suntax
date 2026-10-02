'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
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
import { AiSubmissionGuide } from '@/components/tax-assistant/AiSubmissionGuide'
import { Loader2, AlertCircle, Sparkles, MessageCircle } from 'lucide-react'

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zurich', ZG: 'Zug', SZ: 'Schwyz',
  SG: 'St. Gallen', AG: 'Aargau', BE: 'Bern', BS: 'Basel-City',
  LU: 'Lucerne', UR: 'Uri', OW: 'Obwalden', NW: 'Nidwalden',
  GL: 'Glarus', FR: 'Fribourg', SO: 'Solothurn', BL: 'Basel-Country',
  SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden',
  GR: 'Graubünden', TG: 'Thurgau', TI: 'Ticino', VD: 'Vaud',
  VS: 'Valais', NE: 'Neuchâtel', GE: 'Geneva', JU: 'Jura',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  in_progress: 'In Progress',
  review: 'Under Review',
  confirmed: 'Confirmed',
  exported: 'Exported',
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
  const [activeTab, setActiveTab] = useState<string>('guide')
  const [assistantPrompt, setAssistantPrompt] = useState<string | null>(null)

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
    } catch {
      toast({ title: 'Could not load tax return', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [id])

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
        <AlertCircle className="h-6 w-6" />
        <span>Tax return not found.</span>
      </div>
    )
  }

  const unansweredQuestions = (profile?.questions || []).filter((q: any) => !q.is_answered).length

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-gray-900">
              {CANTON_NAMES[taxReturn.canton_code] ?? taxReturn.canton_code} – {taxReturn.municipality_name}
            </h2>
            <Badge className={STATUS_COLORS[taxReturn.status]}>
              {STATUS_LABELS[taxReturn.status] ?? taxReturn.status}
            </Badge>
          </div>
          <p className="text-gray-500 text-sm mt-1">
            Tax year {taxReturn.tax_year} · Canton {taxReturn.canton_code}
          </p>
        </div>

        {/* AI Copilot shortcut buttons */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('guide')}
            className="border-red-200 text-red-700 bg-red-50/50 hover:bg-red-50 flex items-center gap-1.5 shadow-2xs text-xs"
          >
            <Sparkles className="h-3.5 w-3.5 text-red-600" />
            AI Submission Roadmap
          </Button>
          <Button
            size="sm"
            onClick={() => setAssistantPrompt('How do I submit my tax return to the tax office?')}
            className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 shadow-xs text-xs"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Ask AI Copilot
          </Button>
        </div>
      </div>

      {/* ── Progress overview cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Documents',
            value: `${documents.filter(d => d.processing_status === 'done' || d.processing_status === 'completed').length}/${documents.length}`,
            done: documents.length > 0,
            tab: 'documents',
          },
          {
            label: 'Tax Profile',
            value: profile ? 'Configured' : 'Pending',
            done: !!profile,
            tab: 'profile',
          },
          {
            label: 'Questions',
            value: unansweredQuestions > 0 ? `${unansweredQuestions} open` : 'Complete',
            done: unansweredQuestions === 0 && !!profile,
            tab: 'questions',
          },
          {
            label: 'Calculation',
            value: calculation ? 'Computed' : 'Pending',
            done: !!calculation,
            tab: 'calculation',
          },
        ].map(item => (
          <button
            key={item.label}
            onClick={() => setActiveTab(item.tab)}
            className={`p-3 rounded-xl border text-center transition-all hover:shadow-xs cursor-pointer ${
              item.done ? 'bg-green-50/60 border-green-200 text-green-900' : 'bg-white border-gray-200 text-gray-700'
            }`}
          >
            <p className="text-xs text-gray-500 font-medium">{item.label}</p>
            <p className={`text-sm font-semibold mt-0.5 ${item.done ? 'text-green-700' : 'text-gray-700'}`}>
              {item.value}
            </p>
          </button>
        ))}
      </div>

      {/* ── Tabs Navigation & Content ───────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid grid-cols-6 w-full bg-gray-100 p-1 rounded-xl">
          <TabsTrigger value="guide" className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold">
            <Sparkles className="h-3.5 w-3.5 text-red-600" />
            AI Guide
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs sm:text-sm font-medium">
            Documents
          </TabsTrigger>
          <TabsTrigger value="profile" className="text-xs sm:text-sm font-medium">
            Tax Profile
          </TabsTrigger>
          <TabsTrigger value="questions" className="relative text-xs sm:text-sm font-medium">
            Questions
            {unansweredQuestions > 0 && (
              <span className="ml-1 bg-red-500 text-white rounded-full text-[10px] w-4 h-4 inline-flex items-center justify-center font-bold">
                {unansweredQuestions}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="calculation" className="text-xs sm:text-sm font-medium">
            Calculation
          </TabsTrigger>
          <TabsTrigger value="review" className="text-xs sm:text-sm font-medium">
            Review &amp; Submit
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: AI Submission Guide */}
        <TabsContent value="guide" className="space-y-4">
          <AiSubmissionGuide
            taxReturnId={id}
            onSelectTab={setActiveTab}
            onOpenChatWithPrompt={prompt => setAssistantPrompt(prompt)}
          />
        </TabsContent>

        {/* Tab 2: Documents */}
        <TabsContent value="documents" className="space-y-4">
          <DocumentUploader taxReturnId={id} onUploadComplete={loadData} />
          <DocumentList documents={documents} onDelete={loadData} />
        </TabsContent>

        {/* Tab 3: Tax Profile */}
        <TabsContent value="profile">
          {profile ? (
            <TaxProfileViewer profile={profile} taxReturnId={id} onUpdate={loadData} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <p>No tax profile yet. Upload your documents first to extract data automatically.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 4: Questions */}
        <TabsContent value="questions">
          {profile ? (
            <TaxQuestions profile={profile} taxReturnId={id} onUpdate={loadData} />
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-gray-500">
                <p>Upload your documents first to generate clarification questions.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 5: Calculation */}
        <TabsContent value="calculation">
          <TaxCalculationDisplay
            taxReturnId={id}
            calculation={calculation}
            onCalculate={loadData}
          />
        </TabsContent>

        {/* Tab 6: Review & Submit */}
        <TabsContent value="review">
          <FinalReview
            taxReturn={taxReturn}
            profile={profile}
            calculation={calculation}
            onConfirm={loadData}
          />
        </TabsContent>
      </Tabs>

      {/* Floating AI Assistant Chat */}
      <TaxAssistant
        taxReturnId={id}
        initialPrompt={assistantPrompt}
        onClearInitialPrompt={() => setAssistantPrompt(null)}
        onNavigateTab={setActiveTab}
      />
    </div>
  )
}
