import Link from 'next/link'
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-2xl shadow-sm border border-slate-200 space-y-8">
        <div className="flex items-center justify-between border-b pb-4">
          <Link href="/" className="text-sm font-semibold text-red-600 hover:text-red-700 flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Zurück zu SunTax
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Schweizer Datenschutzgesetz (nDSG)
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Datenschutzerklärung (Datenschutz)
          </h1>
          <p className="text-xs text-slate-500 mt-1">Konformität mit dem Schweizer Datenschutzgesetz (nDSG / revDSG)</p>
        </div>

        <section className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <h2 className="text-base font-bold text-slate-900">1. Grundsatz und Verantwortlichkeit</h2>
          <p>
            Der Schutz Ihrer persönlichen und finanziellen Steuerdaten hat für SunTax höchste Priorität.
            Wir verarbeiten Personendaten streng nach den Vorschriften des Schweizerischen Bundesgesetzes über den
            Datenschutz (nDSG) und gewährleisten ein Höchstmass an Vertraulichkeit und technischer Datensicherheit.
          </p>

          <h2 className="text-base font-bold text-slate-900">2. Erhebung und Zweck der Datenverarbeitung</h2>
          <p>
            Wir verarbeiten ausschliesslich Daten, die Sie uns im Rahmen der Erstellung Ihrer Steuererklärung zur Verfügung stellen:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1 text-slate-600">
            <li>Stammdaten: Name, Wohnadresse, Zivilstand, Geburtsdatum, AHV-Nummer (falls auf Dokumenten angegeben).</li>
            <li>Steuerdokumente: Lohnausweise, Bankauszüge, Säule-3a-Bescheinigungen, Spendenbelege, Versicherungsausweise.</li>
            <li>Steuerberechnungen: Erfasste Abzüge, Einkommenswerte und Vermögenssalden.</li>
          </ul>
          <p>
            Zweck der Verarbeitung ist ausschliesslich die automatisierte Extraktion, die korrekte steuergesetzliche Berechnung
            nach den Richtlinien der Eidgenössischen Steuerverwaltung (ESTV) und der kantonalen Steuerämter sowie die
            Bereitstellung der amtlichen Deklarationsdokumente.
          </p>

          <h2 className="text-base font-bold text-slate-900">3. Speicherung und Verschlüsselung</h2>
          <p>
            Alle hochgeladenen Dokumente und steuerrelevanten Profildaten werden in sicheren Cloud-Speichern mit
            Ende-zu-Ende-Verschlüsselung (AES-256 / SSE-KMS) gespeichert. Die Datenübertragung erfolgt ausnahmslos über
            verschlüsselte TLS 1.3-Verbindungen mit Perfect Forward Secrecy.
          </p>

          <h2 className="text-base font-bold text-slate-900">4. Keine Weitergabe an Dritte</h2>
          <p>
            Ihre Steuerdaten werden zu keinem Zeitpunkt verkauft, vermarktet oder an unbefugte Dritte weitergegeben.
            Die Übermittlung an kantonale Steuerbehörden erfolgt ausschliesslich durch Ihren ausdrücklichen Auftrag
            und Ihre Bestätigung.
          </p>

          <h2 className="text-base font-bold text-slate-900">5. Ihre Rechte (Auskunft und Löschung)</h2>
          <p>
            Sie haben jederzeit das Recht auf unentgeltliche Auskunft über Ihre bei uns gespeicherten Personendaten sowie
            das Recht auf Berichtigung, Sperrung oder vollständige Löschung Ihrer Daten und Steuererklärungsunterlagen.
            Sie können Ihr Konto und sämtliche zugehörigen Dokumente jederzeit direkt in Ihrem Profil unwiderruflich löschen.
          </p>
        </section>

        <div className="pt-6 border-t flex justify-end">
          <Button asChild className="bg-red-600 hover:bg-red-700 text-white font-semibold text-xs">
            <Link href="/register">Zurück zur Registrierung</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
