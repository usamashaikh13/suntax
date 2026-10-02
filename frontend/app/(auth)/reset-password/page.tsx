'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle, Eye, EyeOff, Loader2, Lock, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'

const schema = z
  .object({
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine((d) => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
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
    try {
      await api.auth.resetPassword(token, data.new_password)
      toast({ title: 'Password updated successfully' })
      setDone(true)
    } catch (e: any) {
      toast({
        title: 'Reset failed',
        description: e?.response?.data?.detail || 'The link is invalid or has expired.',
        variant: 'destructive',
      })
    }
  }

  if (!token) {
    return (
      <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
        <CardContent className="pt-10 pb-8">
          <p className="text-red-400 text-sm">Invalid or missing reset token. Please request a new link.</p>
        </CardContent>
      </Card>
    )
  }

  if (done) {
    return (
      <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
        <CardContent className="pt-10 pb-8 space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Password Updated Successfully</h2>
          <p className="text-slate-400 text-sm">Redirecting you to sign in...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-1.5 pb-6">
        <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
          Reset Password
        </CardTitle>
        <CardDescription className="text-slate-400 text-xs sm:text-sm">
          Choose a new secure password for your account
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="new_password" className="text-xs font-semibold text-slate-300">
              New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="new_password"
                type={showPw ? 'text' : 'password'}
                placeholder="At least 8 characters"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 pr-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('new_password')}
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.new_password && (
              <p className="text-xs text-red-400 mt-1">{errors.new_password.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="confirm_password" className="text-xs font-semibold text-slate-300">
              Confirm New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="confirm_password"
                type={showConfirmPw ? 'text' : 'password'}
                placeholder="Repeat new password"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 pr-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('confirm_password')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw(!showConfirmPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200"
              >
                {showConfirmPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.confirm_password && (
              <p className="text-xs text-red-400 mt-1">{errors.confirm_password.message}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-600/20 text-sm h-10 mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating Password...
              </>
            ) : (
              <>
                Update Password
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
          <CardContent className="pt-10 pb-8">
            <Loader2 className="h-8 w-8 animate-spin text-red-600 mx-auto" />
          </CardContent>
        </Card>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
