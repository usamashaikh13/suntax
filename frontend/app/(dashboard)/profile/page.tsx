'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, Trash2, AlertTriangle, CheckCircle,
  User as UserIcon, ShieldCheck,
  Save, KeyRound, Smartphone, Copy, Check
} from 'lucide-react'
import { BRAND } from '@/lib/brand'
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
import { useTranslation } from '@/lib/i18n/LanguageContext'

const profileSchema = z.object({
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
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
  const { t, isGerman, dict } = useTranslation()
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
      toast({ title: dict.profile.toast2faStartError, variant: 'destructive' })
    }
  }

  const handleConfirm2fa = async () => {
    if (!totpCode.trim()) return
    setVerifyingTotp(true)
    try {
      await api.auth.verify2fa(totpCode.trim())
      toast({ title: dict.profile.toast2faEnabled, description: isGerman ? 'Die Zwei-Faktor-Authentifizierung ist jetzt aktiv.' : 'Two-factor authentication is now active.' })
      setShowTotpSetupModal(false)
      setTotpCode('')
      setTotpSetup(null)
      const u = await api.auth.getMe()
      setUser(u)
      const s = await api.auth.getSecurityStatus()
      setSecurityStatus(s)
    } catch (err: any) {
      toast({
        title: dict.profile.toast2faConfirmError,
        description: err?.response?.data?.detail || (isGerman ? 'Ungültiger Code. Bitte versuche es erneut.' : 'Invalid code. Please try again.'),
        variant: 'destructive',
      })
    } finally {
      setVerifyingTotp(false)
    }
  }

  const handleDisable2fa = async () => {
    const password = window.prompt(isGerman ? 'Gib dein Kontopasswort ein, um 2FA zu deaktivieren:' : 'Enter your password to disable 2FA:')
    if (!password) return
    try {
      await api.auth.disable2fa(password)
      toast({ title: dict.profile.toast2faDisabled, description: isGerman ? 'Die Zwei-Faktor-Authentifizierung wurde entfernt.' : 'Two-factor authentication was disabled.' })
      const u = await api.auth.getMe()
      setUser(u)
      const s = await api.auth.getSecurityStatus()
      setSecurityStatus(s)
    } catch (err: any) {
      toast({
        title: dict.profile.toast2faDisableError,
        description: err?.response?.data?.detail || (isGerman ? 'Falsches Passwort.' : 'Incorrect password.'),
        variant: 'destructive',
      })
    }
  }

  const onProfileSave = async (data: ProfileForm) => {
    try {
      const updated = await api.auth.updateProfile(data)
      setUser(updated)
      toast({ title: dict.profile.toastProfileSaved })
    } catch {
      toast({ title: dict.profile.toastProfileError, variant: 'destructive' })
    }
  }

  const onPasswordChange = async (data: PasswordForm) => {
    try {
      await api.auth.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      passwordForm.reset()
      toast({ title: dict.profile.toastPasswordSaved })
    } catch (error: any) {
      toast({
        title: isGerman ? 'Passwortänderung fehlgeschlagen' : 'Password update failed',
        description: error?.response?.data?.detail || (isGerman ? 'Bitte überprüfe dein aktuelles Passwort.' : 'Please check your current password.'),
        variant: 'destructive',
      })
    }
  }

  const handleDeleteAccount = async () => {
    const password = window.prompt(
      isGerman
        ? 'Gib dein Passwort ein, um dein Konto und alle Steuererklärungen endgültig zu löschen:'
        : 'Enter your password to permanently delete your account and all tax declarations:'
    )
    if (!password) return
    try {
      await api.auth.deleteAccount(password)
      clearTokens()
      toast({ title: isGerman ? 'Konto endgültig gelöscht' : 'Account permanently deleted' })
      router.push('/')
    } catch {
      toast({ title: isGerman ? 'Löschen fehlgeschlagen' : 'Deletion failed', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <p className="text-xs text-slate-500 font-medium">{dict.common.loading}</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">{dict.profile.title}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {dict.profile.subtitle}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left Column: Profile Card Overview */}
        <div className="md:col-span-1 space-y-4">
          <Card className="border-slate-200/90 shadow-sm overflow-hidden">
            <div className="h-20 bg-gradient-to-r from-emerald-900 to-slate-900 p-4 flex items-end">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-tr from-[#1E7B52] to-emerald-500 border-4 border-white flex items-center justify-center text-lg font-bold text-white shadow-md">
                {user?.full_name?.slice(0, 2).toUpperCase() || 'CH'}
              </div>
            </div>
            <CardContent className="pt-8 pb-5 space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {user?.full_name || (isGerman ? 'Steuerpflichtige Person' : 'Taxpayer')}
                </h3>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{isGerman ? 'Kontostatus' : 'Account Status'}</span>
                  {user?.is_verified ? (
                    <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">
                      {isGerman ? 'Verifiziert' : 'Verified'}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[10px]">
                      {isGerman ? 'Bestätigung ausstehend' : 'Pending Verification'}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{isGerman ? 'Server-Standort' : 'Server Location'}</span>
                  <span className="font-semibold text-slate-800">{isGerman ? 'Schweiz (CH)' : 'Switzerland (CH)'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">{isGerman ? 'Amtliches Format' : 'Official Format'}</span>
                  <span className="font-mono text-[11px] text-slate-600">eCH-0119 / eCH-0196</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Privacy Guarantee */}
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>{isGerman ? 'Schweizer nDSG garantiert' : 'Swiss FDPIC/nDSG Guaranteed'}</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              {isGerman
                ? 'Deine Dokumente und Steuerdaten werden isoliert verschlüsselt gespeichert und niemals für öffentliche KI-Trainingsmodelle genutzt.'
                : 'Your documents and tax data are stored with isolated encryption and never used for public AI training.'}
            </p>
          </div>
        </div>

        {/* Right Column: Forms (2 cols) */}
        <div className="md:col-span-2 space-y-6">
          {/* Personal Information */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <UserIcon className="h-4 w-4 text-primary" />
                {dict.profile.personalDataTitle}
              </CardTitle>
              <CardDescription className="text-xs">
                {dict.profile.personalDataDesc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onProfileSave)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-xs font-semibold text-slate-700">
                    {dict.profile.fullNameLabel}
                  </Label>
                  <Input
                    id="full_name"
                    className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-primary"
                    {...profileForm.register('full_name')}
                  />
                  {profileForm.formState.errors.full_name && (
                    <p className="text-xs text-rose-600">
                      {profileForm.formState.errors.full_name.message}
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-semibold text-slate-700">
                    {dict.profile.emailLabel}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-primary"
                    {...profileForm.register('email')}
                  />
                  {profileForm.formState.errors.email && (
                    <p className="text-xs text-rose-600">
                      {profileForm.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <Button
                  type="submit"
                  size="sm"
                  className="bg-primary hover:bg-primary-600 text-white text-xs font-semibold h-9"
                  disabled={profileForm.formState.isSubmitting}
                >
                  {profileForm.formState.isSubmitting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {dict.profile.saveProfileBtn}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                {dict.profile.passwordTitle}
              </CardTitle>
              <CardDescription className="text-xs">
                {dict.profile.passwordDesc}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordChange)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current_password" className="text-xs font-semibold text-slate-700">
                    {dict.profile.currentPasswordLabel}
                  </Label>
                  <Input
                    id="current_password"
                    type="password"
                    placeholder="••••••••••••"
                    className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-primary"
                    {...passwordForm.register('current_password')}
                  />
                  {passwordForm.formState.errors.current_password && (
                    <p className="text-xs text-rose-600">
                      {passwordForm.formState.errors.current_password.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="new_password" className="text-xs font-semibold text-slate-700">
                      {dict.profile.newPasswordLabel}
                    </Label>
                    <Input
                      id="new_password"
                      type="password"
                      placeholder="••••••••••••"
                      className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-primary"
                      {...passwordForm.register('new_password')}
                    />
                    {passwordForm.formState.errors.new_password && (
                      <p className="text-xs text-rose-600">
                        {passwordForm.formState.errors.new_password.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="confirm_password" className="text-xs font-semibold text-slate-700">
                      {dict.profile.confirmPasswordLabel}
                    </Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      placeholder="••••••••••••"
                      className="text-xs sm:text-sm h-10 border-slate-200 focus:ring-1 focus:ring-primary"
                      {...passwordForm.register('confirm_password')}
                    />
                    {passwordForm.formState.errors.confirm_password && (
                      <p className="text-xs text-rose-600">
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
                  {dict.profile.savePasswordBtn}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Two-Factor Authentication (2FA) */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-primary" />
                  {dict.profile.twoFactorTitle}
                </CardTitle>
                {user?.totp_enabled ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs gap-1">
                    <CheckCircle className="h-3 w-3" /> {dict.profile.twoFactorActiveBadge}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" /> {dict.profile.twoFactorInactiveBadge}
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                {dict.profile.twoFactorDesc}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user?.totp_enabled ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-emerald-900">
                      {isGerman ? 'Dein Konto ist mit Zwei-Faktor-Authentifizierung geschützt' : 'Your account is secured with two-factor authentication'}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      {isGerman ? 'Bei jeder Anmeldung wird ein 6-stelliger TOTP-Code abgefragt.' : 'A 6-digit TOTP code is required on every login.'}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs shrink-0"
                    onClick={handleDisable2fa}
                  >
                    {dict.profile.disable2faBtn}
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">
                      {isGerman ? 'TOTP-Zwei-Faktor-Authentifizierung aktivieren' : 'Enable TOTP Two-Factor Authentication'}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {isGerman ? 'Vom Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) empfohlen.' : 'Recommended by Swiss FDPIC (EDÖB) for financial and tax data.'}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary-600 text-white text-xs shrink-0"
                    onClick={handleStart2faSetup}
                  >
                    {dict.profile.enable2faBtn}
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
                {isGerman ? 'Sicherheits- & EDÖB-Architektur' : 'Security & FDPIC Compliance Architecture'}
              </CardTitle>
              <CardDescription className="text-xs">
                {isGerman ? 'Geprüfte technische und organisatorische Sicherheitsmassnahmen gemäss revidiertem Schweizer Datenschutzgesetz (nDSG).' : 'Audited technical and organizational security controls compliant with revised Swiss Data Protection Act (nDSG).'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{isGerman ? 'Passwort-Hashing' : 'Password Hashing'}</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      Argon2id
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isGerman ? 'Speicherharter Algorithmus zur Abwehr von Brute-Force-Angriffen gemäss BSI/EDÖB-Empfehlung.' : 'Memory-hard algorithm mitigating brute force attacks per BSI/FDPIC recommendations.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{isGerman ? 'Verschlüsselung im Ruhezustand' : 'Encryption at Rest'}</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-emerald-700 border-emerald-300">
                      AES-256-GCM
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isGerman ? 'Mehrschichtige Envelope-Verschlüsselung mit individuellen DEKs pro Dokument.' : 'Multi-layered envelope encryption with unique data encryption keys per document.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{isGerman ? 'Übertragungssicherheit' : 'In-Transit Security'}</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      TLS 1.3 + HSTS
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isGerman ? 'Erzwungene TLS 1.3-Verbindungen mit Perfect Forward Secrecy und HSTS.' : 'Enforced TLS 1.3 connections with Perfect Forward Secrecy and HSTS.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{isGerman ? 'Sitzungsverwaltung' : 'Session Management'}</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      15 Min. Sliding
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isGerman ? 'Kurzlebige Access-Tokens mit automatischer Token-Rotation und sofortiger Sperrung bei Logout.' : 'Short-lived access tokens with automatic rotation and immediate invalidation on logout.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{isGerman ? 'Brute-Force-Schutz' : 'Brute-Force Protection'}</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      5 / 15 Min.
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isGerman ? 'Automatische Kontosperre nach 5 aufeinanderfolgenden fehlerhaften Anmeldeversuchen.' : 'Automatic account lockout after 5 consecutive failed sign-in attempts.'}
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">{isGerman ? 'Deklarationsprinzip' : 'Declaration Principle'}</span>
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
                      Art. 110 DBG
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {isGerman ? 'Selbstdeklaration: Steuerpflichtige Person prüft und übermittelt amtliche Unterlagen selbstständig.' : 'Self-declaration: The taxpayer independently verifies and files their tax return.'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-rose-200 bg-rose-50/20 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-bold text-rose-700 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {dict.profile.deleteAccountTitle}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                {dict.profile.deleteAccountDesc}
              </p>
              {!showDeleteConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs h-8"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {dict.profile.deleteAccountBtn}
                </Button>
              ) : (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-rose-800">
                    {isGerman ? 'Bist du sicher? Dieser Vorgang kann nicht rückgängig gemacht werden.' : 'Are you sure? This action is permanent and irreversible.'}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs text-slate-600"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      {dict.common.cancel}
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                      onClick={handleDeleteAccount}
                    >
                      {isGerman ? 'Ja, alles endgültig löschen' : 'Yes, permanently delete'}
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
              <ShieldCheck className="h-5 w-5 text-primary" />
              {isGerman ? 'Zwei-Faktor-Authentifizierung einrichten' : 'Set Up Two-Factor Authentication'}
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              {isGerman ? `Kopple deine Authenticator-App (z. B. Google Authenticator, 1Password, Bitwarden) mit ${BRAND.name}.` : `Connect your authenticator app (e.g. Google Authenticator, 1Password, Bitwarden) to ${BRAND.name}.`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                {isGerman ? '1. Authenticator-Geheimschlüssel' : '1. Authenticator Setup Key'}
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
                      <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> {dict.profile.copiedKeyBtn}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" /> {dict.profile.copyKeyBtn}
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                {dict.profile.manualKeyDesc}
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <Label htmlFor="setup-totp-code" className="text-xs font-semibold text-slate-700">
                {dict.profile.enterCodeDesc}
              </Label>
              <Input
                id="setup-totp-code"
                type="text"
                maxLength={6}
                placeholder="123456"
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                autoFocus
                className="text-center tracking-widest font-mono text-lg h-11 border-slate-300 focus:ring-primary"
              />
              <p className="text-[11px] text-slate-500">
                {isGerman ? 'Gib den aktuellen 6-stelligen Code aus deiner App ein, um die Einrichtung abzuschliessen.' : 'Enter the current 6-digit code from your app to complete setup.'}
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
              {dict.common.cancel}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={verifyingTotp || totpCode.length < 6}
              className="bg-primary hover:bg-primary-600 text-white text-xs h-9 font-semibold"
              onClick={handleConfirm2fa}
            >
              {verifyingTotp ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> {dict.common.confirm}...
                </>
              ) : (
                dict.profile.enable2faBtn
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
