'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
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
import {
  Loader2, AlertCircle, Sparkles, MessageCircle, ChevronRight,
  ShieldCheck, FileText, CheckCircle2, ArrowLeft, Layers
} from 'lucide-react'
import { cn } from '@/lib/utils'

const CANTON_NAMES: Record<string, string> = {
  ZH: 'Zurich', ZG: 'Zug', SZ: 'Schwyz', SG: 'St. Gallen',
  AG: 'Aargau', BE: 'Bern', BS: 'Basel-Stadt', LU: 'Lucerne',
  UR: 'Uri', OW: 'Obwalden', NW: 'Nidwalden', GL: 'Glarus',
  FR: 'Fribourg', SO: 'Solothurn', BL: 'Basel-Landschaft',
  SH: 'Schaffhausen', AR: 'Appenzell Ausserrhoden', AI: 'Appenzell Innerrhoden',
  GR: 'Graubünden', TG: 'Thurgau', TI: 'Ticino', VD: 'Vaud',
  VS: 'Valais', NE: 'Neuchâtel', GE: 'Geneva', JU: 'Jura',
}

const DEFAULT_STATUS_META = { label: 'Draft', badgeClass: 'bg-slate-100 text-slate-700 border-slate-200' }

const STATUS_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  draft: DEFAULT_STATUS_META,
  in_progress: { label: 'In Progress', badgeClass: 'bg-blue-50 text-blue-700 border-blue-200' },
  review: { label: 'Under Review', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  confirmed: { label: 'Confirmed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  exported: { label: 'Exported & Filed', badgeClass: 'bg-purple-50 text-purple-700 border-purple-200' },
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
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="animate-spin rounded-full h-9 w-9 border-2 border-red-600 border-t-transparent" />
        <p className="text-xs font-medium text-slate-500">Loading tax return file...</p>
      </div>
    )
  }

  if (!taxReturn) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-red-600">
        <AlertCircle className="h-8 w-8" />
        <p className="text-sm font-semibold">Tax return record not found.</p>
        <Button asChild variant="outline" size="sm">
          <Link href="/tax-returns">Back to Returns</Link>
        </Button>
      </div>
    )
  }

  const unansweredQuestions = (profile?.questions || []).filter((q: any) => !q.is_answered).length
  const statusMeta = STATUS_CONFIG[String(taxReturn.status)] || DEFAULT_STATUS_META
  const cantonName = CANTON_NAMES[taxReturn.canton_code] || taxReturn.canton_code

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* ── Breadcrumb & Top Bar ────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
        <Link href="/tax-returns" className="hover:text-slate-900 transition-colors flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Tax Returns
        </Link>
        <span>/</span>
        <span className="text-slate-900 font-semibold">{cantonName} {taxReturn.tax_year}</span>
      </div>

      {/* ── Header Card ─────────────────────────────────────────────────── */}
      <div className="p-6 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4">
          <div className="h-14 w-14 rounded-2xl bg-slate-900 text-white font-black text-lg flex items-center justify-center shadow-md flex-shrink-0">
            {taxReturn.canton_code}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
                {cantonName} – {taxReturn.municipality_name}
              </h2>
              <span className={cn('text-xs font-semibold px-2.5 py-0.5 rounded-full border', statusMeta.badgeClass)}>
                {statusMeta.label}
              </span>
            </div>
            <div className="flex items-center gap-2.5 text-xs text-slate-500 font-medium">
              <span>Tax Assessment Year {taxReturn.tax_year}</span>
              <span>•</span>
              <span>BFS Commune #{taxReturn.municipality_code}</span>
              <span>•</span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5" /> ESTV Rules Active
              </span>
            </div>
          </div>
        </div>

        {/* AI Action Buttons */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setActiveTab('guide')}
            className="border-red-200 text-red-700 bg-red-50/60 hover:bg-red-50 flex items-center gap-1.5 text-xs font-semibold h-9 px-3.5"
          >
            <Sparkles className="h-3.5 w-3.5 text-red-600" />
            AI Roadmap
          </Button>
          <Button
            size="sm"
            onClick={() => setAssistantPrompt('How do I submit my tax return to the cantonal tax authority?')}
            className="bg-red-600 hover:bg-red-700 text-white flex items-center gap-1.5 text-xs font-semibold h-9 px-3.5 shadow-sm shadow-red-600/20"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Ask AI Copilot
          </Button>
        </div>
      </div>

      {/* ── Progress Overview Cards ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          {
            label: 'Tax Slips Vault',
            value: `${documents.filter(d => d.processing_status === 'done' || d.processing_status === 'completed').length}/${documents.length} verified`,
            done: documents.length > 0,
            tab: 'documents',
          },
          {
            label: 'Extracted Profile',
            value: profile ? 'Numbers Verified' : 'Pending Upload',
            done: !!profile,
            tab: 'profile',
          },
          {
            label: 'Clarification Qs',
            value: unansweredQuestions > 0 ? `${unansweredQuestions} open` : 'All Answered',
            done: unansweredQuestions === 0 && !!profile,
            tab: 'questions',
          },
          {
            label: 'Tax Calculation',
            value: calculation ? 'ESTV Finalized' : 'Ready to Run',
            done: !!calculation,
            tab: 'calculation',
          },
        ].map(item => (
          <button
            key={item.label}
            onClick={() => setActiveTab(item.tab)}
            className={cn(
              'p-3.5 rounded-xl border text-left transition-all duration-150 hover:shadow-xs cursor-pointer',
              item.done
                ? 'bg-emerald-50/50 border-emerald-200/80 text-emerald-950'
                : 'bg-white border-slate-200 text-slate-800 hover:border-slate-300'
            )}
          >
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-slate-500 font-medium">{item.label}</p>
              {item.done && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            </div>
            <p className={cn('text-xs sm:text-sm font-bold mt-1', item.done ? 'text-emerald-700' : 'text-slate-800')}>
              {item.value}
            </p>
          </button>
        ))}
      </div>

      {/* ── Tabs Navigation & Content ───────────────────────────────────── */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid grid-cols-3 sm:grid-cols-6 w-full bg-slate-100 p-1 rounded-xl h-auto gap-1">
          <TabsTrigger value="guide" className="flex items-center gap-1.5 text-xs font-semibold py-2">
            <Sparkles className="h-3.5 w-3.5 text-red-600" />
            AI Guide
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs font-semibold py-2">
            Documents ({documents.length})
          </TabsTrigger>
          <TabsTrigger value="profile" className="text-xs font-semibold py-2">
            Tax Profile
          </TabsTrigger>
          <TabsTrigger value="questions" className="relative text-xs font-semibold py-2">
            Questions
            {unansweredQuestions > 0 && (
              <span className="ml-1.5 bg-red-600 text-white rounded-full text-[10px] w-4 h-4 inline-flex items-center justify-center font-bold">
                {unansweredQuestions}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="calculation" className="text-xs font-semibold py-2">
            Calculation
          </TabsTrigger>
          <TabsTrigger value="review" className="text-xs font-semibold py-2">
            Review &amp; Export
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
            <Card className="border-slate-200">
              <CardContent className="py-16 text-center text-slate-500 space-y-3">
                <FileText className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">No tax profile generated yet</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Upload your tax documents (salary certificate, bank statement, pillar 3a) to populate your profile automatically.
                </p>
                <Button size="sm" onClick={() => setActiveTab('documents')} className="bg-red-600 hover:bg-red-700 text-white text-xs">
                  Upload Documents
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Tab 4: Questions */}
        <TabsContent value="questions">
          {profile ? (
            <TaxQuestions profile={profile} taxReturnId={id} onUpdate={loadData} />
          ) : (
            <Card className="border-slate-200">
              <CardContent className="py-16 text-center text-slate-500 space-y-3">
                <FileText className="h-10 w-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-800">No clarification questions pending</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  The AI tax engine automatically generates deduction questions once your tax documents are uploaded.
                </p>
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
