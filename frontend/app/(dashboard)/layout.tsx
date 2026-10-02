'use client'

import { ReactNode, useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  FileText, Upload, User, LogOut, Menu, X,
  LayoutDashboard, ChevronRight, ShieldCheck, Sparkles,
  Calculator, Plus, Compass
} from 'lucide-react'
import { clearTokens, getCurrentUser } from '@/lib/auth'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/tax-returns', label: 'Tax Returns', icon: FileText, badge: '26 Cantons' },
  { href: '/documents', label: 'Documents Vault', icon: Upload },
  { href: '/profile', label: 'My Account', icon: User },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<{ full_name?: string; email?: string } | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    // Get cached or fetch me
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
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 select-none">
      {/* Brand Header */}
      <div className="px-5 py-6 border-b border-slate-800/80">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <div className="swiss-cross-badge shadow-md shadow-red-900/40 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight leading-none text-white flex items-center gap-1">
              Sun<span className="text-red-500">Tax</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 ml-1.5">
                CH
              </span>
            </span>
            <span className="text-[11px] font-medium text-slate-400 tracking-wide mt-1">
              Swiss Tax Platform
            </span>
          </div>
        </Link>
      </div>

      {/* Engine Status Banner */}
      <div className="mx-3 my-3 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-[11px] font-medium text-slate-300">ESTV 2025/2026 Engine</span>
        </div>
        <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-1.5 py-0.5 rounded">
          Live
        </span>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 px-3 py-2 space-y-6 overflow-y-auto">
        <div>
          <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
            Core Filing
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
                    'group flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    isActive
                      ? 'bg-red-600/15 text-white border border-red-500/30 shadow-sm shadow-red-950'
                      : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={cn('h-4 w-4 transition-colors', isActive ? 'text-red-400' : 'text-slate-400 group-hover:text-slate-300')} />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60">
                      {item.badge}
                    </span>
                  )}
                  {isActive && !item.badge && <ChevronRight className="h-3.5 w-3.5 text-red-400 ml-auto" />}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* AI & Swiss Regulatory Compliance badge */}
        <div className="p-3.5 rounded-xl bg-gradient-to-br from-slate-900 to-slate-900/60 border border-slate-800/90 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
            <ShieldCheck className="h-4 w-4 text-emerald-400" />
            <span>Bank-Grade Privacy</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Deterministic calculation engine guarantees 0% AI tax hallucination. 100% Swiss statutory compliance.
          </p>
        </div>
      </div>

      {/* User Footer Profile */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-950/80">
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 border border-slate-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-red-600 to-rose-400 flex items-center justify-center text-xs font-bold text-white shadow-sm flex-shrink-0">
              {userInitials}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">
                {user?.full_name || 'Swiss Taxpayer'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {user?.email || 'Logged In'}
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Sign Out"
            className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors flex-shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50/70 flex antialiased">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 z-30 shadow-xl shadow-slate-950/5">
        <SidebarContent />
      </aside>

      {/* Mobile Drawer Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 w-72 z-50 shadow-2xl flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Sticky Luxury Header */}
        <header className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 py-3 flex items-center justify-between transition-colors">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
                {pageTitle}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Status Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 border border-slate-200/80 text-[11px] font-medium text-slate-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span>All 26 Cantons Active</span>
            </div>

            {/* Quick CTA */}
            <Button
              asChild
              size="sm"
              className="bg-red-600 hover:bg-red-700 text-white shadow-sm shadow-red-600/20 text-xs font-semibold h-8 px-3"
            >
              <Link href="/tax-returns/new">
                <Plus className="h-3.5 w-3.5 mr-1" />
                New Return
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
