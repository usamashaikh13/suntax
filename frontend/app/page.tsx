'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { useTranslation } from '@/lib/i18n/LanguageContext';
import './landing_redesign.css';

interface CantonMeta {
  code: string;
  name: string;
  nameEn: string;
  rate: string;
}

const CANTONS: CantonMeta[] = [
  { code: 'ZH', name: 'Zürich', nameEn: 'Zurich', rate: '119%' },
  { code: 'BE', name: 'Bern', nameEn: 'Bern', rate: '154%' },
  { code: 'LU', name: 'Luzern', nameEn: 'Lucerne', rate: '175%' },
  { code: 'UR', name: 'Uri', nameEn: 'Uri', rate: '98%' },
  { code: 'SZ', name: 'Schwyz', nameEn: 'Schwyz', rate: '120%' },
  { code: 'OW', name: 'Obwalden', nameEn: 'Obwalden', rate: '140%' },
  { code: 'NW', name: 'Nidwalden', nameEn: 'Nidwalden', rate: '120%' },
  { code: 'GL', name: 'Glarus', nameEn: 'Glarus', rate: '63%' },
  { code: 'ZG', name: 'Zug', nameEn: 'Zug', rate: '82%' },
  { code: 'FR', name: 'Freiburg', nameEn: 'Fribourg', rate: '81%' },
  { code: 'SO', name: 'Solothurn', nameEn: 'Solothurn', rate: '115%' },
  { code: 'BS', name: 'Basel-Stadt', nameEn: 'Basel-City', rate: '100%' },
  { code: 'BL', name: 'Basel-Landschaft', nameEn: 'Basel-Country', rate: '65%' },
  { code: 'SH', name: 'Schaffhausen', nameEn: 'Schaffhausen', rate: '95%' },
  { code: 'AR', name: 'Appenzell AR', nameEn: 'Appenzell AR', rate: '430%' },
  { code: 'AI', name: 'Appenzell AI', nameEn: 'Appenzell AI', rate: '94%' },
  { code: 'SG', name: 'St. Gallen', nameEn: 'St. Gallen', rate: '144%' },
  { code: 'GR', name: 'Graubünden', nameEn: 'Grisons', rate: '90%' },
  { code: 'AG', name: 'Aargau', nameEn: 'Aargau', rate: '95%' },
  { code: 'TG', name: 'Thurgau', nameEn: 'Thurgau', rate: '62%' },
  { code: 'TI', name: 'Tessin', nameEn: 'Ticino', rate: '77%' },
  { code: 'VD', name: 'Waadt', nameEn: 'Vaud', rate: '78%' },
  { code: 'VS', name: 'Wallis', nameEn: 'Valais', rate: '110%' },
  { code: 'NE', name: 'Neuenburg', nameEn: 'Neuchâtel', rate: '70%' },
  { code: 'GE', name: 'Genf', nameEn: 'Geneva', rate: '45%' },
  { code: 'JU', name: 'Jura', nameEn: 'Jura', rate: '195%' },
];

const CANTON_BENCHMARKS_2025: Record<string, [number | null, number, number, number, string]> = {
  ZH: [5200, 2900, 9300, 25000, "31. März"],
  BE: [7000, 2450, 8300, 16000, "15. März"],
  LU: [6500, 2600, 8000, 20000, "30 Tage nach Zustellung"],
  UR: [13000, 1800, 8500, 25800, "31. März"],
  SZ: [8000, 3200, 9000, 6000, "31. März"],
  OW: [10000, 1700, 6200, 10000, "31. März"],
  NW: [6000, 1800, 6400, 8100, "31. März"],
  GL: [null, 3100, 7200, 25800, "31. März"],
  ZG: [6000, 3500, 12600, 25400, "30. April"],
  FR: [12000, 4810, 8600, 12000, "31. März"],
  SO: [7000, 2500, 9000, 25000, "31. März"],
  BS: [3200, 4200, 9000, 26000, "31. März"],
  BL: [6000, 2000, 0, 10000, "31. März"],
  SH: [6000, 3750, 8400, 9400, "31. März"],
  AR: [6000, 2700, 7400, 25000, "31. März"],
  AI: [null, 2900, 6000, 18000, "30. April"],
  SG: [8000, 3400, 10800, 26700, "31. März"],
  GR: [null, 4600, 9900, 10900, "31. März"],
  AG: [7000, 3600, 9300, 25000, "31. März"],
  TG: [6000, 3500, 7400, 10100, "31. März"],
  TI: [null, 5500, 11500, 26200, "30. April"],
  VD: [null, 5000, 0, 15200, "15. März"],
  VS: [null, 3620, 8940, 10000, "31. März"],
  NE: [null, 2500, 6700, 20400, "laut Steuerbrief"],
  GE: [534, 2345, 13660, 26320, "31. März"],
  JU: [null, 3400, 5700, 10600, "31. März"]
};

const CANTON_BENCHMARKS_2026: Record<string, [number | null, number, number]> = {
  ZH: [5200, 2900, 9400],
  AG: [7000, 3800, 9500],
  SZ: [8000, 4200, 10000],
  SO: [7200, 2600, 9300],
  VS: [null, 3800, 8940]
};

