'use client'

import { ReactNode } from 'react'
import Link from 'next/link'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useTranslation } from '@/lib/i18n/LanguageContext'
import { BRAND } from '@/lib/brand'

export default function AuthLayout({ children }: { children: ReactNode }) {
  const { isGerman, dict } = useTranslation()

  return (
    <div className="min-h-screen bg-[#F6F6F4] text-[#0A0A0A] font-sans flex flex-col justify-between selection:bg-[#1E7B52] selection:text-white">
      {/* Redesigned Clean Header */}
      <header className="bg-white border-b border-[#ECECEC] sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" aria-label={`${BRAND.name} Startseite`} className="flex items-center gap-2.5 group">
            <svg width="23" height="27" viewBox="0 0 40 46" aria-hidden="true">
              <path d="M4 0H27L38 11V28L23 43H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#15181D" />
              <path d="M27 0L38 11H30a3 3 0 0 1-3-3z" fill="#D6D6D6" />
              <path d="M9.5 17.5h4.5V13h5v4.5h4.5v5H19V27h-5v-4.5H9.5z" fill="#FFFFFF" />
              <rect x="28" y="33" width="10" height="3" rx="1" fill="#6B6F76" />
              <rect x="23" y="39" width="15" height="3" rx="1" fill="#6B6F76" />
            </svg>
            <span className="text-xl tracking-tight leading-none">
              <span className="font-extrabold text-[#15181D]">{BRAND.shortLeft}</span>
              {BRAND.shortRight ? <span className="font-semibold text-[#4B4F57]">{BRAND.shortRight}</span> : null}
            </span>
          </Link>

          <div className="flex items-center gap-3 text-sm text-[#555555]">
            <LanguageSwitcher />
            <span className="text-xs font-semibold text-[#16A34A] flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/60 px-3 py-1 rounded-full whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
              {dict.common.dataResidencyShort}
            </span>
          </div>
        </div>
      </header>

      {/* Main Form Center */}
      <main className="flex-1 flex items-center justify-center py-10 sm:py-14 px-4 sm:px-6">
        <div className="w-full max-w-[520px]">
          {children}
        </div>
      </main>

      {/* Trust & Legal Footer */}
      <footer className="py-6 px-4 text-center text-xs text-[#777777] border-t border-[#ECE8DF]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p>© {new Date().getFullYear()} {BRAND.companyLegalName} · {dict.landing.footerRights}</p>
          <div className="flex items-center gap-4 text-[#555555]">
            <Link href="/terms" className="hover:text-[#1E7B52] transition-colors">{dict.landing.footerTerms}</Link>
            <span>·</span>
            <Link href="/privacy" className="hover:text-[#1E7B52] transition-colors">{dict.landing.footerPrivacy}</Link>
            <span>·</span>
            <Link href="/#faq" className="hover:text-[#1E7B52] transition-colors">{dict.landing.footerContact}</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
