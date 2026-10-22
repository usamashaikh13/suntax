'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  Eye, EyeOff, Loader2, CheckCircle, Lock, Mail, User, ShieldCheck,
  ArrowRight, KeyRound, Smartphone
} from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'

// Milestone 2 Part B1: Strict password rules & un-ticked AGB/Datenschutz
const registerSchema = z.object({
  full_name: z.string().min(2, 'Name muss mindestens 2 Zeichen lang sein'),
  email: z.string().email('Bitte geben Sie eine gültige E-Mail-Adresse ein'),
  password: z.string()
    .min(8, 'Mindestens 8 Zeichen erforderlich')
    .regex(/[A-Z]/, 'Mindestens ein Grossbuchstabe (A-Z)')
    .regex(/[a-z]/, 'Mindestens ein Kleinbuchstabe (a-z)')
    .regex(/[0-9]/, 'Mindestens eine Ziffer (0-9)')
    .regex(/[^A-Za-z0-9]/, 'Mindestens ein Sonderzeichen (!@#$%^&*...)'),
  confirm_password: z.string(),
  two_factor_method: z.enum(['authenticator', 'email']),
  terms_accepted: z.boolean().refine(v => v === true, 'Sie müssen den AGB zustimmen'),
  privacy_accepted: z.boolean().refine(v => v === true, 'Sie müssen der Datenschutzerklärung zustimmen'),
}).refine(d => d.password === d.confirm_password, {
  message: 'Die Passwörter stimmen nicht überein',
  path: ['confirm_password'],
})

type RegisterForm = z.infer<typeof registerSchema>

