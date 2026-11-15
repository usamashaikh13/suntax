'use client'

import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw, Home } from 'lucide-react'
import Link from 'next/link'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Unhandled application exception:', error)
  }, [error])

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl border border-slate-200 shadow-sm p-8 text-center space-y-6">
        <div className="h-16 w-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto border border-red-100">
          <AlertCircle className="h-8 w-8" />
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-slate-900">
            Etwas ist schiefgelaufen / Something went wrong
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Ein unerwarteter Fehler ist aufgetreten. Bitte lade die Seite neu oder kehre zur Übersicht zurück.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            onClick={() => reset()}
            className="w-full sm:w-auto bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-11 px-6 rounded-xl"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Erneut versuchen / Retry
          </Button>
          <Link href="/dashboard" className="w-full sm:w-auto">
            <Button
              variant="outline"
              className="w-full text-slate-700 font-bold text-xs h-11 px-6 rounded-xl border-slate-300"
            >
              <Home className="h-4 w-4 mr-2" />
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
