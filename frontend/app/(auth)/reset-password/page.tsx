'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { CheckCircle, Loader2, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'

const schema = z.object({
  new_password: z.string().min(8, 'Mindestens 8 Zeichen'),
  confirm_password: z.string(),
}).refine(d => d.new_password === d.confirm_password, {
  message: 'Passwords do not match', path: ['confirm_password'],
})
type Form = z.infer<typeof schema>

export default function ResetPasswordPage() {
  const router = useRouter()
  const { toast } = useToast()
  const params = useSearchParams()
  const token = params.get('token') || ''
  const [showPw, setShowPw] = useState(false)
  const [done, setDone] = useState(false)

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: Form) => {
    try {
      await api.auth.resetPassword(token, data.new_password)
      setDone(true)
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.detail || 'The link is invalid or expired.', variant: 'destructive' })
    }
  }

  if (!token) return (
    <Card className="w-full max-w-md text-center">
      <CardContent className="pt-10 pb-8">
        <p className="text-red-600">Invalid reset link. Please request a new link.</p>
      </CardContent>
    </Card>
  )

  if (done) return (
    <Card className="w-full max-w-md text-center">
      <CardContent className="pt-10 pb-8 space-y-4">
        <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
        <h2 className="text-xl font-bold">Password changed</h2>
        <Button onClick={() => router.push('/login')} className="bg-red-600 hover:bg-red-700">Jetzt anmelden</Button>
      </CardContent>
    </Card>
  )

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle className="text-2xl text-center">Set a new password</CardTitle>
        <CardDescription className="text-center">Choose a secure new password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label>New password</Label>
            <div className="relative">
              <Input type={showPw ? 'text' : 'password'} {...register('new_password')} />
              <button type="button" onClick={() => setShowPw(!showPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {errors.new_password && <p className="text-sm text-red-600">{errors.new_password.message}</p>}
          </div>
          <div className="space-y-2">
            <Label>Confirm password</Label>
            <Input type="password" {...register('confirm_password')} />
            {errors.confirm_password && <p className="text-sm text-red-600">{errors.confirm_password.message}</p>}
          </div>
          <Button type="submit" className="w-full bg-red-600 hover:bg-red-700" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save password
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
