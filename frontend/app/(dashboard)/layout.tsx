'use client';

import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  FileText,
  Upload,
  User,
  LogOut,
  Menu,
  X,
  LayoutDashboard,
  Plus,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';
import { clearTokens, getCurrentUser } from '@/lib/auth';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import { BRAND } from '@/lib/brand';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { t, isGerman } = useTranslation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [user, setUser] = useState<{ full_name?: string; email?: string } | null>(null);

  const navItems = [
    { href: '/dashboard', label: isGerman ? 'Übersicht' : 'Overview', icon: LayoutDashboard },
    { href: '/tax-returns', label: isGerman ? 'Steuererklärungen' : 'Tax Declarations', icon: FileText },
    { href: '/documents', label: isGerman ? 'Dokumente' : 'Documents', icon: Upload },
    { href: '/profile', label: isGerman ? 'Mein Profil' : 'My Profile', icon: User },
  ];

  useEffect(() => {
    const cached = getCurrentUser();
    if (cached) {
      setUser(cached);
    }
    api.auth.getMe().then(setUser).catch(() => {});
  }, []);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  const handleLogout = async () => {
    try {
      await api.auth.logout();
    } catch {}
    clearTokens();
    router.push('/login');
  };

  const userInitials = user?.full_name
    ? user.full_name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'CH';

  const isTaxReturnFlow = pathname.startsWith('/tax-returns/') && pathname !== '/tax-returns';
  const isReturnsListPage = pathname === '/tax-returns';
  const isNewReturnPage = pathname === '/tax-returns/new';
  // Avoid duplicate primary action when on tax-returns list or inside wizard
  const showHeaderNewReturn = !isTaxReturnFlow && !isReturnsListPage && !isNewReturnPage;

  return (
    <div className="min-h-screen bg-[#F6F6F4] text-[#0A0A0A] font-sans flex flex-col antialiased selection:bg-[#1E7B52] selection:text-white">
      {/* ─── TOP STICKY HEADER ────────────────────────────────────────────── */}
      <header className="bg-white border-b border-[#ECECEC] sticky top-0 z-30 shadow-2xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo & Navigation */}
          <div className="flex items-center gap-4 lg:gap-6 shrink-0">
            <Link href="/dashboard" aria-label={`${BRAND.name} Home`} className="flex items-center gap-2.5 shrink-0 group">
              <svg width="22" height="26" viewBox="0 0 40 46" aria-hidden="true">
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

            {/* Desktop Navigation Links: visible on lg (>= 1024px) */}
            {!isTaxReturnFlow ? (
              <nav className="hidden lg:flex items-center gap-1 text-sm font-medium shrink-0" aria-label="Main Navigation">
                {navItems.map((item) => {
                  const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap ${
                        isActive
                          ? 'bg-[#F2F2F0] text-[#0A0A0A] font-semibold'
                          : 'text-[#666666] hover:text-[#0A0A0A] hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            ) : (
              <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-500 shrink-0">
                <Link href="/tax-returns" className="hover:text-slate-900 transition-colors flex items-center gap-1 whitespace-nowrap">
                  <ArrowLeft className="h-3 w-3" />
                  <span>{isGerman ? 'Steuererklärungen' : 'Tax Declarations'}</span>
                </Link>
              </div>
            )}
          </div>

          {/* Right Header: Swiss Status, Flat Fee, Language Switcher, User & Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
            {/* Swiss Residency & Flat Fee Pills: visible on xl (>= 1280px) without overlapping on tablet/1024px */}
            <span className="hidden xl:flex items-center gap-1.5 text-xs font-semibold text-[#16A34A] bg-emerald-50/80 border border-emerald-200/60 px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
              {t('common.dataResidencyShort')}
            </span>
            <span className="hidden xl:flex items-center text-xs font-semibold text-slate-700 bg-slate-100 border border-[#ECE8DF] px-2.5 py-1 rounded-full whitespace-nowrap shrink-0">
              {isGerman ? 'Pauschalpreis CHF 39' : 'Flat fee CHF 39'}
            </span>

            {/* Language Switcher */}
            <div className="shrink-0">
              <LanguageSwitcher />
            </div>

            {/* New Return Action: conditionally shown, hidden on /tax-returns to prevent duplicate CTA */}
            {showHeaderNewReturn && (
              <Button
                asChild
                size="sm"
                className="hidden sm:inline-flex bg-[#1E7B52] hover:bg-[#165C3D] text-white shadow-xs text-xs font-semibold h-8 px-3 rounded-xl shrink-0 whitespace-nowrap"
              >
                <Link href="/tax-returns/new">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  {isGerman ? 'Neue Erklärung' : 'New Return'}
                </Link>
              </Button>
            )}

            {/* User Profile Pill / Menu: truncated name */}
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-slate-200 shrink-0">
              <Link
                href="/profile"
                className="flex items-center gap-2 py-1 px-2 rounded-full hover:bg-slate-100 transition-colors"
                title={user?.email || (isGerman ? 'Mein Profil' : 'My Profile')}
              >
                <span className="w-7 h-7 rounded-full bg-[#0A0A0A] text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {userInitials}
                </span>
                <span className="text-xs font-semibold text-[#0A0A0A] max-w-[100px] truncate">
                  {user?.full_name || (isGerman ? 'Mein Profil' : 'My Profile')}
                </span>
              </Link>
              <button
                type="button"
                onClick={handleLogout}
                title={t('common.logout')}
                aria-label={t('common.logout')}
                className="p-1.5 rounded-lg text-[#777777] hover:text-red-600 hover:bg-red-50 transition-colors shrink-0"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile/Compact Hamburger Toggle: shown below lg */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 shrink-0"
              aria-label={mobileMenuOpen ? (isGerman ? 'Menü schliessen' : 'Close menu') : (isGerman ? 'Menü öffnen' : 'Open menu')}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-menu"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile/Compact Dropdown Menu */}
        {mobileMenuOpen && (
          <div
            id="mobile-nav-menu"
            role="dialog"
            aria-label={isGerman ? 'Hauptmenü' : 'Main menu'}
            className="lg:hidden border-t border-[#ECECEC] bg-white px-4 py-4 space-y-3 shadow-lg"
          >
            <nav className="space-y-1">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      isActive ? 'bg-[#F2F2F0] text-[#0A0A0A]' : 'text-[#666666] hover:bg-slate-50 hover:text-[#0A0A0A]'
                    }`}
                  >
                    <item.icon className="h-4 w-4 text-slate-500" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Badges for smaller screens */}
            <div className="pt-2 pb-1 border-t border-slate-100 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#16A34A] bg-emerald-50 border border-emerald-200/60 px-2.5 py-1 rounded-full whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-[#16A34A]" />
                {t('common.dataResidencyShort')}
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-slate-700 bg-slate-100 border border-[#ECE8DF] px-2.5 py-1 rounded-full whitespace-nowrap">
                {isGerman ? 'Pauschalpreis CHF 39' : 'Flat fee CHF 39'}
              </span>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-7 h-7 rounded-full bg-[#0A0A0A] text-white font-bold text-xs flex items-center justify-center shrink-0">
                  {userInitials}
                </span>
                <span className="text-xs text-slate-700 font-medium truncate max-w-[180px]">
                  {user?.full_name || user?.email}
                </span>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="text-xs font-semibold text-red-600 hover:text-red-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>{t('common.logout')}</span>
              </button>
            </div>
          </div>
        )}
      </header>

      {/* ─── MAIN CONTENT ─────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">
        {children}
      </main>
    </div>
  );
}
