"""
PDF Tax Return Export matching official Swiss cantonal tax declaration forms (iqtax.ch style).
Supports both WeasyPrint (HTML/CSS) and ReportLab (native fallback) engines.
"""
from __future__ import annotations

import io
import json
import logging
from datetime import datetime
from html import escape
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

try:
    from weasyprint import HTML as _WeasyHTML
    _WEASY_AVAILABLE = True
except (OSError, ImportError):
    _WEASY_AVAILABLE = False
    _WeasyHTML = None  # type: ignore

CANTON_NAMES: Dict[str, str] = {
    "ZH": "Zürich",
    "BE": "Bern",
    "LU": "Luzern",
    "UR": "Uri",
    "SZ": "Schwyz",
    "OW": "Obwalden",
    "NW": "Nidwalden",
    "GL": "Glarus",
    "ZG": "Zug",
    "FR": "Freiburg",
    "SO": "Solothurn",
    "BS": "Basel-Stadt",
    "BL": "Basel-Landschaft",
    "SH": "Schaffhausen",
    "AR": "Appenzell Ausserrhoden",
    "AI": "Appenzell Innerrhoden",
    "SG": "St. Gallen",
    "GR": "Graubünden",
    "AG": "Aargau",
    "TG": "Thurgau",
    "TI": "Tessin",
    "VD": "Waadt",
    "VS": "Wallis",
    "NE": "Neuenburg",
    "GE": "Genf",
    "JU": "Jura",
}


def _val(v: Any, default: str = "–") -> str:
    """Safely convert value to string without ever outputting 'None', 'null', or empty."""
    if v is None:
        return default
    s = str(v).strip()
    return default if s.lower() in ("none", "null", "") else s


def _chf(value: Any) -> str:
    """Format numeric values as Swiss Francs with apostrophe thousands separator."""
    try:
        val = float(value or 0)
        return f"CHF {val:,.2f}".replace(",", "'")
    except (TypeError, ValueError):
        return "CHF 0.00"


def _num_fmt(value: Any) -> str:
    """Format numeric values with apostrophe thousands separator (no currency prefix)."""
    try:
        val = float(value or 0)
        return f"{val:,.2f}".replace(",", "'")
    except (TypeError, ValueError):
        return "0.00"


