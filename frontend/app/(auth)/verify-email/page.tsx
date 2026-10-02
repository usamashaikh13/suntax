'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
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
    <Card className="w-full max-w-md text-center">
      <CardContent className="pt-10 pb-8 space-y-4">
        {status === 'loading' && (
          <>
            <Loader2 className="h-12 w-12 animate-spin text-red-600 mx-auto" />
            <p className="text-gray-600">Verifying your email address...</p>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Email verified!</h2>
            <p className="text-gray-600 text-sm">
              Your account is now active. You can sign in.
            </p>
            <Link
              href="/login"
              className="inline-block bg-red-600 hover:bg-red-700 text-white font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Go to Sign In
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold text-gray-900">Verification failed</h2>
            <p className="text-gray-600 text-sm">
              The link may have expired. Please request a new one.
            </p>
            <Link
              href="/register"
              className="inline-block border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium px-6 py-2 rounded-lg transition-colors"
            >
              Back to Sign Up
            </Link>
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
        <Card className="w-full max-w-md text-center">
          <CardContent className="pt-10 pb-8 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-red-600 mx-auto" />
            <p className="text-gray-600">Loading...</p>
          </CardContent>
        </Card>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  )
}
