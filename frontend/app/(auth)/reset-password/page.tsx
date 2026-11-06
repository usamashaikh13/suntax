'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Eye, EyeOff, Loader2, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'

const schema = z
  .object({
    new_password: z.string().min(10, 'Mindestens 10 Zeichen erforderlich').regex(/[0-9]/, 'Mindestens eine Zahl erforderlich'),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Die Passwörter stimmen nicht überein',
    path: ['confirm_password'],
  })

type Form = z.infer<typeof schema>

function ResetPasswordForm() {
  const router = useRouter()
  const { toast } = useToast()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [done, setDone] = useState(false)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({ resolver: zodResolver(schema) })

  useEffect(() => {
    if (done) {
      const timer = setTimeout(() => router.push('/login'), 2000)
      return () => clearTimeout(timer)
    }
  }, [done, router])

  const onSubmit = async (data: Form) => {
    if (!token) {
      toast({
        title: 'Ungültiger Link',
        description: 'Der Link zum Zurücksetzen des Passworts ist ungültig oder abgelaufen.',
        variant: 'destructive',
      })
      return
    }

    try {
      await api.auth.resetPassword(token, data.new_password)
      setDone(true)
      toast({
        title: 'Passwort geändert',
        description: 'Dein Passwort wurde erfolgreich aktualisiert. Du wirst zur Anmeldung weitergeleitet.',
      })
    } catch (err: any) {
      toast({
        title: 'Fehler',
        description: err?.response?.data?.detail || 'Passwort konnte nicht zurückgesetzt werden.',
        variant: 'destructive',
      })
    }
  }

  if (done) {
    return (
      <div className="text-center py-4 space-y-4">
        <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-[#1E7B52] flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">
          Passwort zurückgesetzt!
        </h2>
        <p className="text-sm text-[#666666] leading-relaxed max-w-sm mx-auto">
          Dein neues Passwort ist nun aktiv. Du wirst in wenigen Sekunden zur Anmeldung weitergeleitet.
        </p>
        <div className="pt-2">
          <Link
            href="/login"
            className="inline-flex items-center justify-center min-h-[46px] px-6 rounded-xl bg-[#1E7B52] hover:bg-[#165C3D] text-white font-semibold text-sm transition-colors shadow-sm"
          >
            Jetzt anmelden
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#666666] hover:text-[#0A0A0A] transition-colors mb-6"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Zurück zur Anmeldung
      </Link>

      <h2 className="text-[28px] font-bold text-[#0A0A0A] tracking-tight leading-tight">
        Neues Passwort festlegen
      </h2>
      <p className="mt-1.5 text-[#666666] text-[15px]">
        Gib dein neues Passwort ein (mindestens 10 Zeichen mit mindestens einer Zahl).
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold text-[#0A0A0A] mb-1.5">
            Neues Passwort
          </label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Mindestens 10 Zeichen, davon eine Zahl"
              {...register('new_password')}
              className={`w-full h-12 pl-4 pr-11 rounded-xl border bg-white text-[#0A0A0A] text-sm placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all ${
                errors.new_password ? 'border-red-400 focus:ring-red-400' : 'border-[#ECE8DF]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#777777] hover:text-[#0A0A0A] transition-colors p-1"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.new_password && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.new_password.message}</p>
          )}
        </div>

        <div>
          <label className="block text-xs font-semibold text-[#0A0A0A] mb-1.5">
            Passwort bestätigen
          </label>
          <div className="relative">
            <input
              type={showConfirmPw ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Neues Passwort wiederholen"
              {...register('confirm_password')}
              className={`w-full h-12 pl-4 pr-11 rounded-xl border bg-white text-[#0A0A0A] text-sm placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all ${
                errors.confirm_password ? 'border-red-400 focus:ring-red-400' : 'border-[#ECE8DF]'
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPw(!showConfirmPw)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#777777] hover:text-[#0A0A0A] transition-colors p-1"
            >
              {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          {errors.confirm_password && (
            <p className="mt-1 text-xs text-red-600 font-medium">{errors.confirm_password.message}</p>
          )}
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[52px] rounded-2xl bg-[#1E7B52] hover:bg-[#165C3D] disabled:opacity-60 text-white font-semibold text-base transition-colors flex items-center justify-center cursor-pointer shadow-sm mt-3"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Wird gespeichert...
            </>
          ) : (
            'Passwort speichern'
          )}
        </button>
      </form>
    </div>
  )
}

export default function ResetPasswordPage() {
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
          <ResetPasswordForm />
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
