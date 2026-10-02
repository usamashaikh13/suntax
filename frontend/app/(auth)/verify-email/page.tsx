'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, Loader2, ArrowRight } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
      <CardContent className="pt-10 pb-8 space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-red-500 mx-auto" />
            <p className="text-slate-300 font-medium">Verifying your email address...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="h-16 w-16 rounded-2xl bg-emerald-950/60 border border-emerald-800/40 text-emerald-400 flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Email Verified!</h2>
            <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
              Your account is now active and ready. You can sign in to begin your Swiss tax declaration.
            </p>
            <Button asChild className="mt-2 bg-red-600 hover:bg-red-700 text-white font-semibold">
              <Link href="/login">
                Go to Sign In <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="h-16 w-16 rounded-2xl bg-red-950/60 border border-red-800/40 text-red-400 flex items-center justify-center mx-auto shadow-sm">
              <XCircle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-white">Verification Failed</h2>
            <p className="text-slate-400 text-sm max-w-sm mx-auto leading-relaxed">
              The verification link may have expired or is invalid. Please request a new link or try registering again.
            </p>
            <Button asChild variant="outline" className="mt-2 border-slate-700 text-slate-200 hover:bg-slate-800">
              <Link href="/register">Back to Registration</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <Card className="w-full bg-slate-900/90 border border-slate-800 text-slate-100 shadow-2xl backdrop-blur-xl text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-red-500 mx-auto" />
            <p className="text-slate-400 text-sm">Verifying...</p>
          </CardContent>
        </Card>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