function PasswordChecklist({ password }: { password: string }) {
  const checks = [
    { label: 'Min. 8 Zeichen', ok: password.length >= 8 },
    { label: 'Grossbuchstabe (A-Z)', ok: /[A-Z]/.test(password) },
    { label: 'Kleinbuchstabe (a-z)', ok: /[a-z]/.test(password) },
    { label: 'Ziffer (0-9)', ok: /[0-9]/.test(password) },
    { label: 'Sonderzeichen (!?#...)', ok: /[^A-Za-z0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const colors = ['bg-red-500', 'bg-orange-500', 'bg-amber-400', 'bg-blue-400', 'bg-emerald-500']

  if (!password) return null

  return (
    <div className="space-y-2 mt-2">
      <div className="flex gap-1">
        {[0, 1, 2, 3, 4].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score - 1] : 'bg-slate-800'
            }`}
          />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1.5 pt-1">
        {checks.map(c => (
          <span
            key={c.label}
            className={`text-[11px] flex items-center gap-1 font-medium ${
              c.ok ? 'text-emerald-400 font-semibold' : 'text-slate-500'
            }`}
          >
            <CheckCircle className={`h-3 w-3 ${c.ok ? 'text-emerald-400' : 'text-slate-600'}`} />
            {c.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export default function RegisterPage() {
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)
  const [registered, setRegistered] = useState(false)
  const [userEmail, setUserEmail] = useState('')

  const { register, handleSubmit, watch, setValue, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      two_factor_method: 'authenticator',
      terms_accepted: false,
      privacy_accepted: false,
    },
  })

  const passwordValue = watch('password', '')
  const selected2Fa = watch('two_factor_method', 'authenticator')

  const onSubmit = async (data: RegisterForm) => {
    try {
      await api.auth.register({
        full_name: data.full_name,
        email: data.email,
        password: data.password,
      })
      setUserEmail(data.email)
      setRegistered(true)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      toast({
        title: 'Registrierung fehlgeschlagen',
        description: typeof detail === 'string' ? detail : 'Bitte überprüfen Sie Ihre Angaben und versuchen Sie es erneut.',
        variant: 'destructive',
      })
    }
  }

  if (registered) {
    return (
      <Card className="w-full bg-slate-900/95 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
        <CardContent className="pt-10 pb-8 space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Konto erfolgreich erstellt!</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
            Ihr SunTax-Konto für <strong className="text-slate-200">{userEmail}</strong> ist bereit. Sie können sich nun anmelden und Ihre Steuererklärung vorbereiten.
          </p>
          <Button asChild className="mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold">
            <Link href="/login">Weiter zur Anmeldung</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full bg-slate-900/95 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-1.5 pb-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Konto erstellen
          </CardTitle>
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2.5 py-0.5 rounded-full flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> Schweizer nDSG
          </span>
        </div>
        <CardDescription className="text-slate-400 text-xs sm:text-sm">
          Intelligente, sichere Schweizer Steuererklärung nach kantonalem Recht
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Vollständiger Name */}
          <div className="space-y-1.5">
            <Label htmlFor="full_name" className="text-xs font-semibold text-slate-300">
              Vollständiger Vor- und Nachname
            </Label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="full_name"
                placeholder="Marc Schneider"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('full_name')}
              />
            </div>
            {errors.full_name && <p className="text-xs text-red-400">{errors.full_name.message}</p>}
          </div>

          {/* E-Mail Adresse */}
          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-300">
              E-Mail-Adresse
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.ch"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>

          {/* Passwort */}
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-300">
              Passwort
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Sicheres Passwort erstellen"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 pr-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('password')}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <PasswordChecklist password={passwordValue} />
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
          </div>

          {/* Passwort bestätigen */}
          <div className="space-y-1.5">
            <Label htmlFor="confirm_password" className="text-xs font-semibold text-slate-300">
              Passwort wiederholen
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="confirm_password"
                type="password"
                placeholder="Passwort wiederholen"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('confirm_password')}
              />
            </div>
            {errors.confirm_password && <p className="text-xs text-red-400">{errors.confirm_password.message}</p>}
          </div>

          {/* Zwei-Faktor-Authentifizierung (B1 Auswahl) */}
          <div className="space-y-2 pt-1 border-t border-slate-800/80">
            <Label className="text-xs font-semibold text-slate-300 block">
              Zwei-Faktor-Authentifizierung (2FA)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setValue('two_factor_method', 'authenticator')}
                className={`p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all ${
                  selected2Fa === 'authenticator'
                    ? 'border-red-500 bg-red-950/30 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Smartphone className={`h-4 w-4 mt-0.5 ${selected2Fa === 'authenticator' ? 'text-red-400' : 'text-slate-500'}`} />
                <div>
                  <div className="text-xs font-bold leading-tight">Authenticator App</div>
                  <div className="text-[10px] text-slate-400">Google / Microsoft (Empfohlen)</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setValue('two_factor_method', 'email')}
                className={`p-2.5 rounded-lg border text-left flex items-start gap-2 transition-all ${
                  selected2Fa === 'email'
                    ? 'border-red-500 bg-red-950/30 text-white'
                    : 'border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Mail className={`h-4 w-4 mt-0.5 ${selected2Fa === 'email' ? 'text-red-400' : 'text-slate-500'}`} />
                <div>
                  <div className="text-xs font-bold leading-tight">E-Mail-Code</div>
                  <div className="text-[10px] text-slate-400">Bestätigung per E-Mail</div>
                </div>
              </button>
            </div>
          </div>

          {/* Rechtliche Checkboxen (AGB & Datenschutz) - Unchecked by default */}
          <div className="space-y-2.5 pt-2 border-t border-slate-800/80">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="terms_accepted"
                className="mt-1 h-4 w-4 rounded bg-slate-950 border-slate-700 text-red-600 focus:ring-red-500 focus:ring-offset-slate-900"
                {...register('terms_accepted')}
              />
              <label htmlFor="terms_accepted" className="text-xs text-slate-300 leading-relaxed cursor-pointer select-none">
                Ich akzeptiere die{' '}
                <Link href="/terms" target="_blank" className="text-red-400 hover:text-red-300 underline font-medium">
                  Allgemeinen Geschäftsbedingungen (AGB)
                </Link>{' '}
                und anerkenne das schweizerische Selbstdeklarationsprinzip (Art. 110 DBG).
              </label>
            </div>
            {errors.terms_accepted && (
              <p className="text-[11px] text-red-400 pl-6">{errors.terms_accepted.message}</p>
            )}

            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                id="privacy_accepted"
                className="mt-1 h-4 w-4 rounded bg-slate-950 border-slate-700 text-red-600 focus:ring-red-500 focus:ring-offset-slate-900"
                {...register('privacy_accepted')}
              />
              <label htmlFor="privacy_accepted" className="text-xs text-slate-300 leading-relaxed cursor-pointer select-none">
                Ich habe die{' '}
                <Link href="/privacy" target="_blank" className="text-red-400 hover:text-red-300 underline font-medium">
                  Datenschutzerklärung
                </Link>{' '}
                zur Kenntnis genommen und stimme der vertraulichen Verarbeitung nach Schweizer nDSG zu.
              </label>
            </div>
            {errors.privacy_accepted && (
              <p className="text-[11px] text-red-400 pl-6">{errors.privacy_accepted.message}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-600/20 text-sm h-10 mt-3"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Konto wird erstellt...
              </>
            ) : (
              <>
                Kostenlos registrieren
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="pt-2 pb-6 border-t border-slate-800/80 flex justify-center">
        <p className="text-xs text-slate-400">
          Bereits registriert?{' '}
          <Link href="/login" className="text-red-400 hover:text-red-300 font-semibold hover:underline">
            Hier anmelden
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
