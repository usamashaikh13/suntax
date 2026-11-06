'use client'

import React, { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  FileText,
  UserCheck,
  ArrowRight
} from 'lucide-react'
import { api } from '@/lib/api'

function PartnerConfirmContent() {
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [returnData, setReturnData] = useState<any>(null)
  const [fullName, setFullName] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Kein Bestätigungstoken übergeben. Bitte verwende den Link aus deiner Einladungs-E-Mail.')
      setLoading(false)
      return
    }

    api.taxReturns.getPartnerReturn(token)
      .then((data: any) => {
        setReturnData(data)
        if (data.partner2_name && data.partner2_name !== 'Partner 2') {
          setFullName(data.partner2_name)
        }
        if (data.already_confirmed) {
          setSuccess(true)
        }
      })
      .catch((err: any) => {
        const msg = err?.response?.data?.detail || 'Ungültiger oder abgelaufener Bestätigungslink.'
        setError(msg)
      })
      .finally(() => setLoading(false))
  }, [token])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !confirmed || !fullName.trim()) return

    setSubmitting(true)
    setError(null)

    try {
      await api.taxReturns.confirmPartnerReturn(token, {
        confirmed: true,
        full_name: fullName.trim(),
      })
      setSuccess(true)
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Bestätigung fehlgeschlagen. Bitte versuche es erneut.'
      setError(msg)
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F6F6F4] flex flex-col items-center justify-center p-4">
        <Loader2 className="h-8 w-8 text-[#1E7B52] animate-spin mb-3" />
        <p className="text-sm text-slate-600 font-medium">Lade Steuererklärungsdaten...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F6F6F4] flex flex-col justify-between py-10 px-4 sm:px-6">
      <div className="max-w-xl w-full mx-auto">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#1E7B52] flex items-center justify-center text-white font-bold text-lg">
              S
            </div>
            <span className="text-2xl font-black tracking-tight text-[#14181F]">
              SunTax<span className="text-[#1E7B52]">.</span>
            </span>
          </Link>
          <div className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[#1E7B52] font-semibold">
            <ShieldCheck className="h-4 w-4" />
            <span>Offizielle Partner-Bestätigung (Art. 113 DBG)</span>
          </div>
        </div>

        {/* Error View */}
        {error && (
          <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-none mt-0.5" />
              <div>
                <h3 className="text-sm font-bold text-red-900">Link nicht gültig</h3>
                <p className="text-xs text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Success View */}
        {success ? (
          <div className="bg-white border border-[#ECECEC] rounded-2xl p-8 shadow-sm text-center">
            <div className="w-14 h-14 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <CheckCircle2 className="h-8 w-8 text-[#1E7B52]" />
            </div>
            <h2 className="text-xl font-bold text-[#14181F]">Bestätigung erfolgreich erfasst</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Vielen Dank! Deine persönliche Bestätigung als Partner/in wurde rechtsgültig gespeichert.
              Die gemeinsame Steuererklärung kann nun finalisiert und eingereicht werden.
            </p>
            {returnData && (
              <div className="mt-6 p-4 bg-[#FAFAF8] rounded-xl border border-slate-200 text-left text-xs text-slate-600 space-y-1">
                <p><span className="font-semibold text-slate-700">Dossier:</span> Steuerjahr {returnData.tax_year} ({returnData.canton_code} – {returnData.municipality_name})</p>
                <p><span className="font-semibold text-slate-700">Partner 1:</span> {returnData.partner1_name}</p>
                <p><span className="font-semibold text-slate-700">Bestätigt durch:</span> {fullName || returnData.partner2_name}</p>
              </div>
            )}
            <div className="mt-8">
              <Link
                href="/"
                className="inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-[#1E7B52] hover:bg-[#165C3D] text-white text-sm font-semibold transition-colors"
              >
                Zurück zur Startseite
              </Link>
            </div>
          </div>
        ) : (
          /* Confirmation Form */
          returnData && (
            <div className="bg-white border border-[#ECECEC] rounded-2xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-lg sm:text-xl font-bold text-[#14181F]">
                Gemeinsame Steuererklärung überprüfen
              </h2>
              <p className="text-xs sm:text-sm text-slate-600 mt-1">
                Dein Partner / deine Partnerin ({returnData.partner1_name}) hat die Steuererklärung für {returnData.tax_year} ausgefüllt.
              </p>

              {/* Dossier Summary Box */}
              <div className="mt-5 p-4 bg-[#FAFAF8] rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-500 font-medium">Kanton & Gemeinde</span>
                  <span className="font-semibold text-slate-800">{returnData.canton_code} – {returnData.municipality_name}</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-500 font-medium">Steuerjahr</span>
                  <span className="font-semibold text-slate-800">{returnData.tax_year}</span>
                </div>
                <div className="flex items-center justify-between text-xs sm:text-sm">
                  <span className="text-slate-500 font-medium">Hauptdeklarant (Partner 1)</span>
                  <span className="font-semibold text-slate-800">{returnData.partner1_name}</span>
                </div>
              </div>

              {/* Art. 113 DBG Explanation */}
              <div className="mt-5 p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200/80 text-xs text-emerald-950 leading-relaxed">
                <p className="font-semibold mb-1 flex items-center gap-1.5 text-emerald-900">
                  <UserCheck className="h-4 w-4 text-[#1E7B52]" />
                  Gesetzliche Bestimmung (Art. 113 DBG)
                </p>
                In der Schweiz müssen verheiratete oder in eingetragener Partnerschaft lebende Paare ihre Steuererklärung gemeinsam einreichen.
                Partner 1 darf nicht stellvertretend für dich unterschreiben. Mit deiner Bestätigung erklärst du deine Angaben als wahrheitsgetreu und vollständig.
              </div>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="fullName" className="block text-xs font-semibold text-slate-700 mb-1">
                    Dein vollständiger Name (Vor- und Nachname)
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="z. B. Petra Muster"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#1E7B52] focus:ring-2 focus:ring-[#1E7B52]/20"
                  />
                </div>

                <label className="flex items-start gap-3 text-xs sm:text-sm text-slate-700 cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    required
                    checked={confirmed}
                    onChange={e => setConfirmed(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E7B52] focus:ring-[#1E7B52]"
                  />
                  <span>
                    Ich bestätige hiermit gemäss Art. 113 DBG die Vollständigkeit und Richtigkeit der Angaben in der gemeinsamen Steuererklärung {returnData.tax_year}.
                  </span>
                </label>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={submitting || !confirmed || !fullName.trim()}
                    className="w-full py-3 px-4 rounded-xl bg-[#1E7B52] hover:bg-[#165C3D] disabled:opacity-50 text-white font-semibold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Bestätigung wird erfasst...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="h-4 w-4" />
                        <span>Jetzt rechtsgültig bestätigen</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-slate-400 mt-10">
        SunTax AG · Schweizer Steuerplattform · Datenschutz gemäss nDSG & Art. 110/113 DBG
      </div>
    </div>
  )
}

export default function PartnerConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F6F6F4] flex items-center justify-center">
          <Loader2 className="h-8 w-8 text-[#1E7B52] animate-spin" />
        </div>
      }
    >
      <PartnerConfirmContent />
    </Suspense>
  )
}
