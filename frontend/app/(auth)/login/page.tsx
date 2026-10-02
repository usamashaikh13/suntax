'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, EyeOff, Loader2, Lock, Mail, ArrowRight, ShieldCheck } from 'lucide-react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { setTokens } from '@/lib/auth'

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})

type LoginForm = z.infer<typeof loginSchema>

export default function LoginPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [showPassword, setShowPassword] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  })

  const onSubmit = async (data: LoginForm) => {
    try {
      const response = await api.auth.login(data)
      setTokens(response.access_token, response.refresh_token)
      toast({
        title: 'Welcome back!',
        description: 'Successfully signed in to SunTax.',
      })
      router.push('/dashboard')
    } catch (error: any) {
      toast({
        title: 'Sign in failed',
        description: error?.response?.data?.detail || 'Invalid email or password. Please try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl">
      <CardHeader className="space-y-1.5 pb-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl sm:text-2xl font-bold tracking-tight text-white">
            Sign In
          </CardTitle>
          <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Lock className="h-3 w-3" /> Secure
          </span>
        </div>
        <CardDescription className="text-slate-400 text-xs sm:text-sm">
          Access your Swiss tax declarations and documents vault
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
                autoComplete="email"
                className="bg-slate-950 border-slate-800 text-slate-100 pl-10 focus:border-red-500 focus:ring-1 focus:ring-red-500 text-sm h-10"
                {...register('email')}
              />
            </div>
            {errors.email && (
              <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <div className="flex justify-between items-center">
              <Label htmlFor="password" className="text-xs font-semibold text-slate-300">
                Password
              </Label>
              <Link href="/forgot-password" className="text-xs text-red-400 hover:text-red-300 hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                autoComplete="current-password"
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
            {errors.password && (
              <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>
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
                Signing in...
              </>
            ) : (
              <>
                Sign In to Account
                <ArrowRight className="h-4 w-4 ml-2" />
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="pt-2 pb-6 border-t border-slate-800/80 flex flex-col gap-3">
        <p className="text-center text-xs text-slate-400">
          Don&apos;t have an account yet?{' '}
          <Link href="/register" className="text-red-400 hover:text-red-300 font-semibold hover:underline">
            Create account
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}