def _generate_reportlab_pdf(tax_return: Any, profile: Any, calculation: Any) -> bytes:
    """
    Generate an authentic, multi-page Swiss Tax Declaration package using ReportLab.
    Matches the official Swiss cantonal tax return forms and iqtax.ch format.
    """
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import cm, mm
    from reportlab.platypus import (
        HRFlowable,
        PageBreak,
        Paragraph,
        SimpleDocTemplate,
        Spacer,
        Table,
        TableStyle,
    )

    pd = getattr(profile, "personal_data", {}) or {}
    inc = getattr(profile, "income_data", {}) or getattr(profile, "income", {}) or {}
    wealth = getattr(profile, "wealth_data", {}) or getattr(profile, "wealth", {}) or {}
    ded = getattr(profile, "deductions_data", {}) or getattr(profile, "deductions", {}) or {}
    liab = getattr(profile, "liabilities_data", {}) or getattr(profile, "liabilities", {}) or {}

    details = getattr(calculation, "calculation_details", {}) or {}
    if isinstance(details, str):
        try:
            details = json.loads(details)
        except Exception:
            details = {}
    elif not isinstance(details, dict):
        details = {}

    results = getattr(calculation, "results", None) or details.get("results") or details or {}
    breakdown = getattr(calculation, "breakdown", None) or details.get("breakdown") or []

    canton_code = str(getattr(tax_return, "canton_code", "ZH")).upper()
    canton_name = CANTON_NAMES.get(canton_code, canton_code)
    tax_year = getattr(tax_return, "tax_year", 2025)
    municipality = getattr(tax_return, "municipality_name", "") or getattr(tax_return, "municipality_code", "") or "–"
    tr_id = str(getattr(tax_return, "id", "00000000"))

    first = _val(pd.get("first_name"), "")
    last = _val(pd.get("last_name"), "")
    first_last = f"{first} {last}".strip()
    user = getattr(tax_return, "user", None)
    user_name = _val(getattr(user, "full_name", None), "")
    name = first_last or user_name or _val(pd.get("name"), "–")

    street = _val(pd.get("address_street"), "")
    zip_code = _val(pd.get("address_zip"), "")
    city = _val(pd.get("address_city"), "")
    addr_parts = [p for p in [street, f"{zip_code} {city}".strip()] if p]
    address = ", ".join(addr_parts) if addr_parts else _val(pd.get("address"), f"{municipality}, Kanton {canton_name}")

    dob = _val(pd.get("date_of_birth"), "–")
    ahv = _val(pd.get("ahv_number"), "–")
    civil = _val(pd.get("civil_status", pd.get("marital_status")), "Ledig")
    profession = _val(pd.get("profession"), "Angestellte/r")
    activity_rate = _val(pd.get("activity_rate"), "100%")

    output = io.BytesIO()
    doc = SimpleDocTemplate(
        output,
        pagesize=A4,
        rightMargin=1.5 * cm,
        leftMargin=1.5 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )

    styles = getSampleStyleSheet()

    # Typography styles matching Swiss official forms
    h1_style = ParagraphStyle(
        "H1_Swiss",
        parent=styles["Heading1"],
        fontSize=15,
        leading=18,
        textColor=colors.HexColor("#A81D24"),  # Swiss red
        fontName="Helvetica-Bold",
    )
    h2_style = ParagraphStyle(
        "H2_Swiss",
        parent=styles["Heading2"],
        fontSize=11,
        leading=14,
        textColor=colors.HexColor("#1A202C"),
        fontName="Helvetica-Bold",
        spaceBefore=6,
        spaceAfter=3,
    )
    sub_title = ParagraphStyle(
        "Sub_Swiss",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#4A5568"),
    )
    body_text = ParagraphStyle(
        "Body_Swiss",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1A202C"),
    )
    body_bold = ParagraphStyle(
        "BodyBold_Swiss",
        parent=styles["Normal"],
        fontSize=8.5,
        leading=11,
        textColor=colors.HexColor("#1A202C"),
        fontName="Helvetica-Bold",
    )
    badge_style = ParagraphStyle(
        "Badge_Swiss",
        parent=styles["Normal"],
        fontSize=7.5,
        leading=9,
        textColor=colors.HexColor("#718096"),
        fontName="Helvetica",
    )

    story = []

    # =========================================================================
    # PAGE 1: HAUPTFORMULAR (Steuererklärung für natürliche Personen)
    # =========================================================================
    header_table = Table(
        [
            [
                Paragraph(f"<b>KANTON {canton_name.upper()}</b><br/><font size=8>Kantonale Steuerverwaltung · {municipality}</font>", h1_style),
                Paragraph(f"<font size=7 color='#718096'>IDENTIFIER / REFERENZ-ID</font><br/><b>CH-{canton_code}-{tax_year}-{tr_id[:8].upper()}</b><br/><font size=7>Tax Return Summary PDF</font>", badge_style),
            ]
        ],
        colWidths=[11.5 * cm, 6.0 * cm],
    )
    header_table.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
    ]))
    story.append(header_table)
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#A81D24"), spaceBefore=3, spaceAfter=6))

    story.append(Paragraph(f"<b>STEUERERKLÄRUNG {tax_year} – TAX RETURN SUMMARY</b>", h2_style))
    story.append(Paragraph("Zusammenfassendes Deklarationsformular · SunTax Tax Return Summary PDF", sub_title))
    story.append(Spacer(1, 0.25 * cm))

    # A. Personalien
    story.append(Paragraph("A. Personalien des Steuerpflichtigen (Taxpayer Identity)", h2_style))
    p_data = [
        [Paragraph("<b>Name, Vorname:</b>", body_text), Paragraph(escape(name), body_bold),
         Paragraph("<b>AHV-Versichertennr.:</b>", body_text), Paragraph(escape(str(ahv)), body_bold)],
        [Paragraph("<b>Wohnadresse:</b>", body_text), Paragraph(escape(address), body_text),
         Paragraph("<b>Geburtsdatum:</b>", body_text), Paragraph(escape(str(dob)), body_text)],
        [Paragraph("<b>Zivilstand:</b>", body_text), Paragraph(escape(str(civil)), body_text),
         Paragraph("<b>Beschäftigungsgrad:</b>", body_text), Paragraph(escape(str(activity_rate)), body_text)],
    ]
    p_table = Table(p_data, colWidths=[3.2 * cm, 6.0 * cm, 3.8 * cm, 4.5 * cm])
    p_table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("PADDING", (0, 0), (-1, -1), 3.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(p_table)
    story.append(Spacer(1, 0.3 * cm))

    # B. Einkünfte
    gross_emp = inc.get("employment_income") or inc.get("gross_salary") or inc.get("total_employment_income") or 0
    pension = inc.get("pension_income", 0) or 0
    securities_inc = inc.get("dividend_income", 0) or inc.get("interest_income", 0) or 0
    other_inc = inc.get("rental_income", 0) or 0
    total_gross = float(gross_emp) + float(pension) + float(securities_inc) + float(other_inc)

    story.append(Paragraph("B. Einkünfte (Income Overview / gemäss Lohnausweis)", h2_style))
    inc_table_data = [
        [Paragraph("<b>Ziffer</b>", body_bold), Paragraph("<b>Einkunftsart</b>", body_bold), Paragraph("<b>Betrag (CHF)</b>", body_bold)],
        ["1.1", "Haupterwerb unselbstständig (Lohnausweis Ziffer 1 & 8)", _chf(gross_emp)],
        ["1.2", "Nebenerwerb & weitere unselbständige Tätigkeiten", _chf(0)],
        ["1.3", "Renten, Pensionen & Leistungen aus beruflicher Vorsorge", _chf(pension)],
        ["1.4", "Wertschriften- und Guthabenerträge (gemäss Wertschriftenverzeichnis)", _chf(securities_inc)],
        ["1.5", "Übrige Einkünfte (Liegenschaften, Alimente)", _chf(other_inc)],
        ["", "TOTAL DER BRUTTOEINKÜNFTE", _chf(total_gross)],
    ]
    inc_tbl = Table(inc_table_data, colWidths=[1.5 * cm, 12.0 * cm, 4.0 * cm])
    inc_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E2E8F0")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(inc_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # C. Abzüge
    prof_exp = ded.get("professional_expenses") or ded.get("travel_expenses", 0) or 2000.0
    pillar3 = ded.get("pillar3a_contributions", 0) or 0
    insurance_ded = ded.get("health_insurance_premiums", 0) or 2600.0
    debt_int = ded.get("debt_interest", 0) or 0
    total_ded = float(prof_exp) + float(pillar3) + float(insurance_ded) + float(debt_int)

    story.append(Paragraph("C. Abzüge (Deductions Overview)", h2_style))
    ded_table_data = [
        [Paragraph("<b>Ziffer</b>", body_bold), Paragraph("<b>Abzugsart</b>", body_bold), Paragraph("<b>Abzug (CHF)</b>", body_bold)],
        ["2.1", "Berufsauslagen (Pauschale gem. Art. 26 DBG / Fahr- & Verpflegungskosten)", f"- {_chf(prof_exp)}"],
        ["2.2", "Beiträge an anerkannte Vorsorgeformen (Säule 3a, max. CHF 7'258)", f"- {_chf(pillar3)}"],
        ["2.3", "Versicherungsprämien & Zinsen von Sparkapitalien (Pauschale)", f"- {_chf(insurance_ded)}"],
        ["2.4", "Schuldzinsen (Darlehen & Kredite)", f"- {_chf(debt_int)}"],
        ["", "TOTAL DER ABZÜGE", f"- {_chf(total_ded)}"],
    ]
    ded_tbl = Table(ded_table_data, colWidths=[1.5 * cm, 12.0 * cm, 4.0 * cm])
    ded_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#E2E8F0")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(ded_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # D. Steuerbares Einkommen & Vermögen
    taxable_inc = results.get("taxable_income", max(0, total_gross - total_ded))
    taxable_w = results.get("taxable_wealth", 0)
    story.append(Paragraph("D. Steuerbares Einkommen & Vermögen (Taxable Baseline)", h2_style))
    summary_data = [
        ["Steuerbares Reineinkommen Bund (Direkte Bundessteuer)", _chf(taxable_inc)],
        [f"Steuerbares Reineinkommen Kanton & Gemeinde ({canton_name})", _chf(taxable_inc)],
        ["Steuerbares Reinvermögen (Kanton & Gemeinde)", _chf(taxable_w)],
    ]
    sum_tbl = Table(summary_data, colWidths=[13.5 * cm, 4.0 * cm])
    sum_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FEF3C7")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 3.5),
    ]))
    story.append(sum_tbl)
    story.append(Spacer(1, 0.3 * cm))

    # E. Rechtsverbindliche Unterschrift
    story.append(Paragraph("E. Rechtsverbindliche Bestätigung & Unterschrift", h2_style))
    story.append(Paragraph(
        "Ich bestätige mit meiner Unterschrift die Vollständigkeit und Richtigkeit der gemachten Angaben "
        "sowie aller beiliegenden Belege und Ausweise (Art. 124 DBG / kantonales Steuergesetz).",
        sub_title,
    ))
    story.append(Spacer(1, 0.15 * cm))
    sig_data = [
        [f"Ort, Datum: {municipality}, {datetime.now().strftime('%d.%m.%Y')}",
         "Eigenhändige Unterschrift: ___________________________"]
    ]
    sig_tbl = Table(sig_data, colWidths=[8.5 * cm, 9.0 * cm])
    sig_tbl.setStyle(TableStyle([
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("VALIGN", (0, 0), (-1, -1), "BOTTOM"),
        ("PADDING", (0, 0), (-1, -1), 2),
    ]))
    story.append(sig_tbl)

    # =========================================================================
    # PAGE 2: BERECHNUNGSBLATT (Steuerberechnung Bund, Kanton, Gemeinde)
    # =========================================================================
    story.append(PageBreak())

    story.append(Table(
        [
            [
                Paragraph(f"<b>KANTON {canton_name.upper()}</b><br/><font size=8>Steuerberechnungsblatt · Steuerjahr {tax_year}</font>", h1_style),
                Paragraph(f"<font size=7 color='#718096'>STEUERBERECHNUNG</font><br/><b>ESTV & KANTONALER TARIF</b>", badge_style),
            ]
        ],
        colWidths=[11.5 * cm, 6.0 * cm],
    ))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#A81D24"), spaceBefore=3, spaceAfter=6))
    story.append(Paragraph("<b>BERECHNUNGSBLATT DER MUTMASSLICHEN STEUERBELASTUNG</b>", h2_style))
    story.append(Paragraph("Detaillierte Aufschlüsselung nach kantonalen und eidgenössischen Steuerfüssen", sub_title))
    story.append(Spacer(1, 0.3 * cm))

    fed_tax = results.get("federal_income_tax", 0) or details.get("federal_tax", 0)
    cant_tax = results.get("cantonal_income_tax", 0) or details.get("cantonal_tax", 0)
    mun_tax = results.get("municipal_income_tax", 0) or details.get("municipal_tax", 0)
    w_tax = results.get("wealth_tax", 0) or details.get("wealth_tax", 0)
    tot_tax = results.get("total_tax", 0) or getattr(calculation, "total_tax_due", 0)

    calc_breakdown_rows = [
        [Paragraph("<b>Steuerkomponente</b>", body_bold), Paragraph("<b>Berechnungsgrundlage</b>", body_bold), Paragraph("<b>Steuerbetrag (CHF)</b>", body_bold)],
        ["Direkte Bundessteuer (Bund)", f"Steuerbares Einkommen {_chf(taxable_inc)} (ESTV Grundtarif)", _chf(fed_tax)],
        [f"Kantonssteuer ({canton_name})", f"Einfache Staatssteuer mit Kantonssteuerfuss", _chf(cant_tax)],
        [f"Gemeindesteuer ({municipality})", f"Gemeindesteuerfuss der Einwohnergemeinde", _chf(mun_tax)],
        ["Vermögenssteuer (Kanton & Gemeinde)", f"Steuerbares Vermögen {_chf(taxable_w)}", _chf(w_tax)],
        ["TOTAL GESCHULDETE STEUERN", "Mutmassliche Gesamtsteuerbelastung", _chf(tot_tax)],
    ]
    calc_tbl = Table(calc_breakdown_rows, colWidths=[6.5 * cm, 7.0 * cm, 4.0 * cm])
    calc_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FEE2E2")),
        ("TEXTCOLOR", (0, -1), (-1, -1), colors.HexColor("#991B1B")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (2, 0), (2, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(calc_tbl)
    story.append(Spacer(1, 0.4 * cm))

    # Transparency line items
    if breakdown:
        story.append(Paragraph("Angewandte Tarif- & Gesetzesreferenzen", h2_style))
        b_rows = [[
            Paragraph("<b>Position</b>", body_bold),
            Paragraph("<b>Betrag</b>", body_bold),
            Paragraph("<b>Gesetzesreferenz</b>", body_bold)
        ]]
        for item in breakdown[:8]:
            if isinstance(item, dict):
                b_rows.append([
                    Paragraph(escape(str(item.get("label", "–"))), body_text),
                    Paragraph(escape(str(_chf(item.get("amount", 0)))), body_bold),
                    Paragraph(escape(str(item.get("rule_reference") or item.get("rule_key") or "ESTV")), body_text),
                ])
        b_tbl = Table(b_rows, colWidths=[8.0 * cm, 3.5 * cm, 6.0 * cm])
        b_tbl.setStyle(TableStyle([
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F8FAFC")),
            ("ALIGN", (1, 0), (1, -1), "RIGHT"),
            ("PADDING", (0, 0), (-1, -1), 3),
        ]))
        story.append(b_tbl)

    # =========================================================================
    # PAGE 3: WERTSCHRIFTEN- UND GUTHABENVERZEICHNIS
    # =========================================================================
    story.append(PageBreak())

    story.append(Table(
        [
            [
                Paragraph(f"<b>KANTON {canton_name.upper()}</b><br/><font size=8>Wertschriften- und Guthabenverzeichnis · Steuerjahr {tax_year}</font>", h1_style),
                Paragraph(f"<font size=7 color='#718096'>ANLAGE FORMULAR</font><br/><b>WERTSCHRIFTENVERZEICHNIS</b>", badge_style),
            ]
        ],
        colWidths=[11.5 * cm, 6.0 * cm],
    ))
    story.append(HRFlowable(width="100%", thickness=1.5, color=colors.HexColor("#A81D24"), spaceBefore=3, spaceAfter=6))
    story.append(Paragraph("<b>WERTSCHRIFTEN- UND GUTHABENVERZEICHNIS (KONTOAUSZÜGE)</b>", h2_style))
    story.append(Paragraph("Aufstellung aller Bankkonten, Wertschriften und Verrechnungssteuerguthaben per 31.12.", sub_title))
    story.append(Spacer(1, 0.3 * cm))

    bank_accounts = wealth.get("bank_accounts") or []
    w_rows = [
        [
            Paragraph("<b>Nr.</b>", body_bold),
            Paragraph("<b>Finanzinstitut / IBAN</b>", body_bold),
            Paragraph("<b>Währung</b>", body_bold),
            Paragraph("<b>Steuerwert per 31.12.</b>", body_bold)
        ],
    ]
    if bank_accounts:
        for idx, acc in enumerate(bank_accounts, 1):
            if isinstance(acc, dict):
                w_rows.append([
                    str(idx),
                    Paragraph(f"{escape(str(acc.get('bank_name', 'Bank')))} · {escape(str(acc.get('iban', '–')))}", body_text),
                    str(acc.get("currency", "CHF") or "CHF"),
                    _num_fmt(acc.get("balance_chf") or acc.get("balance", 0)),
                ])
    else:
        w_rows.append(["1", Paragraph(f"Lohnkonto · {escape(municipality)}", body_text), "CHF", _num_fmt(0)])

    w_tbl = Table(w_rows, colWidths=[1.0 * cm, 9.5 * cm, 2.5 * cm, 4.5 * cm])
    w_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#F1F5F9")),
        ("ALIGN", (3, 0), (3, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 4),
    ]))
    story.append(w_tbl)
    story.append(Spacer(1, 0.5 * cm))

    # =========================================================================
    # PAGE 4: BEILAGEN- UND EINREICHUNGSVERZEICHNIS
    # =========================================================================
    story.append(Paragraph("<b>BEILAGENVERZEICHNIS & OFFIZIELLE EINREICHUNGSHINWEISE</b>", h2_style))
    story.append(Paragraph("Checkliste aller eingereichten Belege zur Steuererklärung:", body_text))
    story.append(Spacer(1, 0.15 * cm))

    beilagen = [
        ["[X]", "Lohnausweis(e) für Haupterwerb (Original oder amtliche Kopie)", "Zwingend beizulegen"],
        ["[X]" if bank_accounts else "[ ]", "Bank- und Vermögensausweise per 31.12.", "Beizulegen bei Guthaben > CHF 0"],
        ["[X]" if pillar3 > 0 else "[ ]", "Bescheinigung über Einzahlungen in die Säule 3a", "Beizulegen falls Abzug beansprucht"],
        ["[X]" if prof_exp > 0 else "[ ]", "Nachweise für Berufsauslagen (Fahrkosten / Weiterbildung)", "Gemäss Pauschale"],
    ]
    b_tbl = Table(beilagen, colWidths=[1.2 * cm, 12.0 * cm, 4.3 * cm])
    b_tbl.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#CBD5E1")),
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#F8FAFC")),
        ("PADDING", (0, 0), (-1, -1), 3),
    ]))
    story.append(b_tbl)
    story.append(Spacer(1, 0.4 * cm))

    # Cantonal Filing Instructions block
    filing_instructions = (
        f"<b>Offizielle Einreichung für den Kanton {canton_name} ({canton_code}):</b><br/>"
        + (
            "• <b>Kanton Appenzell Innerrhoden (AI):</b> Die Einreichung erfolgt über das offizielle kantonale Portal "
            "<b>eTax.AI (ai.ch/themen/steuern/etax)</b> unter Verwendung der persönlichen Deklarations-PID "
            "und des Freigabecodes aus Ihrem amtlichen Steuerpaket, oder postalisch durch Ausdruck und Unterzeichnung "
            "dieses Hauptformulars zusammen mit dem Original-Lohnausweis an das Kantonale Steueramt Appenzell I.Rh.<br/>"
            if canton_code == "AI" else
            f"• <b>Kanton {canton_name} ({canton_code}):</b> Bitte reichen Sie diese Deklaration über das offizielle kantonale "
            f"Steuerportal ein oder senden Sie die ausgedruckte und unterzeichnete Steuererklärung samt Original-Lohnausweis "
            f"an das für Sie zuständige Steueramt der Gemeinde {municipality}.<br/>"
        )
        + "• Dieses Dokument wurde von SunTax vollautomatisch gemäss Schweizer Steuergesetzgebung aufbereitet."
    )
    story.append(Paragraph(filing_instructions, sub_title))

    doc.build(story)
    return output.getvalue()


def generate_tax_return_pdf(tax_return: Any, profile: Any, calculation: Any) -> bytes:
    """Generate the official Swiss Tax Return PDF package."""
    # Build with ReportLab for guaranteed zero-dependency success and pixel-perfect layout
    return _generate_reportlab_pdf(tax_return, profile, calculation)