const FAQ_ITEMS = [
  {
    qDe: 'Was kostet SunTax?',
    aDe: 'CHF 39 pro Steuererklärung – Endpreis, alles inbegriffen, keine weiteren Kosten. Ehepaare und eingetragene Paare zahlen einmal. Bezahlt wird erst vor dem Einreichen.',
    qEn: 'How much does SunTax cost?',
    aEn: 'CHF 39 per tax return – all-inclusive final price, no additional charges. Married and registered couples pay once. Payment is only required before final submission.',
  },
  {
    qDe: 'Wer berechnet meine Steuer?',
    aDe: 'Die definitive Steuer berechnet dein kantonales Steueramt. SunTax sammelt deine Angaben, wendet die Abzüge deines Kantons und des Bundes an und zeigt dir vorher eine Schätzung.',
    qEn: 'Who calculates my taxes?',
    aEn: 'The definitive tax is calculated by your cantonal tax office. SunTax collects your details, applies the statutory deductions for your canton and federal level, and displays a precise calculation beforehand.',
  },
  {
    qDe: 'Wie wird meine Erklärung eingereicht?',
    aDe: 'Du prüfst die Übersicht und bestätigst sie. SunTax erstellt dein vollständiges Dossier fertig zum Ausdrucken und Unterschreiben (Postversand). Sobald dein Kanton die elektronische Schnittstelle freigibt, erfolgt die Übermittlung direkt.',
    qEn: 'How is my tax return filed?',
    aEn: 'You review and approve the summary. SunTax generates your complete dossier ready to print and sign for postal filing. Direct electronic transmission will be enabled as soon as your canton opens its official interface.',
  },
  {
    qDe: 'Sind meine Daten sicher?',
    aDe: 'Deine Daten werden verschlüsselt auf Servern in der Schweiz gespeichert und pro Nutzer getrennt. Wir halten das Schweizer Datenschutzgesetz (DSG) ein und verkaufen deine Daten nie. Weitergegeben werden sie nur, wo es für den Dienst nötig ist – an dein Steueramt beim Einreichen und an unsere Dienstleister in der Schweiz.',
    qEn: 'Is my data secure?',
    aEn: 'Your data is encrypted and stored exclusively on servers in Switzerland, strictly segregated per user. We comply with the Swiss Federal Act on Data Protection (FADP/DSG) and never sell your information.',
  },
  {
    qDe: 'Für wen ist SunTax (noch) nicht geeignet?',
    aDe: 'Noch nicht für Selbstständige, vermietete Liegenschaften und Personen mit Quellensteuer. Das prüfen wir am Anfang – bevor du etwas bezahlst.',
    qEn: 'Who is SunTax not yet suitable for?',
    aEn: 'Not yet for self-employed individuals, rental property owners, and taxpayers subject to withholding tax (Quellensteuer). We verify this right at the beginning before you pay anything.',
  },
  {
    qDe: 'Welche Dokumente brauche ich?',
    aDe: 'Deinen Lohnausweis oder deine Rentenbescheinigung und die Jahresauszüge deiner Bank (oder den E-Steuerauszug aus dem E-Banking). Dazu alles, was Abzüge bringt: Säule 3a, Krankenkasse, Kita, Weiterbildung, Spenden. Fehlt etwas, fragen wir nach – oder du tippst es selbst ein.',
    qEn: 'Which documents do I need?',
    aEn: 'Your salary certificate (Lohnausweis) or pension statement, and annual bank statements (or e-tax statement). In addition, anything qualifying for deductions: Pillar 3a, health insurance, childcare, further education, donations.',
  },
  {
    qDe: 'Ist SunTax eine Steuerberatung?',
    aDe: 'Nein. SunTax hilft dir, deine Steuererklärung korrekt und vollständig auszufüllen, und zeigt dir die Abzüge, die dir gesetzlich zustehen. Für die Angaben bist du verantwortlich – du prüfst und bestätigst alles vor dem Einreichen.',
    qEn: 'Is SunTax a tax consultancy or fiduciary?',
    aEn: 'No. SunTax is an intelligent self-service platform that helps you complete your tax return accurately and highlights eligible deductions. You remain responsible for your disclosures and verify everything prior to filing.',
  },
  {
    qDe: 'Was passiert, wenn das Steueramt etwas anders sieht?',
    aDe: 'Das Steueramt prüft jede Erklärung und kann Angaben korrigieren. Du bekommst dann die Veranlagung mit Begründung. Bist du nicht einverstanden, kannst du innert 30 Tagen schriftlich Einsprache erheben – die Frist steht auf der Veranlagung.',
    qEn: 'What happens if the tax office adjusts an amount?',
    aEn: 'The tax authority reviews every filing and may adjust deductions. You will receive an official tax assessment notice stating any differences. If you disagree, you can file a written objection (Einsprache) within 30 days.',
  },
  {
    qDe: 'Wie lange speichert ihr meine Dokumente?',
    aDe: 'Bis du sie löschst – das geht jederzeit mit einem Klick, für einzelne Dokumente oder dein ganzes Konto. Meldest du dich 2 Jahre lang nicht an, löschen wir dein Konto automatisch; vorher fragen wir per E-Mail nach. Bewahre die Originalbelege auf, mindestens bis deine Veranlagung rechtskräftig ist – das Steueramt kann sie nachfordern.',
    qEn: 'How long do you retain my documents?',
    aEn: 'Until you delete them – which is possible at any time with a single click, for individual files or your entire account. Keep your original receipts until your tax assessment becomes final and legally binding.',
  },
];

