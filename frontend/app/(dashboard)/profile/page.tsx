'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import {
  Loader2, Trash2, AlertTriangle, CheckCircle, XCircle,
  User as UserIcon, Lock, ShieldCheck, Download, FileSpreadsheet,
  Save, KeyRound
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
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
  }, [])

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
    </div>
  )
}
