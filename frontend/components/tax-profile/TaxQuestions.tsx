'use client'

import { useState } from 'react'
import { CheckCircle, HelpCircle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { TaxProfile } from '@/types'

interface Props {
  profile: TaxProfile
  taxReturnId: string
  onUpdate?: () => void
}

const CATEGORY_LABELS: Record<string, string> = {
  personal: 'Personal details',
  income: 'Income',
  deductions: 'Deductions',
  wealth: 'Wealth',
  other: 'Other',
}

export function TaxQuestions({ profile, taxReturnId, onUpdate }: Props) {
  const { toast } = useToast()
  const [saving, setSaving] = useState(false)
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const q of (profile.questions || []) as any[]) {
      if (q.answer) initial[q.id] = q.answer
    }
    return initial
  })

  const questions = (profile.questions || []) as any[]
  const answered = questions.filter(q => answers[q.id] || q.is_answered).length
  const total = questions.length
  const progress = total > 0 ? (answered / total) * 100 : 100

  // Group by category
  const grouped = questions.reduce((acc: Record<string, any[]>, q: any) => {
    const cat = q.category || 'other'
    acc[cat] = acc[cat] || []
    acc[cat].push(q)
    return acc
  }, {})

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.taxProfile.answerQuestions(taxReturnId, answers)
      toast({ title: 'Answers saved', description: 'Your tax profile is being updated.' })
      onUpdate?.()
    } catch {
      toast({ title: 'Could not save answers', variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  if (questions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
          <p className="font-medium text-gray-900">No open questions</p>
          <p className="text-sm text-gray-500 mt-1">
            All required information has been extracted from your documents.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Progress */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex justify-between text-sm mb-2">
            <span className="font-medium">{answered} of {total} questions answered</span>
            <span className="text-gray-500">{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Questions grouped by category */}
      {Object.entries(grouped).map(([category, qs]) => (
        <Card key={category}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <HelpCircle className="h-4 w-4 text-red-500" />
              {CATEGORY_LABELS[category] || category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {(qs as any[]).map((q: any) => {
              const isAnswered = !!(answers[q.id] || q.is_answered)
              return (
                <div key={q.id} className={`p-4 rounded-lg border transition-colors ${isAnswered ? 'border-green-200 bg-green-50' : 'border-gray-200'}`}>
                  <div className="flex items-start gap-2 mb-2">
                    {isAnswered
                      ? <CheckCircle className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      : <HelpCircle className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                    }
                    <p className="text-sm font-medium text-gray-800">{q.question}</p>
                  </div>
                  <input
                    type="text"
                    value={answers[q.id] || ''}
                    onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                    placeholder="Your answer..."
                    className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500
                      ${isAnswered ? 'border-green-300 bg-white' : 'border-gray-300'}`}
                  />
                </div>
              )
            })}
          </CardContent>
        </Card>
      ))}

      <Button onClick={handleSave} disabled={saving} className="w-full bg-red-600 hover:bg-red-700">
        {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Saving...</> : 'Save answers'}
      </Button>
    </div>
  )
}
