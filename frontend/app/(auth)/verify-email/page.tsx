'use client'

import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { api } from '@/lib/api'

export default function VerifyEmailPage() {
  const params = useSearchParams()
  const router = useRouter()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')

  useEffect(() => {
    if (!token) { setStatus('error'); return }
    api.auth.verifyEmail(token)
      .then(() => setStatus('success'))
      .catch(() => setStatus('error'))
  }, [token])

  return (
    <Card className="w-full max-w-md text-center">
      <CardContent className="pt-10 pb-8 space-y-4">
        {status === 'loading' && <><Loader2 className="h-12 w-12 animate-spin text-red-600 mx-auto" /><p>Verifying email...</p></>}
        {status === 'success' && (
          <>
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
            <h2 className="text-xl font-bold">Email verified!</h2>
            <p className="text-gray-600 text-sm">Your account is active. You can now sign in.</p>
            <Button onClick={() => router.push('/login')} className="bg-red-600 hover:bg-red-700">Jetzt anmelden</Button>
          </>
        )}
        {status === 'error' && (
          <>
            <XCircle className="h-16 w-16 text-red-500 mx-auto" />
            <h2 className="text-xl font-bold">Verification failed</h2>
            <p className="text-gray-600 text-sm">The link is invalid or expired. Please register again.</p>
            <Button variant="outline" onClick={() => router.push('/register')}>Erneut registrieren</Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
