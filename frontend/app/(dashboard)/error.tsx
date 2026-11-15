'use client'

import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle, RotateCcw, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('Dashboard flow error:', error)
  }, [error])

  return (
    <div className="max-w-2xl mx-auto my-12 p-8 bg-white rounded-3xl border border-slate-200 shadow-sm text-center space-y-6">
      <div className="h-16 w-16 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-100">
        <AlertCircle className="h-8 w-8" />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-bold text-slate-900">
          Ansicht konnte nicht vollständig geladen werden
        </h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
          Beim Laden dieses Steuerabschnitts ist ein Fehler aufgetreten. Deine bisher erfassten Daten sind sicher in der Schweizer Datenbank gespeichert.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
        <Button
          onClick={() => reset()}
          className="w-full sm:w-auto bg-[#1E7B52] hover:bg-[#165C3D] text-white font-bold text-xs h-11 px-6 rounded-xl"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Schritt neu laden
        </Button>
        <Link href="/dashboard" className="w-full sm:w-auto">
          <Button
            variant="outline"
            className="w-full text-slate-700 font-bold text-xs h-11 px-6 rounded-xl border-slate-300"
          >
            <LayoutDashboard className="h-4 w-4 mr-2" />
            Zurück zur Übersicht
          </Button>
        </Link>
      </div>
    </div>
  )
}
