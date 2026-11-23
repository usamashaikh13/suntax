'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Loader2, CheckCircle2 } from 'lucide-react';
import { z } from 'zod';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useTranslation } from '@/lib/i18n/LanguageContext';

const registerSchema = z.object({
  full_name: z.string().min(2, 'Bitte gib deinen Vor- und Nachnamen ein'),
  email: z.string().email('Bitte gib eine gültige E-Mail-Adresse ein'),
  password: z
    .string()
    .min(10, 'Mindestens 10 Zeichen erforderlich')
    .regex(/[0-9]/, 'Mindestens eine Zahl erforderlich'),
  terms_accepted: z.boolean().refine((v) => v === true, 'Bitte akzeptiere die AGB und Datenschutzerklärung'),
});

type RegisterForm = z.infer<typeof registerSchema>;

function PasswordChecklist({ password }: { password: string }) {
  const { t } = useTranslation();
  const checks = [
    { label: t('auth.passwordRuleLength'), ok: password.length >= 10 },
    { label: t('auth.passwordRuleNumber'), ok: /[0-9]/.test(password) },
  ];

  if (!password) return null;

  return (
    <div className="mt-2 space-y-1">
      {checks.map((c) => (
        <div
          key={c.label}
          className={`text-xs flex items-center gap-1.5 font-medium ${
            c.ok ? 'text-[#16A34A]' : 'text-[#888888]'
          }`}
        >
          <CheckCircle2 className={`h-3.5 w-3.5 ${c.ok ? 'text-[#16A34A]' : 'text-[#BBBBBB]'}`} />
          {c.label}
        </div>
      ))}
    </div>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t, isGerman, dict } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      terms_accepted: false,
    },
  });

  const passwordValue = watch('password', '');
  const termsAccepted = watch('terms_accepted', false);

  const onSubmit = async (data: RegisterForm) => {
    try {
      await api.auth.register({
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        terms_accepted: data.terms_accepted,
      });
      setRegisteredEmail(data.email);
      toast({
        title: t('common.success'),
        description: isGerman ? 'Bestätigungslink versendet.' : 'Confirmation link sent.',
      });
    } catch (error: any) {
      toast({
        title: t('common.error'),
        description: error?.response?.data?.detail || (isGerman ? 'Bitte versuche es erneut oder melde dich an.' : 'Please try again or log in.'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div>
      <section className="bg-white border border-[#ECE8DF] rounded-[24px] p-8 sm:p-10 shadow-[0_30px_60px_-45px_rgba(30,30,40,0.35)]">
        {registeredEmail ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 text-[#1E7B52] flex items-center justify-center mx-auto">
              <CheckCircle2 className="h-7 w-7" />
            </div>
            <h2 className="text-2xl font-bold text-[#0A0A0A] tracking-tight">
              {dict.auth.verifyEmailTitle}
            </h2>
            <p className="text-sm text-[#666666] leading-relaxed max-w-sm mx-auto">
              {isGerman ? (
                <>
                  Wir haben einen Bestätigungslink an <strong>{registeredEmail}</strong> gesendet.
                  Bitte klicke auf den Link in der E-Mail, um dein Konto zu aktivieren.
                </>
              ) : (
                <>
                  We sent a confirmation link to <strong>{registeredEmail}</strong>.
                  Please click the link in your email to activate your account.
                </>
              )}
            </p>
            <div className="pt-2">
              <Link
                href="/login"
                className="inline-flex items-center justify-center min-h-[46px] px-6 rounded-xl bg-[#1E7B52] hover:bg-[#165C3D] text-white font-semibold text-sm transition-colors shadow-sm"
              >
                {dict.auth.continueToLogin}
              </Link>
            </div>
          </div>
        ) : (
          <div>
            {/* Tab Switcher: Registrieren / Login */}
            <div role="tablist" className="inline-flex bg-[#F2F2F0] rounded-xl p-1 gap-1 notranslate" translate="no">
              <button
                type="button"
                role="tab"
                aria-selected={true}
                className="px-4 py-1.5 rounded-lg text-sm font-semibold text-[#0A0A0A] bg-white shadow-xs notranslate"
                translate="no"
              >
                {t('auth.tabRegister')}
              </button>
              <Link
                href="/login"
                role="tab"
                aria-selected={false}
                className="px-4 py-1.5 rounded-lg text-sm font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors notranslate"
                translate="no"
              >
                {t('auth.tabLogin')}
              </Link>
            </div>

            <h2 className="mt-7 text-[28px] font-bold text-[#0A0A0A] tracking-tight leading-tight">
              {t('auth.createAccount')}
            </h2>
            <p className="mt-1.5 text-[#666666] text-[15px]">
              {t('auth.createAccountSub')}
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div>
                <label htmlFor="reg-name" className="block text-xs font-semibold text-[#0A0A0A] mb-1.5">
                  {t('auth.fullNameLabel')}
                </label>
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  placeholder={t('auth.fullNamePlaceholder')}
                  {...register('full_name')}
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-[#0A0A0A] text-sm placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all ${
                    errors.full_name ? 'border-red-400 focus:ring-red-400' : 'border-[#ECE8DF]'
                  }`}
                />
                {errors.full_name && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.full_name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="reg-email" className="block text-xs font-semibold text-[#0A0A0A] mb-1.5">
                  {t('auth.emailLabel')}
                </label>
                <input
                  id="reg-email"
                  type="email"
                  autoComplete="email"
                  placeholder={t('auth.emailPlaceholder')}
                  {...register('email')}
                  className={`w-full h-12 px-4 rounded-xl border bg-white text-[#0A0A0A] text-sm placeholder:text-[#999999] focus:outline-none focus:ring-2 focus:ring-[#1E7B52] focus:border-transparent transition-all ${
                    errors.email ? 'border-red-400 focus:ring-red-400' : 'border-[#ECE8DF]'
                  }`}
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="reg-password" className="block text-xs font-semibold text-[#0A0A0A] mb-1.5">
                  {t('auth.passwordLabel')}
                </label>
                <div className="relative">
                  <input
                    id="reg-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    placeholder={t('auth.passwordPlaceholder')}
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
                <PasswordChecklist password={passwordValue} />
                {errors.password && (
                  <p className="mt-1 text-xs text-red-600 font-medium">{errors.password.message}</p>
                )}
              </div>

              <div className="pt-1">
                <label className="flex gap-2.5 items-start text-xs text-[#444444] cursor-pointer">
                  <input
                    id="terms_accepted"
                    type="checkbox"
                    {...register('terms_accepted')}
                    className="w-4 h-4 mt-0.5 rounded border-[#ECE8DF] text-[#1E7B52] focus:ring-[#1E7B52] accent-[#1E7B52] shrink-0"
                  />
                  <span className="leading-normal">
                    {t('auth.termsAgreement')}{' '}
                    <Link href="/terms" className="text-[#1E7B52] font-semibold hover:underline">
                      {t('auth.termsLink')}
                    </Link>{' '}
                    /{' '}
                    <Link href="/privacy" className="text-[#1E7B52] font-semibold hover:underline">
                      {t('auth.privacyLink')}
                    </Link>
                  </span>
                </label>
                {errors.terms_accepted && (
                  <p className="mt-1 text-xs text-amber-700 font-medium">{errors.terms_accepted.message}</p>
                )}
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full min-h-[52px] rounded-2xl bg-[#1E7B52] hover:bg-[#165C3D] disabled:opacity-60 text-white font-semibold text-base transition-colors flex items-center justify-center cursor-pointer shadow-sm mt-3"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {t('common.loading')}
                  </>
                ) : (
                  t('auth.registerButton')
                )}
              </button>

              {!termsAccepted && (
                <p className="text-center text-xs text-amber-800 font-medium pt-1">
                  {isGerman ? 'Setz zuerst oben das Häkchen bei den AGB.' : 'Please accept the terms and conditions above first.'}
                </p>
              )}
            </form>

            <p className="mt-4 text-[13px] text-[#888888] text-center">
              {t('auth.twoFactorNotice')}
            </p>
          </div>
        )}
      </section>

      {/* Trust Badges Bar */}
      <p className="mt-6 flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-sm text-[#777777]">
        <span>🔒 {t('common.dataResidencyShort')}</span>
        <span>CHF 39 – {t('landing.pricingSubtitle')}</span>
        <span>{t('common.cantonsCount')}</span>
      </p>
    </div>
  );
}
