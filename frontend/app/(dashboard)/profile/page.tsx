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
  full_name: z.string().min(2, 'Der vollständige Name muss mindestens 2 Zeichen lang sein'),
  email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein'),
})

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Bitte gib dein aktuelles Passwort ein'),
    new_password: z.string().min(8, 'Das Passwort muss mindestens 8 Zeichen lang sein'),
    confirm_password: z.string(),
  })
  .refine(d => d.new_password === d.confirm_password, {
    message: 'Passwörter stimmen nicht überein',
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
      toast({ title: '2FA-Einrichtung konnte nicht gestartet werden', variant: 'destructive' })
    }
  }

  const handleConfirm2fa = async () => {
    if (!totpCode.trim()) return
    setVerifyingTotp(true)
    try {
      await api.auth.verify2fa(totpCode.trim())
      toast({ title: '2FA erfolgreich aktiviert', description: 'Die Zwei-Faktor-Authentifizierung ist jetzt aktiv.' })
      setShowTotpSetupModal(false)
      setTotpCode('')
      setTotpSetup(null)
      const u = await api.auth.getMe()
      setUser(u)
      const s = await api.auth.getSecurityStatus()
      setSecurityStatus(s)
    } catch (err: any) {
      toast({
        title: 'Bestätigung fehlgeschlagen',
        description: err?.response?.data?.detail || 'Ungültiger Code. Bitte versuche es erneut.',
        variant: 'destructive',
      })
    } finally {
      setVerifyingTotp(false)
    }
  }

  const handleDisable2fa = async () => {
    const password = window.prompt('Gib dein Kontopasswort ein, um 2FA zu deaktivieren:')
    if (!password) return
    try {
      await api.auth.disable2fa(password)
      toast({ title: '2FA deaktiviert', description: 'Die Zwei-Faktor-Authentifizierung wurde entfernt.' })
      const u = await api.auth.getMe()
      setUser(u)
      const s = await api.auth.getSecurityStatus()
      setSecurityStatus(s)
    } catch (err: any) {
      toast({
        title: 'Fehler beim Deaktivieren',
        description: err?.response?.data?.detail || 'Falsches Passwort.',
        variant: 'destructive',
      })
    }
  }

  const onProfileSave = async (data: ProfileForm) => {
    try {
      const updated = await api.auth.updateProfile(data)
      setUser(updated)
      toast({ title: 'Profil erfolgreich gespeichert' })
    } catch {
      toast({ title: 'Profiländerungen konnten nicht gespeichert werden', variant: 'destructive' })
    }
  }

  const onPasswordChange = async (data: PasswordForm) => {
    try {
      await api.auth.changePassword({
        current_password: data.current_password,
        new_password: data.new_password,
      })
      passwordForm.reset()
      toast({ title: 'Passwort erfolgreich aktualisiert' })
    } catch (error: any) {
      toast({
        title: 'Passwortänderung fehlgeschlagen',
        description: error?.response?.data?.detail || 'Bitte überprüfe dein aktuelles Passwort.',
        variant: 'destructive',
      })
    }
  }

  const handleDeleteAccount = async () => {
    const password = window.prompt(
      'Gib dein Passwort ein, um dein Konto und alle Steuererklärungen endgültig zu löschen:'
    )
    if (!password) return
    try {
      await api.auth.deleteAccount(password)
      clearTokens()
      toast({ title: 'Konto endgültig gelöscht' })
      router.push('/')
    } catch {
      toast({ title: 'Löschen fehlgeschlagen', variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[350px] space-y-3">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        <p className="text-xs text-slate-500 font-medium">Kontoeinstellungen werden geladen...</p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">Konto & Sicherheit</h2>
        <p className="text-sm text-slate-500 mt-1">
          Verwalte deine persönliche Steueridentität, Datensouveränität und Schweizer Datenschutzeinstellungen.
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
                  {user?.full_name || 'Steuerpflichtige Person'}
                </h3>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Kontostatus</span>
                  {user?.is_verified ? (
                    <Badge variant="outline" className="text-emerald-700 bg-emerald-50 border-emerald-200 text-[10px]">
                      Verifiziert
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-amber-700 bg-amber-50 border-amber-200 text-[10px]">
                      Bestätigung ausstehend
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Server-Standort</span>
                  <span className="font-semibold text-slate-800">Schweiz (CH)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Amtliches Format</span>
                  <span className="font-mono text-[11px] text-slate-600">eCH-0119 / eCH-0196</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Privacy Guarantee */}
          <div className="p-4 rounded-xl bg-slate-900 text-white space-y-2 border border-slate-800">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Schweizer nDSG garantiert</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Deine Dokumente und Steuerdaten werden isoliert verschlüsselt gespeichert und niemals für öffentliche KI-Trainingsmodelle genutzt.
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
                Persönliche Angaben
              </CardTitle>
              <CardDescription className="text-xs">
                Dieser Name erscheint auf deiner Steuererklärung und dem eCH-0119-Export.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={profileForm.handleSubmit(onProfileSave)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="full_name" className="text-xs font-semibold text-slate-700">
                    Vollständiger amtlicher Name
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
                    E-Mail-Adresse
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
                  Änderungen speichern
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Change Password */}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                Sicherheit & Passwort
              </CardTitle>
              <CardDescription className="text-xs">
                Aktualisiere dein Passwort zum Schutz deiner Steuerdaten.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={passwordForm.handleSubmit(onPasswordChange)} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="current_password" className="text-xs font-semibold text-slate-700">
                    Aktuelles Passwort
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
                      Neues Passwort
                    </Label>
                    <Input
                      id="new_password"
                      type="password"
                      placeholder="Mind. 8 Zeichen"
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
                      Neues Passwort wiederholen
                    </Label>
                    <Input
                      id="confirm_password"
                      type="password"
                      placeholder="Passwort wiederholen"
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
                  Passwort aktualisieren
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
                  Zwei-Faktor-Authentifizierung (2FA)
                </CardTitle>
                {user?.totp_enabled ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-xs gap-1">
                    <CheckCircle className="h-3 w-3" /> 2FA Aktiv (TOTP)
                  </Badge>
                ) : (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 text-xs gap-1">
                    <AlertTriangle className="h-3 w-3" /> Nicht aktiv
                  </Badge>
                )}
              </div>
              <CardDescription className="text-xs">
                Schütze dein Konto zusätzlich mit einer Authenticator-App (Google Authenticator, Apple Passwörter, Bitwarden, 1Password) nach RFC 6238.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {user?.totp_enabled ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-emerald-50/60 border border-emerald-200 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-emerald-900">
                      Dein Konto ist mit Zwei-Faktor-Authentifizierung geschützt
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      Bei jeder Anmeldung wird ein 6-stelliger TOTP-Code abgefragt.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs shrink-0"
                    onClick={handleDisable2fa}
                  >
                    2FA deaktivieren
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">
                      TOTP-Zwei-Faktor-Authentifizierung aktivieren
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Vom Eidgenössischen Datenschutz- und Öffentlichkeitsbeauftragten (EDÖB) für Steuerdaten empfohlen.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-primary hover:bg-primary-600 text-white text-xs shrink-0"
                    onClick={handleStart2faSetup}
                  >
                    2FA aktivieren (TOTP)
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
                Sicherheits- & EDÖB-Architektur
              </CardTitle>
              <CardDescription className="text-xs">
                Geprüfte technische und organisatorische Sicherheitsmassnahmen gemäss revidiertem Schweizer Datenschutzgesetz (nDSG).
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Passwort-Hashing</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      Argon2id
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Speicherharter Algorithmus zur Abwehr von Brute-Force-Angriffen gemäss BSI/EDÖB-Empfehlung.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Verschlüsselung im Ruhezustand</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-emerald-700 border-emerald-300">
                      AES-256-GCM
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Mehrschichtige Envelope-Verschlüsselung mit individuellen DEKs pro Dokument.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Übertragungssicherheit</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      TLS 1.3 + HSTS
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Erzwungene TLS 1.3-Verbindungen mit Perfect Forward Secrecy und HSTS.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Sitzungsverwaltung</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      15 Min. Sliding
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Kurzlebige Access-Tokens mit automatischer Token-Rotation und sofortiger Sperrung bei Logout.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Brute-Force-Schutz</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-slate-700 border-slate-300">
                      5 Fehlversuche / 15 Min.
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Automatische Kontosperre nach 5 aufeinanderfolgenden fehlerhaften Anmeldeversuchen.
                  </p>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900">Deklarationsprinzip</span>
                    <Badge variant="outline" className="text-[10px] bg-emerald-50 text-emerald-800 border-emerald-300">
                      Art. 110 DBG
                    </Badge>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Selbstdeklaration: Steuerpflichtige Person prüft und übermittelt amtliche Unterlagen selbstständig.
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
                Konto endgültig löschen
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-slate-600 leading-relaxed">
                Lösche dein Konto, alle verschlüsselten Belege und Steuererklärungsdaten unwiderruflich. Gemäss Art. 32 nDSG werden sämtliche Daten sofort physisch gelöscht.
              </p>
              {!showDeleteConfirm ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs h-8"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Konto löschen
                </Button>
              ) : (
                <div className="bg-rose-50 border border-rose-200 rounded-lg p-3 space-y-2.5">
                  <p className="text-xs font-semibold text-rose-800">
                    Bist du sicher? Dieser Vorgang kann nicht rückgängig gemacht werden.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2.5 text-xs text-slate-600"
                      onClick={() => setShowDeleteConfirm(false)}
                    >
                      Abbrechen
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-3 text-xs bg-rose-600 hover:bg-rose-700 text-white"
                      onClick={handleDeleteAccount}
                    >
                      Ja, alles endgültig löschen
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
              Zwei-Faktor-Authentifizierung einrichten
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Kopple deine Authenticator-App (z. B. Google Authenticator, Apple Passwörter, 1Password, Bitwarden) mit SunTax.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold text-slate-700">
                1. Authenticator-Geheimschlüssel
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
                      <Check className="h-3.5 w-3.5 mr-1 text-emerald-600" /> Kopiert
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 mr-1" /> Kopieren
                    </>
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">
                Gib diesen Schlüssel in deiner Authenticator-App unter &laquo;Konto hinzufügen &rarr; Manueller Schlüssel&raquo; ein.
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-100">
              <Label htmlFor="setup-totp-code" className="text-xs font-semibold text-slate-700">
                2. 6-stelligen Bestätigungscode eingeben
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
                Gib den aktuellen 6-stelligen Code aus deiner App ein, um die Einrichtung abzuschliessen.
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
              Abbrechen
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
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Bestätigen...
                </>
              ) : (
                '2FA aktivieren'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