export default function LandingPage() {
  const { isGerman } = useTranslation();
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedCantonIndex, setSelectedCantonIndex] = useState<number>(0);

  const activeCanton: CantonMeta = (CANTONS[selectedCantonIndex] || CANTONS[0]) as CantonMeta;
  const isZH = activeCanton.code === 'ZH';

  // Benchmark formatting
  const formatAmount = (val: number | null | undefined): string => {
    if (val === null || val === undefined) return isGerman ? 'unbegrenzt' : 'unlimited';
    if (val === 0) return isGerman ? 'über Tarif' : 'via tariff';
    return Number(val).toLocaleString('en-US').replace(/,/g, '’');
  };

  const getDeadline = (code: string, year: number): string => {
    const rawMap: Record<string, string> = {
      BE: '15. März',
      VD: '15. März',
      ZG: '30. April',
      AI: '30. April',
      TI: '30. April',
      LU: isGerman ? '30 Tage nach Zustellung' : '30 days after receipt',
      NE: isGerman ? 'laut Steuerbrief' : 'as stated on tax letter',
    };
    const defaultDate = '31. März';
    const dateStr = rawMap[code] || defaultDate;

    if (year === 2025) {
      if (/^\d{1,2}\. /.test(dateStr)) {
        return `${dateStr} 2026 (${isGerman ? 'vorbei' : 'passed'})`;
      }
      return isGerman ? 'vorbei' : 'passed';
    }
    if (/^\d{1,2}\. /.test(dateStr)) {
      return `${dateStr} 2027`;
    }
    return dateStr;
  };

  const deadline = getDeadline(activeCanton.code, selectedYear);

  // Benchmarks for Canton vs Bund
  const bm25 = CANTON_BENCHMARKS_2025[activeCanton.code] || [6000, 3000, 8000, 10000, '31. März'];
  const bm26 = CANTON_BENCHMARKS_2026[activeCanton.code];

  const commuteCanton = selectedYear === 2026 && bm26 ? bm26[0] : bm25[0];
  const insuranceCanton = selectedYear === 2026 && bm26 ? bm26[1] : bm25[1];
  const childCanton = selectedYear === 2026 && bm26 ? bm26[2] : bm25[2];

  const benchmarkRows = [
    {
      kDe: 'Säule 3a',
      kEn: 'Pillar 3a',
      c: '7’258',
      b: '7’258',
    },
    {
      kDe: 'Arbeitsweg',
      kEn: 'Commuting expenses',
      c: formatAmount(commuteCanton),
      b: '3’300',
    },
    {
      kDe: 'Kinderabzug pro Kind',
      kEn: 'Child deduction',
      c: formatAmount(childCanton),
      b: '6’800',
    },
    {
      kDe: 'Versicherungen (ledig)',
      kEn: 'Insurance (single)',
      c: formatAmount(insuranceCanton),
      b: '1’800',
    },
  ];

  const cantonNote = (() => {
    if (isZH) {
      return isGerman
        ? `Steuerjahr ${selectedYear} · Dossier bereit zum Ausdrucken & Unterschreiben (Postversand). Elektronische Übermittlung ab 2027.`
        : `Tax year ${selectedYear} · Dossier ready to print & sign (postal filing). Direct electronic filing available from 2027.`;
    }
    return isGerman
      ? `Bund ${selectedYear} bestätigt. ${activeCanton.name}: Beträge ${selectedYear} als Richtwert · Dossier-Generierung kommt bald.`
      : `Federal ${selectedYear} confirmed. ${activeCanton.nameEn}: ${selectedYear} benchmark amounts · Dossier generation coming soon.`;
  })();

  const cantonCtaText = isGerman
    ? `Mit ${activeCanton.name} starten`
    : `Start with ${activeCanton.nameEn}`;

  return (
    <div
      style={{
        fontFamily: "'Geist', system-ui, sans-serif",
        color: '#0A0A0A',
        background: '#FFFFFF',
        fontSize: '18px',
        lineHeight: 1.6,
        overflowX: 'hidden',
      }}
    >
      {/* ─── 1. HEADER ────────────────────────────────────────────────────────── */}
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          background: 'rgba(255,255,255,.8)',
          backdropFilter: 'saturate(1.6) blur(14px)',
          WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
          borderBottom: '1px solid #EEEEEE',
        }}
      >
        <div
          className="wrap"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            height: '68px',
          }}
        >
          <Link
            href="#top"
            aria-label="SunTax Startseite"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '9px',
              textDecoration: 'none',
              color: '#15181D',
            }}
          >
            <svg width="25" height="29" viewBox="0 0 40 46" aria-hidden="true">
              <path
                d="M4 0H27L38 11V28L23 43H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z"
                fill="#15181D"
              />
              <path d="M27 0L38 11H30a3 3 0 0 1-3-3z" fill="#D6D6D6" />
              <path
                d="M9.5 17.5h4.5V13h5v4.5h4.5v5H19V27h-5v-4.5H9.5z"
                fill="#FFFFFF"
              />
              <rect x="28" y="33" width="10" height="3" rx="1" fill="#6B6F76" />
              <rect x="23" y="39" width="15" height="3" rx="1" fill="#6B6F76" />
            </svg>
            <span
              style={{
                fontSize: '22px',
                letterSpacing: '-0.04em',
                lineHeight: 1,
              }}
            >
              <span style={{ fontWeight: 800, color: '#15181D' }}>Sun</span>
              <span style={{ fontWeight: 600, color: '#4B4F57' }}>Tax</span>
            </span>
          </Link>

          <nav
            className="navlinks"
            aria-label="Hauptmenü"
            style={{ fontSize: '16px' }}
          >
            <a href="#ablauf">{isGerman ? "So funktioniert's" : 'How it works'}</a>
            <a href="#leistungen">{isGerman ? 'Vergleich' : 'Comparison'}</a>
            <a href="#sicherheit">{isGerman ? 'Sicherheit' : 'Security'}</a>
            <a href="#preis">{isGerman ? 'Preis' : 'Pricing'}</a>
            <a href="#faq">{isGerman ? 'Fragen' : 'FAQ'}</a>
          </nav>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              fontSize: '15px',
            }}
          >
            <LanguageSwitcher />
            <Link
              href="/login"
              className="hide-sm"
              style={{ textDecoration: 'none', color: '#555555' }}
            >
              {isGerman ? 'Anmelden' : 'Log in'}
            </Link>
            <Link
              href="/register"
              className="btn btn-dark"
              style={{
                background: '#0A0A0A',
                color: '#FFFFFF',
                textDecoration: 'none',
                padding: '10px 18px',
                borderRadius: '999px',
                fontWeight: 600,
                minHeight: '44px',
                boxSizing: 'border-box',
                display: 'inline-flex',
                alignItems: 'center',
              }}
            >
              {isGerman ? 'Jetzt starten' : 'Get started'}
            </Link>
          </div>
        </div>
      </header>

      {/* ─── 2. HERO SECTION (#top) ────────────────────────────────────────────── */}
      <section id="top" className="thhero">
        <div className="wrap thgrid">
          <div>
            <h1
              className="hero-h in"
              style={{
                margin: 0,
                fontSize: '64px',
                lineHeight: 1.05,
                letterSpacing: '-0.04em',
                fontWeight: 700,
                animationDelay: '80ms',
              }}
            >
              {isGerman ? (
                <>
                  Deine Steuererklärung.
                  <br />
                  <span style={{ color: '#1E7B52' }}>
                    In wenigen Minuten erledigt.
                  </span>
                </>
              ) : (
                <>
                  Your Swiss tax return.
                  <br />
                  <span style={{ color: '#1E7B52' }}>
                    Completed in minutes.
                  </span>
                </>
              )}
            </h1>
            <p
              className="in thlead"
              style={{ animationDelay: '160ms' }}
            >
              {isGerman
                ? 'Belege hochladen, ein paar Fragen beantworten, einreichen. SunTax führt dich Schritt für Schritt – für CHF 39.'
                : 'Upload receipts, answer a few questions, file. SunTax guides you step by step – for CHF 39.'}
            </p>
            <div
              className="in"
              style={{
                marginTop: '34px',
                display: 'flex',
                gap: '12px',
                flexWrap: 'wrap',
                animationDelay: '240ms',
              }}
            >
              <Link
                href="/register"
                className="btn btn-red thbtn"
                style={{ background: '#1E7B52', color: '#FFFFFF' }}
              >
                {isGerman ? 'Jetzt starten' : 'Get started'}
                <svg
                  className="arr"
                  width="18"
                  height="18"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8h12M9 3l5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </Link>
              <a href="#ablauf" className="btn thbtn thbtn2">
                {isGerman ? "So funktioniert's" : 'How it works'}
              </a>
            </div>
          </div>

          <div className="thcardwrap in" style={{ animationDelay: '200ms' }}>
            <div className="thcard kw">
              {/* Year Toggle */}
              <div className="kwtop">
                <p
                  style={{
                    margin: 0,
                    fontSize: '15px',
                    fontWeight: 600,
                    color: '#555555',
                  }}
                >
                  {isGerman ? 'Was gilt in deinem Kanton?' : 'What applies in your canton?'}
                </p>
                <div className="kwyr" role="group" aria-label="Steuerjahr">
                  <button
                    type="button"
                    onClick={() => setSelectedYear(2026)}
                    aria-pressed={selectedYear === 2026}
                    style={{
                      border: 0,
                      cursor: 'pointer',
                      borderRadius: '9px',
                      padding: '6px 12px',
                      font: 'inherit',
                      fontSize: '14px',
                      fontWeight: 700,
                      minHeight: '36px',
                      background: selectedYear === 2026 ? '#FFFFFF' : 'transparent',
                      color: selectedYear === 2026 ? '#14181F' : '#6E6E6E',
                      boxShadow: selectedYear === 2026 ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
                    }}
                  >
                    2026
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedYear(2025)}
                    aria-pressed={selectedYear === 2025}
                    style={{
                      border: 0,
                      cursor: 'pointer',
                      borderRadius: '9px',
                      padding: '6px 12px',
                      font: 'inherit',
                      fontSize: '14px',
                      fontWeight: 700,
                      minHeight: '36px',
                      background: selectedYear === 2025 ? '#FFFFFF' : 'transparent',
                      color: selectedYear === 2025 ? '#14181F' : '#6E6E6E',
                      boxShadow: selectedYear === 2025 ? '0 1px 3px rgba(0,0,0,.15)' : 'none',
                    }}
                  >
                    2025
                  </button>
                </div>
              </div>

              {/* Canton Select */}
              <div className="kwsel">
                <select
                  aria-label={isGerman ? 'Kanton wählen' : 'Select canton'}
                  value={selectedCantonIndex}
                  onChange={(e) => setSelectedCantonIndex(parseInt(e.target.value, 10) || 0)}
                >
                  {CANTONS.map((c, i) => (
                    <option key={c.code} value={i}>
                      {isGerman ? c.name : c.nameEn} ({c.code})
                    </option>
                  ))}
                </select>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#14181F"
                  strokeWidth="2.2"
                  aria-hidden="true"
                >
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>

              {/* Deadline */}
              <div className="kwdl">
                <span>{isGerman ? 'Abgabefrist' : 'Filing deadline'}</span>
                <b>{deadline}</b>
              </div>

              {/* Benchmark Table */}
              <div className="kwh">
                <span></span>
                <span>{isGerman ? 'Kanton' : 'Canton'}</span>
                <span>{isGerman ? 'Bund' : 'Federal'}</span>
              </div>
              {benchmarkRows.map((r, idx) => (
                <div key={idx} className="kwr">
                  <span>{isGerman ? r.kDe : r.kEn}</span>
                  <b>{r.c}</b>
                  <b>{r.b}</b>
                </div>
              ))}

              {/* CTA button */}
              <Link
                href="/register"
                className="btn btn-red kwbtn"
                style={{ background: '#1E7B52', textDecoration: 'none' }}
              >
                {cantonCtaText}
                <svg
                  className="arr"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8h12M9 3l5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </Link>

              {/* Canton Note & Strict Postal/Dossier Badge */}
              <div
                style={{
                  marginTop: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                {isZH ? (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: '#DCFCE7',
                      color: '#166534',
                    }}
                  >
                    {isGerman ? 'Dossier bereit (Postversand)' : 'Dossier ready (postal filing)'}
                  </span>
                ) : (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: '999px',
                      background: '#FEF3C7',
                      color: '#92400E',
                    }}
                  >
                    {isGerman ? 'Kommt bald (Info)' : 'Coming soon (Info)'}
                  </span>
                )}
              </div>
              <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: '#6E6E6E' }}>
                {cantonNote}
              </p>
            </div>

            {/* Swiss Security Badge */}
            <div className="thbadge">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16A34A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2" />
              </svg>
              <span>
                {isGerman
                  ? 'Verschlüsselt · Server in der Schweiz'
                  : 'Encrypted · Servers in Switzerland'}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 3. TRUST BAR (.thtrust) ───────────────────────────────────────────── */}
      <section className="thtrust">
        <div className="wrap thtrustgrid">
          <div className="reveal">
            <span className="thtic">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
              </svg>
            </span>
            <span>{isGerman ? 'Schweizer Unternehmen' : 'Swiss company'}</span>
          </div>
          <div className="reveal">
            <span className="thtic">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5zM12 15v2" />
              </svg>
            </span>
            <span>{isGerman ? 'Daten in der Schweiz' : 'Data in Switzerland'}</span>
          </div>
          <div className="reveal">
            <span className="thtic">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M7 3h7l4 4v14H7zM14 3v4h4M10 12h5M10 16h5" />
              </svg>
            </span>
            <span>{isGerman ? 'Alle 26 Kantone' : 'All 26 cantons'}</span>
          </div>
          <div className="reveal">
            <span className="thtic">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M3 12V4h8l10 10-8 8L3 12zM7.5 7.5h.01" />
              </svg>
            </span>
            <span>{isGerman ? 'Fixpreis CHF 39' : 'Fixed price CHF 39'}</span>
          </div>
        </div>
      </section>

      {/* ─── 4. HOW IT WORKS (#ablauf) ─────────────────────────────────────────── */}
      <section id="ablauf" style={{ background: '#FFFFFF' }}>
        <div className="wrap thsec">
          <div className="thhead">
            <p className="reveal thkick">
              {isGerman ? "So funktioniert's" : 'How it works'}
            </p>
            <h2 className="sec-h reveal thh2">
              {isGerman
                ? 'In drei Schritten zur fertigen Steuererklärung.'
                : 'To your completed tax return in three simple steps.'}
            </h2>
          </div>
          <div className="thsteps">
            <span className="thline" aria-hidden="true"></span>

            {/* Step 1 */}
            <div className="thstep reveal">
              <span className="thnum">1</span>
              <span className="sa" aria-hidden="true">
                <span className="sa1tray">
                  <span className="sa1doc">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  <span className="sa1bar">
                    <b></b>
                  </span>
                  <span className="sa1ok">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  </span>
                </span>
              </span>
              <h3>{isGerman ? 'Belege hochladen' : 'Upload receipts'}</h3>
              <p>
                {isGerman
                  ? 'Lohnausweis, Bankauszug und weitere Belege – als Foto oder PDF.'
                  : 'Salary certificate, bank statement and other receipts – as photo or PDF.'}
              </p>
            </div>

            {/* Step 2 */}
            <div className="thstep reveal">
              <span className="thnum">2</span>
              <span className="sa" aria-hidden="true">
                <span className="sa2card">
                  <span className="sa2q">
                    {isGerman ? 'Wie kommst du zur Arbeit?' : 'How do you commute to work?'}
                  </span>
                  <span className="sa2o">
                    <span className="sa2a">{isGerman ? 'ÖV' : 'Public transit'}</span>
                    <span className="sa2b">{isGerman ? 'Velo' : 'Bike'}</span>
                    <span className="sa2c">{isGerman ? 'Auto' : 'Car'}</span>
                  </span>
                </span>
              </span>
              <h3>{isGerman ? 'Fragen beantworten' : 'Answer questions'}</h3>
              <p>
                {isGerman
                  ? 'Wenige, einfache Fragen. Jede Frage ist kurz erklärt.'
                  : 'A few simple questions. Every question is clearly explained.'}
              </p>
            </div>

            {/* Step 3 */}
            <div className="thstep reveal">
              <span className="thnum">3</span>
              <span className="sa" aria-hidden="true">
                <span className="sa3card">
                  <span className="sa3doc">
                    <i></i>
                    <i></i>
                    <i></i>
                  </span>
                  <span className="sa3line"></span>
                  <span className="sa3to">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#1E7B52"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 10L12 4l9 6M5 10v9M9.5 10v9M14.5 10v9M19 10v9M3 21h18" />
                    </svg>
                    <span className="sa3ok">
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l4 4L19 6" />
                      </svg>
                    </span>
                  </span>
                </span>
              </span>
              <h3>{isGerman ? 'Prüfen und einreichen' : 'Review and file'}</h3>
              <p>
                {isGerman
                  ? 'Du siehst alles auf einen Blick und erstellst dein Dossier mit einem Klick.'
                  : 'Review everything at a glance and generate your dossier with one click.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 5. COMPARISON SECTION (#leistungen) ───────────────────────────────── */}
      <section id="leistungen" style={{ background: '#F7F5F0' }}>
        <div className="wrap thsec">
          <div className="thhead">
            <p className="reveal thkick">{isGerman ? 'Warum SunTax?' : 'Why SunTax?'}</p>
            <h2 className="sec-h reveal thh2">
              {isGerman
                ? 'Der einfache Weg zwischen Selbermachen und Treuhänder.'
                : 'The smart way between DIY and an expensive tax advisor.'}
            </h2>
          </div>
          <div className="cv reveal">
            <div className="cvr cvh">
              <div></div>
              <div>{isGerman ? 'Steuerprogramm des Kantons' : 'Cantonal software'}</div>
              <div>{isGerman ? 'Treuhänder' : 'Tax advisor'}</div>
              <div className="cvs">
                <span className="cvlogo">SunTax</span>
              </div>
            </div>

            <div className="cvr">
              <div className="cvk">{isGerman ? 'Wer füllt aus?' : 'Who fills it in?'}</div>
              <div>{isGerman ? 'Du selbst, Ziffer für Ziffer' : 'You, line by line'}</div>
              <div>{isGerman ? 'Der Treuhänder' : 'The advisor'}</div>
              <div className="cvs">
                {isGerman ? 'Du – Schritt für Schritt geführt' : 'You – guided step by step'}
              </div>
            </div>

            <div className="cvr">
              <div className="cvk">
                {isGerman ? 'Fragen in einfacher Sprache' : 'Questions in plain language'}
              </div>
              <div>
                <span className="cvn">–</span>
              </div>
              <div>
                <span className="cvy">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </span>
              </div>
              <div className="cvs">
                <span className="cvy">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="cvr">
              <div className="cvk">
                {isGerman ? 'Abzüge werden für dich gesucht' : 'Deductions found for you'}
              </div>
              <div>
                <span className="cvn">–</span>
              </div>
              <div>
                <span className="cvy">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </span>
              </div>
              <div className="cvs">
                <span className="cvy">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="cvr">
              <div className="cvk">
                {isGerman ? 'Belege per Foto einlesen' : 'Receipt scanning from photos'}
              </div>
              <div>{isGerman ? 'Je nach Kanton' : 'Varies by canton'}</div>
              <div>
                <span className="cvn">–</span>
              </div>
              <div className="cvs">
                <span className="cvy">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </span>
              </div>
            </div>

            <div className="cvr">
              <div className="cvk">
                {isGerman ? 'Einreichung' : 'Filing format'}
              </div>
              <div>
                <span className="cvy">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </span>
              </div>
              <div>
                <span className="cvy">
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12l4 4L19 6" />
                  </svg>
                </span>
              </div>
              <div className="cvs">
                <span style={{ fontSize: '13px', fontWeight: 600, color: '#1E7B52' }}>
                  {isGerman ? 'Dossier (Postversand)' : 'Dossier (postal)'}
                </span>
              </div>
            </div>

            <div className="cvr">
              <div className="cvk">
                {isGerman ? 'Zeitaufwand' : 'Time required'}
              </div>
              <div>{isGerman ? 'Je nach Fall länger' : 'Varies, usually longer'}</div>
              <div>{isGerman ? 'Termin und Unterlagen bringen' : 'Appointment & drop-off'}</div>
              <div className="cvs">{isGerman ? 'Wenige Minuten' : 'A few minutes'}</div>
            </div>

            <div className="cvr">
              <div className="cvk">{isGerman ? 'Kosten' : 'Cost'}</div>
              <div>{isGerman ? 'Gratis' : 'Free'}</div>
              <div>{isGerman ? 'Nach Aufwand (CHF 250–600)' : 'Hourly rate (CHF 250–600)'}</div>
              <div className="cvs">{isGerman ? 'CHF 39 Fixpreis' : 'CHF 39 flat fee'}</div>
            </div>
          </div>
          <p
            className="reveal"
            style={{
              margin: '22px auto 0',
              textAlign: 'center',
              color: '#6B6B6B',
              fontSize: '16px',
              maxWidth: '640px',
            }}
          >
            {isGerman
              ? 'Das Steuerprogramm des Kantons ist gratis – dafür füllst du das Formular selbst aus. Mit SunTax wirst du geführt und siehst jeden Abzug, der dir zusteht.'
              : 'Cantonal tax programs are free – but you have to decipher every form yourself. With SunTax, you are guided clearly and see every statutory deduction.'}
          </p>
        </div>
      </section>

      {/* ─── 6. SECURITY SECTION (#sicherheit) ─────────────────────────────────── */}
      <section id="sicherheit" style={{ background: '#FFFFFF' }}>
        <div className="wrap thsec">
          <div className="thhead">
            <p className="reveal thkick">{isGerman ? 'Sicherheit' : 'Security'}</p>
            <h2 className="sec-h reveal thh2">
              {isGerman ? 'Deine Daten sind bei uns sicher.' : 'Your data is safe with us.'}
            </h2>
          </div>
          <div className="scg">
            {/* Card 1 */}
            <div className="scc reveal">
              <div className="scv" aria-hidden="true">
                <div className="sv1">
                  <svg
                    width="64"
                    height="72"
                    viewBox="0 0 24 26"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path
                      d="M12 2l9 3.4v6.8c0 5.8-4 9.4-9 10.8-5-1.4-9-5-9-10.8V5.4z"
                      fill="#FFFFFF"
                      stroke="#1E7B52"
                      strokeWidth="1.5"
                    />
                    <path
                      className="sv1chk"
                      d="M8 12.5l3 3 5-6"
                      stroke="#1E7B52"
                      strokeWidth="2"
                    />
                  </svg>
                  <span className="sv1tag">
                    {isGerman ? 'Server in der Schweiz' : 'Servers in Switzerland'}
                  </span>
                </div>
              </div>
              <h3>
                {isGerman ? 'Gespeichert in der Schweiz' : 'Hosted in Switzerland'}
              </h3>
              <p>
                {isGerman
                  ? 'Deine Daten und Belege liegen auf Servern in der Schweiz – nach Schweizer Datenschutzgesetz.'
                  : 'Your data and receipts reside on Swiss servers – compliant with the Swiss Federal Act on Data Protection (FADP/DSG).'}
              </p>
            </div>

            {/* Card 2 */}
            <div className="scc reveal">
              <div className="scv" aria-hidden="true">
                <div className="sv2">
                  <div className="sv2doc">
                    <span className="sv2a">Lohn 104’000</span>
                    <span className="sv2b">•••• ••••</span>
                  </div>
                  <svg
                    className="sv2lock"
                    width="34"
                    height="40"
                    viewBox="0 0 24 28"
                    fill="none"
                    stroke="#1E7B52"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path className="sv2sh" d="M7 13V9a5 5 0 0 1 10 0v4" />
                    <rect x="4" y="13" width="16" height="12" rx="3" fill="#FFFFFF" />
                    <path d="M12 18v2" />
                  </svg>
                </div>
              </div>
              <h3>{isGerman ? 'Verschlüsselt' : 'End-to-end encrypted'}</h3>
              <p>
                {isGerman
                  ? 'Alles wird verschlüsselt übertragen und gespeichert – auch deine Belege.'
                  : 'Everything is encrypted in transit and at rest – including all uploaded tax receipts.'}
              </p>
            </div>

            {/* Card 3 */}
            <div className="scc reveal">
              <div className="scv" aria-hidden="true">
                <div className="sv3">
                  <div className="sv3ph">
                    <span className="sv3t">Code</span>
                    <div className="sv3d">
                      <i style={{ ['--i' as any]: 0 }}></i>
                      <i style={{ ['--i' as any]: 1 }}></i>
                      <i style={{ ['--i' as any]: 2 }}></i>
                      <i style={{ ['--i' as any]: 3 }}></i>
                      <i style={{ ['--i' as any]: 4 }}></i>
                      <i style={{ ['--i' as any]: 5 }}></i>
                    </div>
                    <span className="sv3ok">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l4 4L19 6" />
                      </svg>
                    </span>
                  </div>
                </div>
              </div>
              <h3>
                {isGerman ? 'Anmeldung mit Code' : 'Secure two-factor login'}
              </h3>
              <p>
                {isGerman
                  ? 'Jede Anmeldung bestätigst du mit einem Code per Authenticator oder E-Mail.'
                  : 'Logins are secured with real two-factor authentication (TOTP or code).'}
              </p>
            </div>
          </div>

          <div className="scb reveal">
            <span>
              <span className="thok">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              </span>
              {isGerman ? 'Wir verkaufen deine Daten nie' : 'We never sell your data'}
            </span>
            <span>
              <span className="thok">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              </span>
              {isGerman ? 'Du kannst alles jederzeit löschen' : 'Delete all your data anytime'}
            </span>
            <span>
              <span className="thok">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12l4 4L19 6" />
                </svg>
              </span>
              {isGerman
                ? 'Deine Erklärung geht nur an dein Steueramt'
                : 'Your declaration is only shared with your tax office'}
            </span>
          </div>
        </div>
      </section>

      {/* ─── 7. WHO IT IS FOR (#fuerwen) ────────────────────────────────────────── */}
      <section id="fuerwen" style={{ background: '#FFFFFF' }}>
        <div className="wrap thsec">
          <div className="avwrap">
            <div>
              <p className="reveal thkick">{isGerman ? 'Für wen' : 'Target audience'}</p>
              <h2 className="sec-h reveal thh2" style={{ textAlign: 'left' }}>
                {isGerman
                  ? 'Für die allermeisten Steuererklärungen.'
                  : 'For the vast majority of tax returns.'}
              </h2>
              <p
                className="reveal"
                style={{
                  margin: '18px 0 0',
                  color: '#555555',
                  fontSize: '20px',
                  lineHeight: 1.55,
                  maxWidth: '420px',
                }}
              >
                {isGerman
                  ? 'Ob allein, zu zweit, mit Kindern oder im Ruhestand – SunTax passt sich deiner Situation an.'
                  : 'Whether single, a couple, with children, or retired – SunTax adapts seamlessly to your tax situation.'}
              </p>
              <Link
                href="/register"
                className="btn btn-red thbtn reveal"
                style={{
                  marginTop: '28px',
                  background: '#1E7B52',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                }}
              >
                {isGerman ? 'Kostenlos registrieren' : 'Register for free'}
                <svg
                  className="arr"
                  width="18"
                  height="18"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8h12M9 3l5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </Link>
            </div>

            <div className="av reveal">
              <div className="avr">
                <span>
                  {isGerman
                    ? 'Angestellte, auch mit mehreren Stellen'
                    : 'Employed individuals, including multiple jobs'}
                </span>
                <span className="avy">{isGerman ? 'Verfügbar' : 'Available'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman
                    ? 'Pensionierte mit AHV und Pensionskasse'
                    : 'Retirees with AHV and pension funds'}
                </span>
                <span className="avy">{isGerman ? 'Verfügbar' : 'Available'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman
                    ? 'Familien und Alleinerziehende'
                    : 'Families and single parents'}
                </span>
                <span className="avy">{isGerman ? 'Verfügbar' : 'Available'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman
                    ? 'Verheiratete und eingetragene Paare'
                    : 'Married and registered couples'}
                </span>
                <span className="avy">{isGerman ? 'Verfügbar' : 'Available'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman
                    ? 'Selbst bewohntes Eigenheim'
                    : 'Owner-occupied residential property'}
                </span>
                <span className="avy">{isGerman ? 'Verfügbar' : 'Available'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman
                    ? 'Säule 3a, Konten und Wertschriften'
                    : 'Pillar 3a, bank accounts, and securities'}
                </span>
                <span className="avy">{isGerman ? 'Verfügbar' : 'Available'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman ? 'Wochenaufenthalter' : 'Weekly commuters'}
                </span>
                <span className="avy">{isGerman ? 'Verfügbar' : 'Available'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman ? 'Selbstständig Erwerbende' : 'Self-employed individuals'}
                </span>
                <span className="avb">{isGerman ? 'Bald' : 'Soon'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman ? 'Vermietete Liegenschaften' : 'Rental and investment properties'}
                </span>
                <span className="avb">{isGerman ? 'Bald' : 'Soon'}</span>
              </div>
              <div className="avr">
                <span>
                  {isGerman ? 'Personen mit Quellensteuer' : 'Individuals subject to tax at source'}
                </span>
                <span className="avb">{isGerman ? 'Bald' : 'Soon'}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 8. PRICING SECTION (#preis) ───────────────────────────────────────── */}
      <section id="preis" style={{ background: '#F7F5F0' }}>
        <div className="wrap thsec">
          <div className="thprice reveal">
            <div>
              <p className="thkick">{isGerman ? 'Preis' : 'Pricing'}</p>
              <h2 className="sec-h thh2" style={{ marginTop: '10px' }}>
                {isGerman ? 'Ein fairer Fixpreis.' : 'A fair flat fee.'}
              </h2>
              <p className="thpr">
                <span>CHF</span>39<small>.–</small>
              </p>
              <p style={{ margin: 0, color: '#555555', fontSize: '18px' }}>
                {isGerman ? (
                  <>
                    pro Steuererklärung · Endpreis · kein Abo
                    <br />
                    Ehepaare zahlen einmal
                  </>
                ) : (
                  <>
                    per tax return · final price · no subscription
                    <br />
                    Couples pay only once
                  </>
                )}
              </p>
              <Link
                href="/register"
                className="btn btn-red thbtn"
                style={{
                  marginTop: '28px',
                  background: '#1E7B52',
                  color: '#FFFFFF',
                  textDecoration: 'none',
                }}
              >
                {isGerman ? 'Jetzt starten' : 'Get started'}
                <svg
                  className="arr"
                  width="18"
                  height="18"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <path
                    d="M2 8h12M9 3l5 5-5 5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </Link>
              <p style={{ margin: '14px 0 0', color: '#6B6B6B', fontSize: '15px' }}>
                {isGerman
                  ? 'Bezahlt wird erst vor dem Einreichen – mit TWINT oder Karte.'
                  : 'Pay only before final filing – via TWINT or card.'}
              </p>
            </div>

            <div className="thincl">
              <p style={{ margin: '0 0 6px', fontWeight: 700, fontSize: '18px' }}>
                {isGerman ? 'Alles inbegriffen' : 'All-inclusive'}
              </p>
              <ul className="thul">
                <li>
                  <span className="thok" style={{ background: '#16A34A' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  </span>
                  {isGerman
                    ? 'Steuererklärung für Kanton, Gemeinde und Bund'
                    : 'Tax declaration for canton, municipality, and federation'}
                </li>
                <li>
                  <span className="thok" style={{ background: '#16A34A' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  </span>
                  {isGerman
                    ? 'Alle Abzüge deines Kantons'
                    : 'All statutory deductions for your canton'}
                </li>
                <li>
                  <span className="thok" style={{ background: '#16A34A' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  </span>
                  {isGerman
                    ? 'Belege lesen und ordnen'
                    : 'Intelligent document extraction & sorting'}
                </li>
                <li>
                  <span className="thok" style={{ background: '#16A34A' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  </span>
                  {isGerman
                    ? 'Dossier fertig zum Ausdrucken & Einreichen'
                    : 'Dossier generated ready to print and sign'}
                </li>
                <li>
                  <span className="thok" style={{ background: '#16A34A' }}>
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M5 12l4 4L19 6" />
                    </svg>
                  </span>
                  {isGerman
                    ? 'Persönliche Spar-Tipps'
                    : 'Personalized tax-saving opportunities'}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── 9. FAQ SECTION (#faq) ─────────────────────────────────────────────── */}
      <section id="faq" style={{ background: '#FFFFFF' }}>
        <div className="wrap thsec" style={{ maxWidth: '900px' }}>
          <div className="thhead">
            <p className="reveal thkick">{isGerman ? 'Fragen' : 'FAQ'}</p>
            <h2 className="sec-h reveal thh2">
              {isGerman ? 'Häufige Fragen' : 'Frequently Asked Questions'}
            </h2>
          </div>
          <div className="reveal thfaq">
            {FAQ_ITEMS.map((item, idx) => (
              <details key={idx}>
                <summary>
                  <span>{isGerman ? item.qDe : item.qEn}</span>
                  <span
                    className="plus"
                    style={{
                      flex: 'none',
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      border: '1.5px solid #DDDDDD',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 13 13" aria-hidden="true">
                      <path d="M6.5 1v11M1 6.5h11" stroke="#0A0A0A" strokeWidth="1.8" />
                    </svg>
                  </span>
                </summary>
                <p className="ans">{isGerman ? item.aDe : item.aEn}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── 10. FINAL CTA BANNER ──────────────────────────────────────────────── */}
      <section style={{ background: '#FFFFFF' }}>
        <div className="wrap" style={{ paddingBottom: '100px' }}>
          <div className="reveal thcta">
            <h2
              className="sec-h"
              style={{
                margin: 0,
                fontSize: '48px',
                lineHeight: 1.1,
                letterSpacing: '-0.03em',
                fontWeight: 700,
                color: '#FFFFFF',
              }}
            >
              {isGerman
                ? 'Bereit für deine Steuererklärung?'
                : 'Ready for your Swiss tax return?'}
            </h2>
            <p
              style={{
                margin: '14px auto 0',
                color: '#C9C9C9',
                fontSize: '19px',
                maxWidth: '520px',
              }}
            >
              {isGerman
                ? 'Registrieren ist kostenlos. Bezahlt wird erst, wenn du einreichst.'
                : 'Registration is free. You only pay when you finalize your dossier.'}
            </p>
            <Link
              href="/register"
              className="btn btn-red thbtn"
              style={{
                marginTop: '30px',
                background: '#1E7B52',
                color: '#FFFFFF',
                textDecoration: 'none',
              }}
            >
              {isGerman ? 'Kostenlos registrieren' : 'Register for free'}
              <svg
                className="arr"
                width="18"
                height="18"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M2 8h12M9 3l5 5-5 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* ─── 11. FOOTER ────────────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #EEEEEE' }}>
        <div
          className="wrap foot-pad"
          style={{ paddingTop: '56px', paddingBottom: '40px' }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '32px',
              fontSize: '14px',
              color: '#666666',
            }}
          >
            <div>
              <span style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                <svg width="25" height="29" viewBox="0 0 40 46" aria-hidden="true">
                  <path
                    d="M4 0H27L38 11V28L23 43H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z"
                    fill="#15181D"
                  />
                  <path d="M27 0L38 11H30a3 3 0 0 1-3-3z" fill="#D6D6D6" />
                  <path
                    d="M9.5 17.5h4.5V13h5v4.5h4.5v5H19V27h-5v-4.5H9.5z"
                    fill="#FFFFFF"
                  />
                  <rect x="28" y="33" width="10" height="3" rx="1" fill="#6B6F76" />
                  <rect x="23" y="39" width="15" height="3" rx="1" fill="#6B6F76" />
                </svg>
                <span
                  style={{
                    fontSize: '22px',
                    letterSpacing: '-0.04em',
                    lineHeight: 1,
                  }}
                >
                  <span style={{ fontWeight: 800, color: '#15181D' }}>Sun</span>
                  <span style={{ fontWeight: 600, color: '#4B4F57' }}>Tax</span>
                </span>
              </span>
              <p
                style={{
                  margin: '14px 0 0',
                  fontSize: '15px',
                  color: '#555555',
                  lineHeight: 1.5,
                }}
              >
                {isGerman ? (
                  <>
                    Deine Steuererklärung.
                    <br />
                    In wenigen Minuten erledigt.
                  </>
                ) : (
                  <>
                    Your Swiss tax return.
                    <br />
                    Completed in minutes.
                  </>
                )}
              </p>
            </div>

            <div>
              <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#0A0A0A' }}>
                {isGerman ? 'Kontakt' : 'Contact'}
              </p>
              <p style={{ margin: 0 }}>
                <a
                  href="mailto:info@suntax.ch"
                  style={{ color: '#1E7B52', fontWeight: 600 }}
                >
                  info@suntax.ch
                </a>
              </p>
            </div>

            <div>
              <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#0A0A0A' }}>
                {isGerman ? 'Standards' : 'Standards'}
              </p>
              <p style={{ margin: 0 }}>
                {isGerman ? (
                  <>
                    Server in der Schweiz
                    <br />
                    Schweizer Datenschutzgesetz (DSG)
                    <br />
                    Im Format der kantonalen Steuerämter
                  </>
                ) : (
                  <>
                    Servers located in Switzerland
                    <br />
                    Swiss Data Protection Act (DSG)
                    <br />
                    Format aligned with cantonal requirements
                  </>
                )}
              </p>
            </div>

            <div>
              <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#0A0A0A' }}>
                {isGerman ? 'Rechtliches' : 'Legal note'}
              </p>
              <p style={{ margin: 0 }}>
                {isGerman
                  ? 'SunTax hilft beim Ausfüllen und Erstellen deines Dossiers. Die Steuer wird verbindlich von deinem kantonalen Steueramt berechnet.'
                  : 'SunTax assists in compiling your declaration dossier. The legally binding tax is calculated exclusively by your cantonal tax authority.'}
              </p>
            </div>
          </div>

          <div
            style={{
              marginTop: '48px',
              paddingTop: '20px',
              borderTop: '1px solid #EEEEEE',
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px 24px',
              fontSize: '13px',
              color: '#6E6E6E',
            }}
          >
            <span className="mono" style={{ fontSize: '12px' }}>
              © 2026 SunTax · Ein Schweizer Unternehmen aus Neftenbach ZH
            </span>
            <nav
              aria-label="Rechtliches"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 22px' }}
            >
              <Link
                href="/impressum"
                style={{
                  color: '#555555',
                  textDecoration: 'none',
                  minHeight: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {isGerman ? 'Impressum' : 'Imprint'}
              </Link>
              <Link
                href="/datenschutz"
                style={{
                  color: '#555555',
                  textDecoration: 'none',
                  minHeight: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {isGerman ? 'Datenschutz' : 'Privacy policy'}
              </Link>
              <Link
                href="/agb"
                style={{
                  color: '#555555',
                  textDecoration: 'none',
                  minHeight: '32px',
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                {isGerman ? 'AGB' : 'Terms of service'}
              </Link>
            </nav>
          </div>
        </div>
      </footer>

      {/* ─── 12. MOBILE STICKY BAR (.mbar.show-sm) ────────────────────────────── */}
      <div className="mbar show-sm">
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            background: 'rgba(255,255,255,.92)',
            backdropFilter: 'saturate(1.6) blur(14px)',
            WebkitBackdropFilter: 'saturate(1.6) blur(14px)',
            border: '1px solid #E6E6E6',
            borderRadius: '20px',
            padding: '10px 10px 10px 18px',
            boxShadow: '0 18px 40px -16px rgba(0,0,0,.35)',
          }}
        >
          <span style={{ lineHeight: 1.15 }}>
            <span
              style={{
                display: 'block',
                fontWeight: 700,
                fontSize: '18px',
                letterSpacing: '-0.02em',
              }}
            >
              CHF 39
            </span>
            <span style={{ display: 'block', fontSize: '12px', color: '#6B6B6B' }}>
              {isGerman ? 'pro Steuererklärung' : 'per tax return'}
            </span>
          </span>
          <Link
            href="/register"
            className="btn btn-red"
            style={{
              background: '#1E7B52',
              color: '#FFFFFF',
              textDecoration: 'none',
              padding: '13px 20px',
              borderRadius: '14px',
              fontWeight: 600,
              fontSize: '16px',
              minHeight: '48px',
              boxSizing: 'border-box',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            {isGerman ? 'Jetzt starten' : 'Get started'}
            <svg
              className="arr"
              width="14"
              height="14"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M2 8h12M9 3l5 5-5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
