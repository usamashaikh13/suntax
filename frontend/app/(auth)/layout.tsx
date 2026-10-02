import { ReactNode } from 'react'
import Link from 'next/link'
import { ShieldCheck, Lock, CheckCircle2 } from 'lucide-react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-red-500 selection:text-white relative overflow-hidden">
      {/* Background Decorative Gradients & Mesh */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(220,38,38,0.15),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-red-600/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
      
      {/* Micro Grid Overlay */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b0a_1px,transparent_1px),linear-gradient(to_bottom,#1e293b0a_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      {/* Auth Navigation Header */}
      <header className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="swiss-cross-badge shadow-md shadow-red-900/40 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight text-white flex items-center gap-1">
              Sun<span className="text-red-500">Tax</span>
              <span className="text-[10px] uppercase font-bold tracking-widest text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800 ml-1.5">
                CH
              </span>
            </span>
          </div>
        </Link>

        <div className="hidden sm:flex items-center gap-2 text-xs font-semibold text-slate-400 bg-slate-900/80 border border-slate-800/80 px-3 py-1.5 rounded-full">
          <ShieldCheck className="h-4 w-4 text-emerald-400" />
          <span>Swiss FADP Compliant • Banking-Grade Encryption</span>
        </div>
      </header>

      {/* Main Form Center */}
      <main className="relative z-10 flex-1 flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md">
          {children}
        </div>
      </main>

      {/* Trust & Legal Footer */}
      <footer className="relative z-10 w-full max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500 border-t border-slate-900">
        <p>© {new Date().getFullYear()} SunTax Switzerland. All rights reserved.</p>
        <div className="flex items-center gap-4">
          <span className="hover:text-slate-400 cursor-pointer">Security Architecture</span>
          <span>•</span>
          <span className="hover:text-slate-400 cursor-pointer">Swiss Data Sovereignty</span>
          <span>•</span>
          <span className="hover:text-slate-400 cursor-pointer">ESTV Certified Rates</span>
        </div>
      </footer>
    </div>
  )
}
