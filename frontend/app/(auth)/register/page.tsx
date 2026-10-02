'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, CheckCircle, Lock, Mail, User, ShieldCheck, ArrowRight } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'

const registerSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirm_password: z.string(),
  terms: z.boolean().refine(v => v, 'You must accept the terms of use'),
}).refine(d => d.password === d.confirm_password, {
  message: 'Passwords do not match',
  path: ['confirm_password'],
})

type RegisterForm = z.infer<typeof registerSchema>

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: '8+ chars', ok: password.length >= 8 },
    { label: 'Uppercase', ok: /[A-Z]/.test(password) },
    { label: 'Number', ok: /[0-9]/.test(password) },
  ]
  const score = checks.filter(c => c.ok).length
  const colors = ['bg-red-500', 'bg-amber-400', 'bg-emerald-500']

  if (!password) return null

  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1.5">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < score ? colors[score - 1] : 'bg-slate-800'
            }`}
          />
        ))}
      </div>
      <div className="flex gap-3">
        {checks.map(c => (
          <span
            key={c.label}
            className={`text-[11px] flex items-center gap-1 font-medium ${
              c.ok ? 'text-emerald-400' : 'text-slate-500'
            }`}
          >
            <CheckCircle className="h-3 w-3" /> {c.label}
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

  const { register, handleSubmit, watch, formState: { errors, isSubmitting } } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
  })

  const passwordValue = watch('password', '')

  const onSubmit = async (data: RegisterForm) => {
    try {
      await api.auth.register({
        full_name: data.full_name,
        email: data.email,
        password: data.password,
      })
      setRegistered(true)
    } catch (error: any) {
      const detail = error?.response?.data?.detail
      toast({
        title: 'Registration failed',
        description: typeof detail === 'string' ? detail : 'Please check your information and try again.',
        variant: 'destructive',
      })
    }
  }

  if (registered) {
    return (
      <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
        <CardContent className="pt-10 pb-8 space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-2xl font-bold text-white">Registration Successful!</h2>
          <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
            Your SunTax account is ready. You can now sign in and begin preparing your Swiss tax return.
          </p>
          <Button asChild className="mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold">
            <Link href="/login">Continue to Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-1.5 pb-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Create Account
          </CardTitle>
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
            <ShieldCheck className="h-3 w-3" /> FADP Private
          </span>
        </div>
        <CardDescription className="text-slate-400 text-xs sm:text-sm">
          Get started with AI-assisted Swiss tax filing
        </CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="full_name" className="text-xs font-semibold text-slate-300">
              Full Legal Name
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

          <div className="space-y-1.5">
            <Label htmlFor="email" className="text-xs font-semibold text-slate-300">
              Email Address
            </Label>
            <div className="relative">
              <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="email"
                type="email"
                placeholder="name@example.ch"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('email')}
              />
            </div>
            {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-semibold text-slate-300">
              Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Create strong password"
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
            <PasswordStrength password={passwordValue} />
            {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm_password" className="text-xs font-semibold text-slate-300">
              Confirm Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="confirm_password"
                type="password"
                placeholder="Repeat password"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('confirm_password')}
              />
            </div>
            {errors.confirm_password && <p className="text-xs text-red-400">{errors.confirm_password.message}</p>}
          </div>

          <div className="flex items-start gap-2 pt-1">
            <input
              type="checkbox"
              id="terms"
              className="mt-1 rounded bg-slate-950 border-slate-700 text-red-600 focus:ring-red-500"
              {...register('terms')}
            />
            <label htmlFor="terms" className="text-xs text-slate-400 leading-relaxed">
              I agree to the terms of service and acknowledge the Swiss statutory data protection notice.
            </label>
          </div>
          {errors.terms && <p className="text-xs text-red-400">{errors.terms.message}</p>}

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-600/20 text-sm h-10 mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating account...
              </>
            ) : (
              <>
                Create Account
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="pt-2 pb-6 border-t border-slate-800/80 flex justify-center">
        <p className="text-xs text-slate-400">
          Already have an account?{' '}
          <Link href="/login" className="text-red-400 hover:text-red-300 font-semibold hover:underline">
            Sign In
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
