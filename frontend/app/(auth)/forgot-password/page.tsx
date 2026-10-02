'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle, Loader2, Mail, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
})
type Form = z.infer<typeof schema>

export default function ForgotPasswordPage() {
  const { toast } = useToast()
  const [sent, setSent] = useState(false)
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({
    resolver: zodResolver(schema),
  })

  const onSubmit = async (data: Form) => {
    try {
      await api.auth.forgotPassword(data.email)
      setSent(true)
    } catch {
      toast({ title: 'Request failed', description: 'Please try again.', variant: 'destructive' })
    }
  }

  if (sent) {
    return (
      <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
        <CardContent className="pt-10 pb-8 space-y-4">
          <div className="h-16 w-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
            <CheckCircle className="h-8 w-8" />
          </div>
          <h2 className="text-xl font-bold text-white">Check Your Email</h2>
          <p className="text-slate-400 text-xs sm:text-sm max-w-sm mx-auto leading-relaxed">
            If an account exists for that email address, you will receive a secure password reset link shortly.
          </p>
          <Button asChild variant="outline" className="border-slate-700 bg-slate-800 text-white hover:bg-slate-700 mt-2">
            <Link href="/login">Back to Sign In</Link>
          </Button>
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
          Enter your registered email to receive recovery instructions
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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
            {errors.email && (
              <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
            )}
          </div>

          <Button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold shadow-lg shadow-red-600/20 text-sm h-10 mt-2"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending Link...
              </>
            ) : (
              <>
                Send Reset Link
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="pt-2 pb-6 border-t border-slate-800/80 flex justify-center">
        <Link href="/login" className="inline-flex items-center text-xs text-slate-400 hover:text-white transition-colors">
          <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
          Back to Sign In
        </Link>
      </CardFooter>
    </Card>
  )
}
