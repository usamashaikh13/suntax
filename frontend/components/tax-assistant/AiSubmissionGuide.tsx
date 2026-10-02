'use client'

import { useEffect, useState } from 'react'
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  ArrowRight,
  TrendingDown,
  FileText,
  ShieldCheck,
  Send,
  HelpCircle,
  RefreshCw,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { AiTaxGuideResponse, ChecklistItem, DeductionOpportunity } from '@/types'

interface Props {
  taxReturnId: string
  onSelectTab: (tab: string) => void
  onOpenChatWithPrompt?: (prompt: string) => void
}

export function AiSubmissionGuide({
  taxReturnId,
  onSelectTab,
  onOpenChatWithPrompt,
}: Props) {
  const [guide, setGuide] = useState<AiTaxGuideResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGuide = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.aiAssistant.getGuide(taxReturnId)
      setGuide(data)
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Could not load AI submission guide.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGuide()
  }, [taxReturnId])

  if (loading) {
    return (
      <Card className="border-red-100 shadow-sm">
        <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-3">
          <div className="h-10 w-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 animate-spin">
            <RefreshCw className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-gray-700">
            SunTax AI is analyzing your tax profile and submission readiness...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error || !guide) {
    return (
      <Card className="border-red-100">
        <CardContent className="py-8 flex flex-col items-center justify-center text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-red-500" />
          <p className="text-sm text-gray-600">{error || 'Unable to load guidance at this moment.'}</p>
          <Button variant="outline" size="sm" onClick={loadGuide}>
            Try Again
          </Button>
        </CardContent>
      </Card>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600 bg-green-50 border-green-200'
    if (score >= 50) return 'text-amber-600 bg-amber-50 border-amber-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  const getStatusIcon = (status: ChecklistItem['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
      case 'in_progress':
        return <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
      case 'action_needed':
        return <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-gray-300 flex-shrink-0" />
    }
  }

  return (
    <div className="space-y-6">
      {/* ─── Hero Readiness Card ────────────────────────────────────────── */}
      <Card className="border border-red-100 bg-gradient-to-br from-white via-red-50/20 to-white shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-red-600 text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  AI Tax Submission Guide
                  <Badge variant="outline" className="text-xs bg-white text-gray-600">
                    Canton {guide.canton_name} · {guide.tax_year}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-gray-500">
                  Real-time audit &amp; step-by-step assistance to submit your Income Tax Return
                </CardDescription>
              </div>
            </div>

            {/* Score Badge */}
            <div className={`px-4 py-2 rounded-xl border font-bold text-sm flex items-center gap-2 ${getScoreColor(guide.readiness_score)}`}>
              <span>Submission Readiness:</span>
              <span className="text-lg">{guide.readiness_score}%</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-gray-500 font-medium">
              <span>{guide.phase_title}</span>
              <span>{guide.readiness_score >= 100 ? 'Ready to Submit' : `${100 - guide.readiness_score}% remaining`}</span>
            </div>
            <Progress value={guide.readiness_score} className="h-2.5 bg-gray-100" />
          </div>

          {/* AI Recommended Next Action Callout */}
          <div className="p-4 rounded-xl bg-white border border-red-200/80 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-red-600 bg-red-50 px-2 py-0.5 rounded">
                  Next Step Recommended by AI
                </span>
              </div>
              <p className="text-sm font-medium text-gray-900">
                {guide.next_recommended_action}
              </p>
            </div>
            <Button
              onClick={() => onSelectTab(guide.next_tab)}
              className="bg-red-600 hover:bg-red-700 text-white shadow-sm flex-shrink-0"
              size="sm"
            >
              Continue to {guide.next_tab.charAt(0).toUpperCase() + guide.next_tab.slice(1)}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ─── Grid: Submission Checklist & Deductions Radar ────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Interactive Checklist */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-gray-900">
                    Filing Checklist &amp; Verification
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Complete all requirements to finalize and submit to the tax administration
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {guide.checklist.filter(c => c.status === 'completed').length} / {guide.checklist.length} Complete
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {guide.checklist.map(item => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                    item.status === 'completed'
                      ? 'bg-green-50/40 border-green-200/70'
                      : item.status === 'action_needed'
                      ? 'bg-red-50/30 border-red-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(item.status)}
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{item.description}</p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectTab(item.action_tab)}
                    className="text-xs text-red-600 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                  >
                    Open
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Official Cantonal Submission Guide */}
          <Card className="bg-gray-50/60 border-gray-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary-600" />
                Official Filing Procedures ({guide.canton_name})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-gray-600 space-y-2 whitespace-pre-line leading-relaxed">
                {guide.official_submission_instructions}
              </div>
              <div className="mt-4 pt-3 border-t border-gray-200 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectTab('review')}
                  className="text-xs"
                >
                  <Download className="h-3.5 w-3.5 mr-1 text-red-600" />
                  Export eCH-0196 XML
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectTab('review')}
                  className="text-xs"
                >
                  <FileText className="h-3.5 w-3.5 mr-1 text-red-600" />
                  Download Summary PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 span): Deduction Opportunities & AI Assistant Prompts */}
        <div className="space-y-6">
          {/* Deductions Radar */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-green-600" />
                <CardTitle className="text-base font-bold text-gray-900">
                  Tax Optimization Radar
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Key deductions applicable in Canton {guide.canton_code}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {guide.deduction_opportunities.map((opp, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-gray-100 bg-gray-50/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-gray-900">{opp.title}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        opp.status === 'claimed'
                          ? 'bg-green-50 text-green-700 border-green-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {opp.status === 'claimed' ? 'Applied' : 'Opportunity'}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500 leading-normal">{opp.description}</p>
                  {opp.estimated_saving_chf && (
                    <p className="text-[11px] font-medium text-green-600">
                      Estimated tax saving: ~CHF {opp.estimated_saving_chf.toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Ask AI Copilot Box */}
          <Card className="border-red-100 bg-red-50/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-red-600" />
                <CardTitle className="text-sm font-bold text-gray-900">
                  Ask AI Tax Copilot
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Click any prompt to get instant guidance on your tax return
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                'How do I submit my tax return to the tax office?',
                'Are all my available deductions accounted for?',
                'What documents do I still need to upload?',
                'Explain how my total tax was calculated',
              ].map((promptText, i) => (
                <button
                  key={i}
                  onClick={() => onOpenChatWithPrompt && onOpenChatWithPrompt(promptText)}
                  className="w-full text-left text-xs bg-white hover:bg-red-50/80 border border-red-100 text-gray-800 p-2.5 rounded-lg transition-colors flex items-center justify-between group shadow-2xs"
                >
                  <span className="line-clamp-1">{promptText}</span>
                  <Send className="h-3 w-3 text-red-500 opacity-60 group-hover:opacity-100 flex-shrink-0 ml-1.5" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
