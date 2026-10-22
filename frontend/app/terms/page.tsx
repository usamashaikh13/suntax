import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-3xl mx-auto bg-white p-8 sm:p-12 rounded-2xl shadow-sm border border-slate-200 space-y-8">
        <div className="flex items-center justify-between border-b pb-4">
          <Link href="/" className="text-sm font-semibold text-red-600 hover:text-red-700 flex items-center gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Zurück zu SunTax
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <ShieldCheck className="h-4 w-4 text-emerald-600" /> Schweizer Recht (Art. 110 DBG)
          </div>
        </div>

        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Allgemeine Geschäftsbedingungen (AGB)
          </h1>
          <p className="text-xs text-slate-500 mt-1">Stand: Januar 2025 – SunTax Schweiz</p>
        </div>

        <section className="space-y-4 text-sm text-slate-700 leading-relaxed">
          <h2 className="text-base font-bold text-slate-900">1. Geltungsbereich und Zweck</h2>
          <p>
            SunTax ist eine digitale Softwarelösung zur automatisierten Vorbereitung und Erstellung von Schweizer
            Steuererklärungen für Privatpersonen. SunTax erbringt softwaregestützte Berechnungs- und Aufbereitungsdienste
            auf Grundlage der vom Benutzer hochgeladenen Dokumente und gemachten Angaben.
          </p>

          <h2 className="text-base font-bold text-slate-900">2. Selbstdeklarationsprinzip und Verantwortung</h2>
          <p>
            Gemäss Art. 110 des Bundesgesetzes über die direkte Bundessteuer (DBG) sowie den kantonalen Steuergesetzen gilt
            in der Schweiz das <strong>Selbstdeklarationsprinzip</strong>. Der Steuerpflichtige ist allein für die
            Vollständigkeit, Richtigkeit und rechtzeitige Einreichung seiner Steuererklärung verantwortlich.
          </p>
          <p>
            SunTax ist weder ein bevollmächtigter Treuhänder noch eine Steuerbehörde. Die von SunTax berechneten Steuerbeträge
            stellen rechtlich unverbindliche Schätzungen (<strong>« ca. CHF … »</strong>) dar. Die rechtskräftige Veranlagung
            erfolgt ausschliesslich durch das zuständige kantonale bzw. kommunale Steueramt.
          </p>

          <h2 className="text-base font-bold text-slate-900">3. Gebühren und Bezahlung</h2>
          <p>
            Die Nutzung der Basisfunktionen bis zur finalen Freigabe ist transparent ausgewiesen. Für die finale Erstellung,
            den Download der amtlichen Steuererklärungsunterlagen und den Export wird eine einmalige Pauschale von
            <strong> CHF 39.00</strong> (inkl. MwSt.) erhoben. Die Zahlung erfolgt über anerkannte schweizerische Zahlungsanbieter
            (TWINT oder Kreditkarte). SunTax speichert selbst zu keinem Zeitpunkt Kreditkartendaten.
          </p>

          <h2 className="text-base font-bold text-slate-900">4. Haftungsausschluss</h2>
          <p>
            SunTax übernimmt keine Haftung für Nachsteuern, Verzugszinsen, Veranlagungsverfügungen oder Bussen der Steuerämter,
            die aus fehlerhaften, unvollständigen oder verspäteten Angaben des Nutzers resultieren.
          </p>

          <h2 className="text-base font-bold text-slate-900">5. Anwendbares Recht und Gerichtsstand</h2>
          <p>
            Auf sämtliche Rechtsbeziehungen zwischen dem Nutzer und SunTax findet ausschliesslich schweizerisches materielles
            Recht Anwendung. Ausschliesslicher Gerichtsstand ist Zürich, Schweiz.
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
