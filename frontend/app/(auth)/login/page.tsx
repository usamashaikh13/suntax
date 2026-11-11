'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, ShieldCheck, ArrowLeft } from 'lucide-react';
import { z } from 'zod';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { setTokens } from '@/lib/auth';
import { useTranslation } from '@/lib/i18n/LanguageContext';

const loginSchema = z.object({
  email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein'),
  password: z.string().min(1, 'Bitte gib dein Passwort ein'),
});

type LoginForm = z.infer<typeof loginSchema>;

function signInError(error: any, fallback: string, isGerman: boolean): string {
  if (error?.code === 'ECONNABORTED' || error?.code === 'ETIMEDOUT') {
    return isGerman
      ? 'Der Server hat nicht rechtzeitig geantwortet. Bitte versuche es erneut.'
      : 'The server did not respond in time. Please try again.';
  }
  if (!error?.response) {
    return isGerman
      ? 'Verbindung zum Server fehlgeschlagen. Bitte prüfe deine Internetverbindung.'
      : 'Connection to server failed. Please check your internet connection.';
  }
  if (error.response.status >= 500) {
    return isGerman
      ? 'Der Server ist vorübergehend nicht erreichbar. Bitte versuche es gleich nochmals.'
      : 'The server is temporarily unavailable. Please try again shortly.';
  }
  const detail = error.response.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export default function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, isGerman } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [is2faStep, setIs2faStep] = useState(false);
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [submitting2fa, setSubmitting2fa] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      const response = await api.auth.login(data);
      if (response.two_factor_required && response.temp_token) {
        setTempToken(response.temp_token);
        setIs2faStep(true);
        toast({
          title: t('auth.twoFactorTitle'),
          description: t('auth.twoFactorSub'),
        });
        return;
      }

      setTokens(response.access_token, response.refresh_token);
      toast({
        title: t('common.success'),
        description: t('auth.welcomeBack'),
      });
      router.push('/dashboard');
    } catch (error: any) {
      toast({
        title: error?.response?.status === 423
          ? t('auth.accountLockedError')
          : (isGerman ? 'Anmeldung fehlgeschlagen' : 'Sign in failed'),
        description: signInError(error, t('auth.invalidCredentialsError'), isGerman),
        variant: 'destructive',
      });
    }
  };

  const handle2faSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting2fa || !tempToken || twoFactorCode.trim().length !== 6) return;
    setSubmitting2fa(true);
    try {
      const response = await api.auth.login2fa(tempToken, twoFactorCode.trim());
      setTokens(response.access_token, response.refresh_token);
      toast({
        title: t('common.success'),
        description: t('auth.welcomeBack'),
      });
      window.location.href = '/dashboard';
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: signInError(error, t('auth.invalid2faError'), isGerman),
        variant: 'destructive',
      });
    } finally {
      setSubmitting2fa(false);
    }
  };

  return (
    <div>
      <section className="bg-white border border-[#ECE8DF] rounded-[24px] p-8 sm:p-10 shadow-[0_30px_60px_-45px_rgba(30,30,40,0.35)]">
        {is2faStep ? (
          <div>
            <div className="flex items-center gap-2 text-[#1E7B52] mb-3">
              <ShieldCheck className="h-5 w-5" />
              <span className="text-xs font-bold uppercase tracking-wider">{t('auth.twoFactorSecurityBadge')}</span>
            </div>
            <h2 className="text-[28px] font-bold text-[#0A0A0A] tracking-tight leading-tight">
              {t('auth.twoFactorTitle')}
            </h2>
            <p className="mt-1.5 text-[#666666] text-[15px] leading-relaxed">
              {t('auth.twoFactorSub')}
            </p>

            <form onSubmit={handle2faSubmit} className="mt-7 space-y-5">
              <div>
                <label htmlFor="twoFactorCode" className="block text-xs font-semibold text-[#0A0A0A] mb-2 text-center">
                  {t('auth.twoFactorLabel')}
                </label>
                <input
                  id="twoFactorCode"
                  type="text"
                  maxLength={6}
                  placeholder={t('auth.twoFactorPlaceholder')}
                  value={twoFactorCode}
                  onChange={(e) => setTwoFactorCode(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  className="w-full h-14 bg-[#F9F9F8] border border-[#ECE8DF] rounded-xl text-center font-mono text-2xl tracking-[0.4em] font-bold text-[#0A0A0A] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={submitting2fa || twoFactorCode.trim().length !== 6}
                className="w-full min-h-[52px] rounded-2xl bg-[#1E7B52] hover:bg-[#165C3D] disabled:opacity-50 text-white font-semibold text-base transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed shadow-sm"
              >
                {submitting2fa ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('auth.twoFactorConfirmBtn')
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  setIs2faStep(false);
                  setTempToken(null);
                  setTwoFactorCode('');
                }}
                className="w-full text-center text-xs text-[#666666] hover:text-[#0A0A0A] font-medium flex items-center justify-center gap-1.5 pt-1"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t('common.back')}
              </button>
            </form>
          </div>
        ) : (
          <div>
            {/* Tab Switcher: Registrieren / Anmelden */}
            <div role="tablist" className="inline-flex bg-[#F2F2F0] rounded-xl p-1 gap-1">
              <Link
                href="/register"
                role="tab"
                aria-selected={false}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors"
              >
                {t('auth.tabRegister')}
              </Link>
              <button
                type="button"
                role="tab"
                aria-selected={true}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-[#0A0A0A] bg-white shadow-xs"
              >
                {t('auth.tabLogin')}
              </button>
            </div>

            <h2 className="mt-7 text-[28px] font-bold text-[#0A0A0A] tracking-tight leading-tight">
              {t('auth.welcomeBack')}
            </h2>
            <p className="mt-1.5 text-[#666666] text-[15px]">
              {t('auth.welcomeBackSub')}
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-[#0A0A0A] mb-1.5">
                  {t('auth.emailLabel')}
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder={t('auth.emailPlaceholder')}
                    {...register('email')}
                    className={`w-full h-12 px-4 rounded-xl border bg-white text-[#0A0A0A] text-sm placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all ${
                      errors.email ? 'border-red-400 focus:ring-red-400' : 'border-[#ECE8DF]'
                    }`}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.email.message}</p>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="password" className="block text-xs font-semibold text-[#0A0A0A]">
                    {t('auth.passwordLabel')}
                  </label>
                  <Link
                    href="/forgot-password"
                    className="text-xs font-medium text-[#1E7B52] hover:underline"
                  >
                    {t('auth.forgotPasswordLink')}
                  </Link>
                </div>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="••••••••••••"
                    {...register('password')}
                    className={`w-full h-12 pl-4 pr-11 rounded-xl border bg-white text-[#0A0A0A] text-sm placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all ${
                      errors.password ? 'border-red-400 focus:ring-red-400' : 'border-[#ECE8DF]'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#777777] hover:text-[#0A0A0A] transition-colors p-1"
                    aria-label={showPassword ? (isGerman ? 'Passwort verbergen' : 'Hide password') : (isGerman ? 'Passwort anzeigen' : 'Show password')}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.password.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[52px] rounded-2xl bg-[#1E7B52] hover:bg-[#165C3D] disabled:opacity-60 text-white font-semibold text-base transition-colors flex items-center justify-center cursor-pointer shadow-sm mt-2"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('auth.loginButton')
                )}
              </button>
            </form>

            <p className="mt-5 text-center text-xs text-[#888888]">
              {t('auth.twoFactorNotice')}
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
