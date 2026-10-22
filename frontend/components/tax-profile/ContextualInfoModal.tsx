'use client'

import React, { useState } from 'react'
import { Info, HelpCircle, X, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

export interface QuestionInfoTextData {
  question_key: string
  title_de: string
  why_we_ask: string
  what_counts: string
  example: string
  tip_text?: string | null
  tip_type?: string | null // 'missed_deduction' | 'warning'
}

interface Props {
  info?: QuestionInfoTextData | null
  title?: string
}

export function ContextualInfoModal({ info, title }: Props) {
  const [isOpen, setIsOpen] = useState(false)

  if (!info) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors ml-1.5 focus:outline-hidden"
        title="Steuer-Info & Hinweise anzeigen"
        aria-label="Steuer-Info & Hinweise anzeigen"
      >
        <span className="text-[11px] font-bold font-serif italic">i</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-red-100 text-red-600 flex items-center justify-center font-bold">
                  <Info className="h-4 w-4" />
                </div>
                <h3 className="font-extrabold text-slate-900 text-sm sm:text-base">
                  {info.title_de || title || 'Steuer-Erklärung & Ausfüllhilfe'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="h-8 w-8 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 flex items-center justify-center transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* 3 Standardized Sections (Milestone 2 Part B5) */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto text-xs sm:text-sm">
              {/* 1. Warum wir fragen */}
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-red-600">
                  1. Warum wir fragen
                </h4>
                <p className="text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-150">
                  {info.why_we_ask}
                </p>
              </div>

              {/* 2. Was zählt und was nicht */}
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-800">
                  2. Was zählt und was nicht
                </h4>
                <p className="text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-150">
                  {info.what_counts}
                </p>
              </div>

              {/* 3. Ein Beispiel */}
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 text-xs uppercase tracking-wider text-slate-800">
                  3. Ein konkretes Beispiel
                </h4>
                <p className="text-slate-700 leading-relaxed bg-emerald-50/60 p-3 rounded-lg border border-emerald-200 text-emerald-950 font-medium">
                  {info.example}
                </p>
              </div>

              {/* Tip / Warning */}
              {info.tip_text && (
                <div className={`p-3 rounded-xl border flex items-start gap-2.5 mt-2 ${
                  info.tip_type === 'warning'
                    ? 'bg-amber-50 border-amber-200 text-amber-950'
                    : 'bg-blue-50 border-blue-200 text-blue-950'
                }`}>
                  {info.tip_type === 'warning' ? (
                    <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  ) : (
                    <Sparkles className="h-4 w-4 text-blue-600 flex-shrink-0 mt-0.5" />
                  )}
                  <div className="text-xs leading-relaxed">
                    <strong>{info.tip_type === 'warning' ? 'Wichtiger Hinweis: ' : 'Steuer-Tipp: '}</strong>
                    {info.tip_text}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-slate-50/80 flex justify-end">
              <Button
                size="sm"
                onClick={() => setIsOpen(false)}
                className="bg-slate-900 hover:bg-slate-800 text-white text-xs h-8 px-4"
              >
                Verstanden
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
