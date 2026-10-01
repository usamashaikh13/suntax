import Link from 'next/link';
import {
  Shield,
  Zap,
  FileText,
  MapPin,
  Calculator,
  Lock,
  ArrowRight,
  CheckCircle,
  Star,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// ─── Swiss Cantons Data ────────────────────────────────────────────────────────
const SUPPORTED_CANTONS = [
  { code: 'ZH', name: 'Zurich' },
  { code: 'BE', name: 'Bern' },
  { code: 'LU', name: 'Lucerne' },
  { code: 'UR', name: 'Uri' },
  { code: 'SZ', name: 'Schwyz' },
  { code: 'OW', name: 'Obwalden' },
  { code: 'NW', name: 'Nidwalden' },
  { code: 'GL', name: 'Glarus' },
  { code: 'ZG', name: 'Zug' },
  { code: 'FR', name: 'Fribourg' },
  { code: 'SO', name: 'Solothurn' },
  { code: 'BS', name: 'Basel-City' },
  { code: 'BL', name: 'Basel-Country' },
  { code: 'SH', name: 'Schaffhausen' },
  { code: 'AR', name: 'Appenzell AR' },
  { code: 'AI', name: 'Appenzell AI' },
  { code: 'SG', name: 'St. Gallen' },
  { code: 'GR', name: 'Grisons' },
  { code: 'AG', name: 'Aargau' },
  { code: 'TG', name: 'Thurgau' },
  { code: 'TI', name: 'Ticino' },
  { code: 'VD', name: 'Vaud' },
  { code: 'VS', name: 'Valais' },
  { code: 'NE', name: 'Neuchâtel' },
  { code: 'GE', name: 'Geneva' },
  { code: 'JU', name: 'Jura' },
];

// ─── Features Data ────────────────────────────────────────────────────────────
const FEATURES = [
  {
    icon: Zap,
    title: 'AI Document Analysis',
    description:
      'Upload your documents — our AI automatically extracts all relevant tax data from salary certificates, bank statements, and securities statements.',
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  {
    icon: Shield,
    title: 'Swiss Data Privacy',
    description:
      'Your data is stored in Switzerland and protected by state-of-the-art encryption. Fully compliant with Swiss nFADP and GDPR.',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    icon: MapPin,
    title: 'All 26 Cantons',
    description:
      'Full support for all Swiss cantons with canton-specific tax rates, deductions, and municipal tax multipliers.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Calculator,
    title: 'Precise Tax Calculation',
    description:
      'Calculates federal, cantonal, and municipal taxes including church tax using current rates — every step fully traceable.',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    icon: FileText,
    title: 'Complete Export',
    description:
      'Export as PDF and eCH-0196 XML for direct submission. Every calculation step is documented and referenced.',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
  {
    icon: Lock,
    title: 'Secure Authentication',
    description:
      'Email verification, JWT tokens with automatic refresh, and session management protect your sensitive tax data.',
    color: 'text-slate-600',
    bg: 'bg-slate-50',
  },
];

// ─── Navigation Component ─────────────────────────────────────────────────────
function Navbar() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="swiss-cross" aria-hidden="true" />
            <span className="text-xl font-bold text-gray-900">
              Sun<span className="text-primary-600">Tax</span>
            </span>
          </div>

          {/* Nav links */}
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Features
            </a>
            <a href="#cantons" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              Cantons
            </a>
            <a href="#about" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
              About
            </a>
          </div>

          {/* Auth buttons */}
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign In
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">
                Get Started Free
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </nav>
  );
}

// ─── Hero Section ─────────────────────────────────────────────────────────────
function HeroSection() {
  return (
    <section className="relative pt-24 pb-20 overflow-hidden gradient-hero">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-32 w-96 h-96 bg-primary-50 rounded-full opacity-60 blur-3xl" />
        <div className="absolute top-20 -left-20 w-72 h-72 bg-red-50 rounded-full opacity-40 blur-3xl" />
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
        <div className="text-center max-w-4xl mx-auto">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 bg-red-50 border border-red-100 text-primary-600 text-sm font-medium px-4 py-1.5 rounded-full mb-6">
            <Star className="w-3.5 h-3.5 fill-current" />
            New: AI-Powered Document Analysis for 2026
          </div>

          {/* Headline */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6 text-balance">
            Your Tax Return.{' '}
            <span className="text-primary-600">Simple.</span>{' '}
            <span className="text-primary-600">Secure.</span>{' '}
            <span className="text-primary-600">Intelligent.</span>
          </h1>

          {/* Subheadline */}
          <p className="text-xl text-gray-600 mb-8 max-w-2xl mx-auto text-balance">
            SunTax analyses your tax documents with AI, calculates your taxes for all 26
            Swiss cantons, and prepares a complete tax return — in minutes, not hours.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <Link href="/register">
              <Button size="xl" className="w-full sm:w-auto shadow-swiss">
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="#features">
              <Button size="xl" variant="outline" className="w-full sm:w-auto">
                Learn More
              </Button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="flex flex-wrap gap-6 justify-center text-sm text-gray-500">
            {[
              'Free to register',
              'Swiss data privacy',
              'All 26 cantons',
              'eCH-0196 export',
            ].map((item) => (
              <div key={item} className="flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Hero visual */}
        <div className="mt-16 relative max-w-4xl mx-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden">
            {/* Fake browser chrome */}
            <div className="bg-gray-50 border-b border-gray-100 px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <div className="w-3 h-3 rounded-full bg-yellow-400" />
                <div className="w-3 h-3 rounded-full bg-green-400" />
              </div>
              <div className="flex-1 bg-white rounded-md px-3 py-1 text-xs text-gray-400 text-center border border-gray-200">
                app.suntax.ch/dashboard
              </div>
            </div>
            {/* Dashboard preview */}
            <div className="p-6 bg-gray-50">
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'Tax Returns', value: '2', color: 'bg-blue-500' },
                  { label: 'Documents', value: '12', color: 'bg-green-500' },
                  { label: 'Total Tax', value: "CHF 8'450", color: 'bg-primary-600' },
                ].map((card) => (
                  <div key={card.label} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className={`w-8 h-8 ${card.color} rounded-lg mb-2`} />
                    <div className="text-lg font-bold text-gray-900">{card.value}</div>
                    <div className="text-xs text-gray-500">{card.label}</div>
                  </div>
                ))}
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-semibold text-gray-700">Tax Return 2025 – Zurich</div>
                  <div className="px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">Complete</div>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2">
                  <div className="bg-primary-600 h-2 rounded-full" style={{ width: '85%' }} />
                </div>
                <div className="text-xs text-gray-400 mt-1">85% complete</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Features Section ─────────────────────────────────────────────────────────
function FeaturesSection() {
  return (
    <section id="features" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">
            Everything you need for your Swiss tax return
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            From document analysis to final export — SunTax guides you through the entire tax process.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="group p-6 rounded-2xl border border-gray-100 hover:border-primary-100 hover:shadow-card-hover transition-all duration-300 bg-white"
              >
                <div className={`w-12 h-12 ${feature.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <Icon className={`w-6 h-6 ${feature.color}`} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Cantons Section ──────────────────────────────────────────────────────────
function CantonsSection() {
  return (
    <section id="cantons" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Supported Cantons
          </h2>
          <p className="text-gray-600">
            SunTax supports all 26 Swiss cantons with canton-specific tax rates and municipal multipliers.
          </p>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-9 gap-3">
          {SUPPORTED_CANTONS.map((canton) => (
            <div
              key={canton.code}
              className="flex flex-col items-center p-3 bg-white rounded-xl border border-gray-100 hover:border-primary-200 hover:shadow-sm transition-all cursor-default"
            >
              <div className="w-8 h-8 bg-primary-600 text-white rounded-md flex items-center justify-center text-xs font-bold mb-1">
                {canton.code}
              </div>
              <span className="text-xs text-gray-600 text-center leading-tight">{canton.name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── CTA Section ─────────────────────────────────────────────────────────────
function CTASection() {
  return (
    <section className="py-20 gradient-swiss">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
          Start with SunTax today
        </h2>
        <p className="text-red-100 text-lg mb-8 max-w-xl mx-auto">
          Register for free and complete your first Swiss tax return in minutes.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/register">
            <Button
              size="xl"
              className="bg-white text-primary-600 hover:bg-gray-50 w-full sm:w-auto font-semibold shadow-lg"
            >
              Register for Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
          <Link href="/login">
            <Button
              size="xl"
              variant="outline"
              className="border-white text-white hover:bg-white/10 w-full sm:w-auto"
            >
              Already registered? Sign In
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="swiss-cross" style={{ transform: 'scale(0.8)' }} aria-hidden="true" />
              <span className="text-xl font-bold text-white">
                Sun<span className="text-red-400">Tax</span>
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-xs">
              The intelligent Swiss tax return platform. Secure, precise and simple.
            </p>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Product</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="#features" className="hover:text-white transition-colors">Features</a></li>
              <li><a href="#cantons" className="hover:text-white transition-colors">Cantons</a></li>
              <li><Link href="/register" className="hover:text-white transition-colors">Register</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-semibold mb-3 text-sm">Legal</h4>
            <ul className="space-y-2 text-sm">
              <li><a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a></li>
              <li><a href="/terms" className="hover:text-white transition-colors">Terms of Use</a></li>
              <li><a href="/imprint" className="hover:text-white transition-colors">Imprint</a></li>
            </ul>
          </div>
        </div>
        <div className="border-t border-gray-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-sm">© 2026 SunTax GmbH. All rights reserved.</p>
          <p className="text-xs text-gray-500">
            Built in 🇨🇭 Switzerland · Data stored in Switzerland
          </p>
        </div>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <main className="min-h-screen">
      <Navbar />
      <HeroSection />
      <FeaturesSection />
      <CantonsSection />
      <CTASection />
      <Footer />
    </main>
  );
}
