'use client'

import { useEffect, useState } from 'react'
import {
  CheckCircle2, AlertCircle, Clock, ArrowRight, Download,
  Sparkles, FileText, TrendingDown, HelpCircle, RefreshCw, Send, ShieldCheck
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { api } from '@/lib/api'
import { AiTaxGuideResponse } from '@/types'

interface ChecklistItem {
  id: string
  title: string
  description: string
  status: 'completed' | 'in_progress' | 'action_needed' | 'optional'
  action_tab: string
}

interface DeductionOpportunity {
  code: string
  title: string
  description: string
  estimated_saving_chf?: number
  status: 'claimed' | 'available' | 'not_applicable'
}

interface CantonalSubmissionGuide {
  tax_return_id: string
  canton_code: string
  canton_name: string
  tax_year: number
  readiness_score: number
  phase_title: string
  next_recommended_action: string
  next_tab: string
  checklist: ChecklistItem[]
  deduction_opportunities: DeductionOpportunity[]
  official_submission_instructions: string
}

interface Props {
  taxReturnId: string
  onSelectTab: (tab: string) => void
  onOpenChatWithPrompt?: (prompt: string) => void
}

export function AiSubmissionGuide({ taxReturnId, onSelectTab, onOpenChatWithPrompt }: Props) {
  const [guide, setGuide] = useState<AiTaxGuideResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadGuide = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await api.aiAssistant.getGuide(taxReturnId)
      setGuide(data)
    } catch {
      setError('Einreichungs-Leitfaden konnte nicht geladen werden.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadGuide()
  }, [taxReturnId])

  if (loading) {
    return (
      <Card className="border-emerald-100 shadow-sm">
        <CardContent className="py-12 flex flex-col items-center justify-center text-center space-y-3">
          <div className="h-10 w-10 rounded-full bg-emerald-50 flex items-center justify-center text-primary animate-spin">
            <RefreshCw className="h-5 w-5" />
          </div>
          <p className="text-sm font-medium text-slate-700">
            SunTax analysiert dein Steuerprofil und deine Einreichungsbereitschaft...
          </p>
        </CardContent>
      </Card>
    )
  }

  if (error || !guide) {
    return (
      <Card className="border-slate-200">
        <CardContent className="py-8 flex flex-col items-center justify-center text-center space-y-3">
          <AlertCircle className="h-8 w-8 text-rose-500" />
          <p className="text-sm text-slate-600">{error || 'Leitfaden aktuell nicht verfügbar.'}</p>
          <Button variant="outline" size="sm" onClick={loadGuide}>
            Erneut versuchen
          </Button>
        </CardContent>
      </Card>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-emerald-700 bg-emerald-50 border-emerald-200'
    if (score >= 50) return 'text-amber-700 bg-amber-50 border-amber-200'
    return 'text-rose-700 bg-rose-50 border-rose-200'
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0" />
      case 'in_progress':
        return <Clock className="h-5 w-5 text-amber-500 flex-shrink-0" />
      case 'action_needed':
        return <AlertCircle className="h-5 w-5 text-rose-500 flex-shrink-0" />
      default:
        return <div className="h-5 w-5 rounded-full border-2 border-slate-300 flex-shrink-0" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero Readiness Card */}
      <Card className="border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/20 to-white shadow-sm overflow-hidden">
        <CardHeader className="pb-3 border-b border-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-primary text-white shadow-sm">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  Einreichungs-Leitfaden
                  <Badge variant="outline" className="text-xs bg-white text-slate-600">
                    Kanton {guide.canton_name} · Steuerjahr {guide.tax_year}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-slate-500">
                  Schritt-für-Schritt-Prüfung zur korrekten Selbstdeklaration gemäss Art. 110 DBG
                </CardDescription>
              </div>
            </div>

            {/* Score Badge */}
            <div className={`px-4 py-2 rounded-xl border font-bold text-sm flex items-center gap-2 ${getScoreColor(guide.readiness_score)}`}>
              <span>Bereitschaft:</span>
              <span className="text-lg">{guide.readiness_score}%</span>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500 font-medium">
              <span>{guide.phase_title}</span>
              <span>{guide.readiness_score >= 100 ? 'Bereit zum Einreichen' : `Noch ${100 - guide.readiness_score}% offen`}</span>
            </div>
            <Progress value={guide.readiness_score} className="h-2.5 bg-slate-100" />
          </div>

          {/* AI Recommended Next Action Callout */}
          <div className="p-4 rounded-xl bg-white border border-emerald-200 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-emerald-50 px-2 py-0.5 rounded">
                  Empfohlener nächster Schritt
                </span>
              </div>
              <p className="text-sm font-medium text-slate-900">
                {guide.next_recommended_action}
              </p>
            </div>
            <Button
              onClick={() => onSelectTab(guide.next_tab)}
              className="bg-primary hover:bg-primary-600 text-white shadow-sm flex-shrink-0"
              size="sm"
            >
              Weiter zu {guide.next_tab.charAt(0).toUpperCase() + guide.next_tab.slice(1)}
              <ArrowRight className="h-4 w-4 ml-1.5" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grid: Submission Checklist & Deductions Radar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 spans): Interactive Checklist */}
        <div className="lg:col-span-2 space-y-4">
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base font-bold text-slate-900">
                    Einreichungs-Checkliste
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Erfülle alle Pflichtschritte, um die amtlichen Unterlagen herunterzuladen
                  </CardDescription>
                </div>
                <Badge variant="outline" className="text-xs">
                  {guide.checklist.filter(c => c.status === 'completed').length} / {guide.checklist.length} Erledigt
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {guide.checklist.map(item => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-colors flex items-start justify-between gap-3 ${
                    item.status === 'completed'
                      ? 'bg-emerald-50/40 border-emerald-200/70'
                      : item.status === 'action_needed'
                      ? 'bg-rose-50/30 border-rose-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(item.status)}
                    <div className="space-y-0.5">
                      <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                      <p className="text-xs text-slate-600 leading-relaxed">{item.description}</p>
                    </div>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onSelectTab(item.action_tab)}
                    className="text-xs text-primary hover:text-primary-600 hover:bg-emerald-50 flex-shrink-0"
                  >
                    Öffnen
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Official Cantonal Submission Guide */}
          <Card className="bg-slate-50/60 border-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Amtliche Einreichungshinweise ({guide.canton_name})
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-xs text-slate-600 space-y-2 whitespace-pre-line leading-relaxed">
                {guide.official_submission_instructions}
              </div>
              <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectTab('review')}
                  className="text-xs text-primary border-emerald-200 hover:bg-emerald-50"
                >
                  <Download className="h-3.5 w-3.5 mr-1 text-primary" />
                  eCH-0119 / eCH-0196 XML
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onSelectTab('review')}
                  className="text-xs text-primary border-emerald-200 hover:bg-emerald-50"
                >
                  <FileText className="h-3.5 w-3.5 mr-1 text-primary" />
                  Zusammenfassung PDF
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column (1 span): Deduction Opportunities & Assistant Prompts */}
        <div className="space-y-6">
          {/* Deductions Radar */}
          <Card className="border-slate-200">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <TrendingDown className="h-4 w-4 text-emerald-600" />
                <CardTitle className="text-base font-bold text-slate-900">
                  Abzugs-Potenzial
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Mögliche Abzüge im Kanton {guide.canton_code}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {guide.deduction_opportunities.map((opp, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border border-slate-100 bg-slate-50/50 space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">{opp.title}</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 ${
                        opp.status === 'claimed'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {opp.status === 'claimed' ? 'Erfasst' : 'Möglich'}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-500 leading-normal">{opp.description}</p>
                  {opp.estimated_saving_chf && (
                    <p className="text-[11px] font-medium text-emerald-700">
                      Geschätzte Ersparnis: ~CHF {opp.estimated_saving_chf.toLocaleString()}
                    </p>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Ask AI Copilot Box */}
          <Card className="border-emerald-100 bg-emerald-50/30">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-4 w-4 text-primary" />
                <CardTitle className="text-sm font-bold text-slate-900">
                  Steuerfragen stellen
                </CardTitle>
              </div>
              <CardDescription className="text-xs">
                Klicke auf eine Frage für direkte Ausfüllhilfe
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                'Wie reiche ich meine Steuererklärung beim Steueramt ein?',
                'Sind alle verfügbaren Abzüge berücksichtigt?',
                'Welche Belege muss ich noch hochladen?',
                'Wie berechnet sich der Steuerbetrag?',
              ].map((promptText, i) => (
                <button
                  key={i}
                  onClick={() => onOpenChatWithPrompt && onOpenChatWithPrompt(promptText)}
                  className="w-full text-left text-xs bg-white hover:bg-emerald-50/80 border border-emerald-100 text-slate-800 p-2.5 rounded-lg transition-colors flex items-center justify-between group shadow-2xs"
                >
                  <span className="line-clamp-1">{promptText}</span>
                  <Send className="h-3 w-3 text-primary opacity-60 group-hover:opacity-100 flex-shrink-0 ml-1.5" />
                </button>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
