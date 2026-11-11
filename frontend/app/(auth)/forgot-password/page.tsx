'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle2, Loader2, ArrowLeft } from 'lucide-react'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { useTranslation } from '@/lib/i18n/LanguageContext'

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
})

type Form = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const { toast } = useToast()
  const { t, isGerman, dict } = useTranslation()
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Form) => {
    try {
      await api.auth.forgotPassword(data.email)
      setSent(true)
    } catch {
      toast({
        title: isGerman ? 'Anfrage fehlgeschlagen' : 'Request failed',
        description: isGerman ? 'Bitte versuche es erneut.' : 'Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <div>
      <section className="bg-white border border-[#ECE8DF] rounded-[24px] p-8 sm:p-10 shadow-[0_30px_60px_-45px_rgba(30,30,40,0.35)]">
        {sent ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-[#1E7B52] flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">
              {dict.auth.emailSentTitle}
            </h2>
            <p className="text-sm text-[#666666] leading-relaxed max-w-sm mx-auto">
              {dict.auth.emailSentSub}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center min-h-[46px] px-6 rounded-xl bg-[#1E7B52] hover:bg-[#165C3D] text-white font-semibold text-sm transition-colors shadow-sm"
              >
                {dict.auth.backToLogin}
              </Link>
            </div>
          </div>
        ) : (
          <div>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#666666] hover:text-[#0A0A0A] transition-colors mb-6"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              {dict.auth.backToLogin}
            </Link>

            <h2 className="text-[28px] font-bold text-[#0A0A0A] tracking-tight leading-tight">
              {dict.auth.forgotPasswordTitle}
            </h2>
            <p className="mt-1.5 text-[#666666] text-[15px]">
              {dict.auth.forgotPasswordSub}
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#0A0A0A] mb-1.5">
                  {dict.auth.emailLabel}
                </label>
                <input
                  type="email"
                  autoComplete="email"
                  placeholder={dict.auth.emailPlaceholder}
                  {...register('email')}
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-[#0A0A0A] text-sm placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all ${
                    errors.email ? 'border-red-400 focus:ring-red-400' : 'border-[#ECE8DF]'
                  }`}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.email.message}</p>
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
                    {dict.common.loading}
                  </>
                ) : (
                  dict.auth.sendResetLinkBtn
                )}
              </button>
            </form>
          </div>
        )}
      </section>

      {/* Trust Badges Bar */}
      <p className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-[#777777]">
        <span>🔒 {dict.common.dataResidencyShort}</span>
        <span>{dict.common.flatFeeAmount} – {isGerman ? 'erst beim Einreichen' : 'only upon filing'}</span>
        <span>{dict.common.cantonsCount}</span>
      </p>
    </div>
  )
}
