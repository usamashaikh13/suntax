'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'

function VerifyEmailContent() {
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) {
      setStatus('error')
      return
    }
    api.auth
      .verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <div className="text-center py-4 space-y-4">
      {status === 'loading' && (
        <>
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-[#1E7B52] flex items-center justify-center mx-auto">
            <Loader2 className="h-7 w-7 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">E-Mail wird bestätigt...</h2>
          <p className="text-sm text-[#666666]">Bitte warte einen Moment, während wir deinen Link prüfen.</p>
        </>
      )}

      {status === 'success' && (
        <>
          <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-[#1E7B52] flex items-center justify-center mx-auto">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">E-Mail erfolgreich bestätigt!</h2>
          <p className="text-sm text-[#666666] leading-relaxed max-w-sm mx-auto">
            Dein SunTax-Konto ist jetzt aktiv. Du kannst dich nun anmelden und deine Steuererklärung bearbeiten.
          </p>
          <div className="pt-2">
            <Link
              href="/login"
              className="inline-flex items-center justify-center min-h-[46px] px-6 rounded-xl bg-[#1E7B52] hover:bg-[#165C3D] text-white font-semibold text-sm transition-colors shadow-sm"
            >
              Weiter zur Anmeldung
            </Link>
          </div>
        </>
      )}

      {status === 'error' && (
        <>
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-200 text-red-600 flex items-center justify-center mx-auto">
            <XCircle className="h-7 w-7" />
          </div>
          <h2 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">Bestätigung fehlgeschlagen</h2>
          <p className="text-sm text-[#666666] leading-relaxed max-w-sm mx-auto">
            Dieser Bestätigungslink ist ungültig oder bereits abgelaufen. Bitte fordere einen neuen Link an oder melde dich an.
          </p>
          <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center min-h-[46px] px-6 rounded-xl bg-[#1E7B52] hover:bg-[#165C3D] text-white font-semibold text-sm transition-colors shadow-sm"
            >
              Zur Anmeldung
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <div>
      <section className="bg-white border border-[#ECE8DF] rounded-[24px] p-8 sm:p-10 shadow-[0_30px_60px_-45px_rgba(30,30,40,0.35)]">
        <Suspense
          fallback={
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-[#1E7B52]" />
            </div>
          }
        >
          <VerifyEmailContent />
        </Suspense>
      </section>

      {/* Trust Badges Bar */}
      <p className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-[#777777]">
        <span>🔒 Daten in der Schweiz</span>
        <span>CHF 39 – erst beim Einreichen</span>
        <span>Alle 26 Kantone</span>
      </p>
    </div>
  )
}
