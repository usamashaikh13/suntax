'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, Trash2, AlertTriangle, CheckCircle, XCircle,
  User as UserIcon, Lock, ShieldCheck, Download, FileSpreadsheet,
  Save, KeyRound, Smartphone, Copy, Check
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/components/ui/toast'
import { api } from '@/lib/api'
import { clearTokens } from '@/lib/auth'
import { User } from '@/types'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Full name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
})

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Please enter your current password'),
    new_password: z.string().min(8, 'Password must be at least 8 characters'),
    confirm_password: z.string(),
  })
  .refine(d => d.new_password === d.confirm_password, {
    message: 'Passwords do not match',
    path: ['confirm_password'],
  })

type ProfileForm = z.infer<typeof profileSchema>
type PasswordForm = z.infer<typeof passwordSchema>

export default function ProfilePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  // 2FA & FDPIC Security State
  const [totpSetup, setTotpSetup] = useState<{ secret: string; provisioning_uri: string } | null>(null)
  const [totpCode, setTotpCode] = useState('')
  const [verifyingTotp, setVerifyingTotp] = useState(false)
  const [showTotpSetupModal, setShowTotpSetupModal] = useState(false)
  const [securityStatus, setSecurityStatus] = useState<any>(null)
  const [copiedSecret, setCopiedSecret] = useState(false)

  const profileForm = useForm<ProfileForm>({ resolver: zodResolver(profileSchema) })
  const passwordForm = useForm<PasswordForm>({ resolver: zodResolver(passwordSchema) })

  useEffect(() => {
    api.auth
      .getMe()
      .then(u => {
        setUser(u)
        profileForm.reset({ full_name: u.full_name || '', email: u.email })
      })
      .finally(() => setLoading(false))

    api.auth.getSecurityStatus().then(setSecurityStatus).catch(() => {})
  }, [])

  const handleStart2faSetup = async () => {
    try {
      const data = await api.auth.setup2fa()
      setTotpSetup(data)
      setShowTotpSetupModal(true)
    } catch {
      toast({ title: 'Could not initiate 2FA setup', variant: 'destructive' })
    }
  }

  const handleConfirm2fa = async () => {
    if (!totpCode.trim()) return
    setVerifyingTotp(true)
    try {
      await api.auth.verify2fa(totpCode.trim())
      toast({ title: '2FA Activated', description: 'Two-Factor Authentication is now active.' })
      setShowTotpSetupModal(false)
      setTotpCode('')
      setTotpSetup(null)
      const u = await api.auth.getMe()
      setUser(u)
      const s = await api.auth.getSecurityStatus()
      setSecurityStatus(s)
    } catch (err: any) {
      toast({
        title: 'Verification Failed',
        description: err?.response?.data?.detail || 'Invalid code. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setVerifyingTotp(false)
    }
  }

  const handleDisable2fa = async () => {
    const password = window.prompt('Enter your account password to confirm disabling 2FA:')
    if (!password) return
    try {
      await api.auth.disable2fa(password)
      toast({ title: '2FA Disabled', description: 'Two-Factor Authentication has been removed.' })
      const u = await api.auth.getMe()
      setUser(u)
      const s = await api.auth.getSecurityStatus()
      setSecurityStatus(s)
    } catch (err: any) {
      toast({
        title: 'Failed to disable 2FA',
        description: err?.response?.data?.detail || 'Incorrect password.',
        variant: 'destructive',
      })
    }
  }

  const onProfileSave = async (data: ProfileForm) => {
    try {
      const updated = await api.auth.updateProfile(data)
      setUser(updated)
      toast({ title: 'Profile updated successfully' })
    } catch {
      toast({ title: 'Could not save profile changes', variant: 'destructive' })
    }
  }

  const onPasswordChange = async (data: PasswordForm) => {
    try {
      await api.auth.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      passwordForm.reset()
      toast({ title: 'Password updated successfully' })
    } catch (error: any) {
      toast({
        title: 'Password change failed',
        description: error?.response?.data?.detail || 'Please verify your current password.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteAccount = async () => {
    const password = window.prompt(
      'Enter your password to permanently delete your account and all associated tax returns:'
    )
    if (!password) return
    try {
      await api.auth.deleteAccount(password)
      clearTokens()
      toast({ title: 'Account permanently deleted' })
      router.push('/')
    } catch {
      toast({ title: 'Account deletion failed', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-600 border-t-transparent" />
        <p className="text-xs text-slate-500 font-medium">Loading account settings...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Account & Security</h2>
        <p className="text-sm text-slate-500 mt-1">
          Manage your personal tax identity, data sovereignty, and Swiss privacy preferences.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Card Overview */}
        <div className="md:col-span-1 space-y-4">
          <Card className="border-slate-200/90 shadow-sm overflow-hidden">
            <div className="h-20 bg-gradient-to-r from-slate-900 to-slate-800 p-4 flex items-end">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-red-600 to-rose-400 border-4 border-white flex items-center justify-center text-lg font-bold text-white shadow-md">
                {user?.full_name?.slice(0, 2).toUpperCase() || 'CH'}
              </div>
            </div>
            <CardContent className="pt-8 pb-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {user?.full_name || 'Swiss Taxpayer'}
                </h3>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Account Status</span>
                  {user?.is_verified ? (
                    <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">
                      Verified
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[10px]">
                      Pending Verification
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Data Location</span>
                  <span className="font-semibold text-slate-800">Switzerland (CH)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Statutory Format</span>
                  <span className="font-mono text-[11px] text-slate-600">eCH-0196 XML</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Privacy Guarantee */}
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Federal FADP Guaranteed</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Your financial documents and tax data are processed in isolation and never used to train third-party public AI models.
            </p>
          </div>
        </div>

        {/* Right Column: Forms (2 cols) */}
        <div className="md:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-red-600" />
                Personal Information
              </CardTitle>
              <CardDescription className="text-xs">
                This legal name appears on your cantonal tax forms and eCH-0196 exports.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onProfileSave)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-xs font-semibold text-slate-700">
                    Full Legal Name
                  </Label>
                  <Input
                    id="full_name"
                    className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-red-600"
                    {...profileForm.register('full_name')}
                  />
                  {profileForm.formState.errors.full_name && (
                    <p className="text-xs text-red-600">
                      {profileForm.formState.errors.full_name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                    Email Address
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-red-600"
                    {...profileForm.register('email')}
                  />
                  {profileForm.formState.errors.email && (
                    <p className="text-xs text-red-600">
                      {profileForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  size="sm"
                  className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold h-9"
                  disabled={profileForm.formState.isSubmitting}
                >
                  {profileForm.formState.isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Save Changes
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-red-600" />
                Security & Password
              </CardTitle>
              <CardDescription className="text-xs">
                Update your account password to protect your tax files.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordChange)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current_password" className="text-xs font-semibold text-slate-700">
                    Current Password
                  </Label>
                  <Input
                    id="current_password"
                    type="password"
                    placeholder="••••••••••••"
                    className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-red-600"
                    {...passwordForm.register('current_password')}
                  />
                  {passwordForm.formState.errors.current_password && (
                    <p className="text-xs text-red-600">
                      {passwordForm.formState.errors.current_password.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new_password" className="text-xs font-semibold text-slate-700">
                      New Password
                    </Label>
                    <Input
                      id="new_password"
                      type="password"
                      placeholder="Min. 8 chars"
                      className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-red-600"
                      {...passwordForm.register('new_password')}
                    />
                    {passwordForm.formState.errors.new_password && (
                      <p className="text-xs text-red-600">
                        {passwordForm.formState.errors.new_password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm_password" className="text-xs font-semibold text-slate-700">
                      Confirm New Password
                    </Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      placeholder="Repeat new password"
                      className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-red-600"
                      {...passwordForm.register('confirm_password')}
                    />
                    {passwordForm.formState.errors.confirm_password && (
                      <p className="text-xs text-red-600">
                        {passwordForm.formState.errors.confirm_password.message}
                      </p>
                    )}
                  </div>
                </div>

                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  className="text-xs font-semibold h-9"
                  disabled={passwordForm.formState.isSubmitting}
                >
                  {passwordForm.formState.isSubmitting && (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  )}
                  Update Password
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Two-Factor Authentication (2FA) */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-red-600" />
                  Two-Factor Authentication (2FA)
                </CardTitle>
                {user?.totp_enabled ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs gap-1">
                    <CheckCircle className="h-3 w-3" /> 2FA Active (TOTP)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" /> Inactive
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Protect your account against unauthorized access using an authenticator app (Google Authenticator, Apple Passwords, Bitwarden, 1Password) conforming to RFC 6238.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user?.totp_enabled ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-emerald-900">
                      Your account is protected with Two-Factor Authentication
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      A 6-digit TOTP code is required on every login to access your tax declarations.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-red-300 text-red-700 hover:bg-red-50 text-xs shrink-0"
                    onClick={handleDisable2fa}
                  >
                    Disable 2FA
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">
                      Enable TOTP Second-Factor Verification
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Recommended under FDPIC guidelines to prevent unauthorized access to sensitive tax records.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 text-white text-xs shrink-0"
                    onClick={handleStart2faSetup}
                  >
                    Enable 2FA (TOTP)
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* FDPIC (EDÖB) & Swiss nDSG Security Architecture */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                Security & FDPIC (EDÖB) Compliance Architecture
              </CardTitle>
              <CardDescription className="text-xs">
                Audited technical and organizational security controls strictly aligned with the Swiss revised Data Protection Act (nDSG).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Password Hashing</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      Argon2id
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Memory-hard algorithm recommended by FDPIC to neutralize brute-force cracking.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">At-Rest & File Encryption</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-emerald-700 border-emerald-300">
                      AES-256-GCM
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Multi-layer envelope encryption with unique DEKs per file and segregated KMS key storage.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">In-Transit Protection</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      TLS 1.3 + HSTS
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Enforced TLS 1.3 with 2-year HSTS preloading and modern forward secrecy ciphers.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Session Security</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      15-Min Sliding
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    15-minute short-lived tokens, Redis sliding sessions, and instant logout token revocation.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Brute-Force Lockout</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      5 Fails / 15 Min
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Automated 15-minute account lockout upon 5 consecutive failed login attempts.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Legal Filing Framework</span>
                    <Badge variant="outline" className="text-[10px] bg-red-50 text-red-700 border-red-300">
                      Art. 110 DBG
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Swiss Selbstdeklaration: taxpayer prepares filing package and submits directly to official portal.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-red-200 bg-red-50/20 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-red-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Permanent Account Deletion
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Permanently purge your account, encrypted documents, and cantonal tax declarations. Under Swiss FADP Art. 32, all records will be deleted immediately.
              </p>
              {!showDeleteConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-red-300 text-red-700 hover:bg-red-50 text-xs h-8"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Delete Account
                </Button>
              ) : (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-red-800">
                    Are you sure? This action is irrevocable.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs text-slate-600"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs bg-red-600 hover:bg-red-700 text-white"
                      onClick={handleDeleteAccount}
                    >
                      Yes, Delete Everything
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 2FA Setup Dialog Modal */}
      <Dialog open={showTotpSetupModal} onOpenChange={setShowTotpSetupModal}>
        <DialogContent className="max-w-md bg-white border border-slate-200 text-slate-900 p-6 rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-red-600" />
              Set Up Two-Factor Authentication
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Pair your authenticator app (e.g. Google Authenticator, Apple Passwords, 1Password, Bitwarden) with SunTax.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                1. Authenticator Secret Key
              </Label>
              <div className="flex items-center gap-2">
                <div className="flex-1 bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 font-mono text-xs tracking-widest text-slate-800 break-all select-all">
                  {totpSetup?.secret || '••••••••••••••••'}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 px-3 text-xs shrink-0"
                  onClick={() => {
                    if (totpSetup?.secret) {
                      navigator.clipboard.writeText(totpSetup.secret)
                      setCopiedSecret(true)
                      setTimeout(() => setCopiedSecret(false), 2000)
                    }
                  }}
                >
                  {copiedSecret ? (
                    <>
                      <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Copy
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Enter this key manually in your authenticator app under &ldquo;Add Account &rarr; Manual Key&rdquo;.
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <Label htmlFor="setup-totp-code" className="text-xs font-semibold text-slate-700">
                2. Enter 6-Digit Verification Code
              </Label>
              <Input
                id="setup-totp-code"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="text-center tracking-widest font-mono text-lg h-11 border-slate-300 focus:ring-red-600"
              />
              <p className="text-[11px] text-slate-500">
                Enter the current 6-digit code shown in your authenticator app to confirm configuration.
              </p>
            </div>
          </div>

          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs h-9"
              onClick={() => {
                setShowTotpSetupModal(false)
                setTotpCode('')
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={verifyingTotp || totpCode.length < 6}
              className="bg-red-600 hover:bg-red-700 text-white text-xs h-9 font-semibold"
              onClick={handleConfirm2fa}
            >
              {verifyingTotp ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Verifying...
                </>
              ) : (
                'Activate 2FA'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
