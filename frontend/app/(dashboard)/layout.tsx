'use client'

import { ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FileText, Upload, User, LogOut, Menu, X,
  LayoutDashboard, ChevronRight, ShieldCheck, Plus
} from 'lucide-react'
import { clearTokens, getCurrentUser } from '@/lib/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { href: '/tax-returns', label: 'Steuererklärungen', icon: FileText, badge: '26 Kantone' },
  { href: '/documents', label: 'Dokumente', icon: Upload },
  { href: '/profile', label: 'Mein Profil', icon: User },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<{ full_name?: string; email?: string } | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    const cached = getCurrentUser()
    if (cached) {
      setUser(cached)
    }
    api.auth.getMe().then(setUser).catch(() => {})
  }, [])

  const pageTitle = navItems.find(n => pathname.startsWith(n.href))?.label || 'SunTax'

  const handleLogout = async () => {
    try {
      await api.auth.logout()
    } catch {}
    clearTokens()
    router.push('/login')
  }

  const userInitials = user?.full_name
    ? user.full_name
        .split(' ')
        .map(n => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'CH'

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white text-[#0A0A0A] border-r border-[#ECE8DF] select-none">
      {/* Brand Header */}
      <div className="px-6 py-5 border-b border-[#ECE8DF]">
        <Link href="/dashboard" className="flex items-center gap-2.5 group">
          <svg width="23" height="27" viewBox="0 0 40 46" aria-hidden="true">
            <path d="M4 0H27L38 11V28L23 43H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="#15181D" />
            <path d="M27 0L38 11H30a3 3 0 0 1-3-3z" fill="#D6D6D6" />
            <path d="M9.5 17.5h4.5V13h5v4.5h4.5v5H19V27h-5v-4.5H9.5z" fill="#FFFFFF" />
            <rect x="28" y="33" width="10" height="3" rx="1" fill="#6B6F76" />
            <rect x="23" y="39" width="15" height="3" rx="1" fill="#6B6F76" />
          </svg>
          <div className="flex flex-col">
            <span className="text-xl tracking-tight leading-none">
              <span className="font-extrabold text-[#15181D]">Sun</span>
              <span className="font-semibold text-[#4B4F57]">Tax</span>
            </span>
            <span className="text-[10px] font-semibold text-[#777777] uppercase tracking-wider mt-1">
              Schweizer Steuerplattform
            </span>
          </div>
        </Link>
      </div>

      {/* Engine Status Banner */}
      <div className="mx-4 my-3 p-2.5 rounded-xl bg-[#F9F9F8] border border-[#ECE8DF] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-[#16A34A]" />
          </span>
          <span className="text-[11px] font-medium text-[#444444]">ESTV 2025/2026 Engine</span>
        </div>
        <span className="text-[10px] font-bold text-[#16A34A] bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded-md">
          Aktiv
        </span>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 px-3 py-2 space-y-6 overflow-y-auto">
        <div>
          <p className="px-3 text-[11px] font-bold uppercase tracking-wider text-[#888888] mb-2">
            Steuererklärung
          </p>
          <nav className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon
              const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    'group flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-emerald-50 text-[#1E7B52] font-bold border border-emerald-200/80 shadow-xs'
                      : 'text-[#555555] hover:bg-[#F2F2F0] hover:text-[#0A0A0A]'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn('h-4 w-4 transition-colors', isActive ? 'text-[#1E7B52]' : 'text-[#777777] group-hover:text-[#0A0A0A]')} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#F2F2F0] text-[#555555] border border-[#ECE8DF]">
                      {item.badge}
                    </span>
                  )}
                  {isActive && !item.badge && <ChevronRight className="h-3.5 w-3.5 text-[#1E7B52] ml-auto" />}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* AI & Swiss Regulatory Compliance badge */}
        <div className="p-3.5 rounded-2xl bg-[#F9F9F8] border border-[#ECE8DF] space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-bold text-[#1E7B52]">
            <ShieldCheck className="h-4 w-4 text-[#16A34A]" />
            <span>Datenschutz Schweiz (nDSG)</span>
          </div>
          <p className="text-[11px] text-[#666666] leading-relaxed">
            Deterministische ESTV-Regel-Engine. Deine Daten bleiben ausschliesslich in der Schweiz.
          </p>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-[#ECE8DF] bg-[#F9F9F8]">
        <div className="flex items-center justify-between p-2 rounded-xl bg-white border border-[#ECE8DF]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-[#1E7B52] flex items-center justify-center text-xs font-bold text-white shadow-xs flex-shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[#0A0A0A] truncate">
                {user?.full_name || 'Steuerzahler/in'}
              </p>
              <p className="text-[11px] text-[#777777] truncate">
                {user?.email || 'Angemeldet'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Abmelden"
            className="p-1.5 rounded-lg text-[#777777] hover:text-red-600 hover:bg-red-50 transition-colors flex-shrink-0 cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-[#F6F6F4] text-[#0A0A0A] flex antialiased font-sans">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 z-30 shadow-xs">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 z-50 shadow-2xl flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Sticky Header */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur-md border-b border-[#ECE8DF] px-4 sm:px-6 py-3 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#555555] hover:text-[#0A0A0A] hover:bg-[#F2F2F0] transition-colors"
              aria-label="Navigation öffnen"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-[#0A0A0A] tracking-tight flex items-center gap-2">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#F2F2F0] border border-[#ECE8DF] text-[11px] font-semibold text-[#555555]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A]" />
              <span>Alle 26 Kantone aktiv</span>
            </div>

            {/* Quick CTA */}
            <Button
              asChild
              size="sm"
              className="bg-[#1E7B52] hover:bg-[#165C3D] text-white shadow-xs text-xs font-semibold h-8 px-3 rounded-xl"
            >
              <Link href="/tax-returns/new">
                <Plus className="h-3.5 w-3.5 mr-1" />
                Neue Erklärung
              </Link>
            </Button>
          </div>
        </header>

        {/* Page Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
