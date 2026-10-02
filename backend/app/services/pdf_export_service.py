"""
PDF Tax Return Export using WeasyPrint (production) or a stub (dev without GTK).
"""
from __future__ import annotations
from datetime import datetime
from html import escape

try:
    from weasyprint import HTML as _WeasyHTML
    _WEASY_AVAILABLE = True
except (OSError, ImportError):
    _WEASY_AVAILABLE = False
    _WeasyHTML = None  # type: ignore


def _generate_reportlab_pdf(tax_return, profile, calculation) -> bytes:
    """Create a standards-compliant PDF when WeasyPrint's native libraries are absent."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import cm
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

    pd = getattr(profile, "personal_data", {}) or {}
    inc = getattr(profile, "income_data", {}) or getattr(profile, "income", {}) or {}
    results = getattr(calculation, "results", {}) or {}
    first_last = f"{pd.get('first_name', '')} {pd.get('last_name', '')}".strip()
    name = first_last or pd.get("name", "Not provided")

    def chf(value: object) -> str:
        try:
            return f"CHF {float(value or 0):,.2f}"
        except (TypeError, ValueError):
            return "CHF 0.00"

    output = __import__("io").BytesIO()
    document = SimpleDocTemplate(output, pagesize=A4, rightMargin=1.5 * cm,
                                 leftMargin=1.5 * cm, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = getSampleStyleSheet()
    title = styles["Title"]
    title.textColor = colors.HexColor("#CC0000")
    heading = styles["Heading2"]
    heading.textColor = colors.HexColor("#CC0000")
    story = [
        Paragraph("SunTax – Swiss Tax Return Summary", title),
        Paragraph(
            f"Tax year {escape(str(tax_return.tax_year))} · Canton {escape(str(tax_return.canton_code))} · "
            f"Municipality {escape(str(getattr(tax_return, 'municipality_name', '') or '–'))}",
            styles["Normal"],
        ),
        Spacer(1, 0.45 * cm),
        Paragraph("Taxpayer", heading),
        Paragraph(f"Name: {escape(str(name))}", styles["Normal"]),
        Spacer(1, 0.25 * cm),
        Paragraph("Calculation", heading),
    ]
    rows = [
        ["Taxable income", chf(results.get("taxable_income"))],
        ["Federal income tax", chf(results.get("federal_income_tax"))],
        ["Cantonal income tax", chf(results.get("cantonal_income_tax"))],
        ["Municipal income tax", chf(results.get("municipal_income_tax"))],
        ["Wealth tax", chf(results.get("wealth_tax"))],
        ["Total tax", chf(results.get("total_tax"))],
    ]
    table = Table(rows, colWidths=[10.5 * cm, 5.5 * cm])
    table.setStyle(TableStyle([
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#D1D5DB")),
        ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#FEE2E2")),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("PADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([table, Spacer(1, 0.5 * cm), Paragraph(
        "This SunTax summary is an estimate based on the information entered. Verify all data before filing with the relevant cantonal authority.",
        styles["BodyText"],
    )])
    document.build(story)
    return output.getvalue()


def generate_tax_return_pdf(tax_return, profile, calculation) -> bytes:
    """Generate a PDF from the tax return data."""

    pd = getattr(profile, "personal_data", {}) or {}
    inc = getattr(profile, "income_data", {}) or getattr(profile, "income", {}) or {}
    wealth = getattr(profile, "wealth_data", {}) or getattr(profile, "wealth", {}) or {}
    ded = getattr(profile, "deductions_data", {}) or getattr(profile, "deductions", {}) or {}
    liab = getattr(profile, "liabilities_data", {}) or getattr(profile, "liabilities", {}) or {}

    details = getattr(calculation, "calculation_details", {}) or {}
    if isinstance(details, str):
        import json
        try:
            details = json.loads(details)
        except Exception:
            details = {}
    elif not isinstance(details, dict):
        details = {}

    results = getattr(calculation, "results", None) or details.get("results") or details or {}
    breakdown = getattr(calculation, "breakdown", None) or details.get("breakdown") or []

    first_last = f"{pd.get('first_name', '')} {pd.get('last_name', '')}".strip()
    name = first_last if first_last else pd.get("name", "–")
    address = f"{pd.get('address_street', '')}, {pd.get('address_zip', '')} {pd.get('address_city', '')}".strip(" ,") or pd.get("address", "–")
    dob = pd.get("date_of_birth", "–")
    marital = pd.get("civil_status", pd.get("marital_status", "–"))

    total_income = inc.get("employment_income", 0) or inc.get("total_employment_income", 0) or 0
    total_wealth = sum(
        (a.get("balance_chf") or a.get("balance") or 0) for a in (wealth.get("bank_accounts") or [])
    )
    pillar3a = ded.get("pillar3a_contributions", 0) or ded.get("pillar3a_total", 0) or 0
    donations = ded.get("donations", 0) or ded.get("donations_total", 0) or 0
    mortgage_interest = ded.get("debt_interest", 0) or ded.get("mortgage_interest", 0) or 0

    federal_tax = getattr(calculation, "federal_income_tax", None) or results.get("federal_income_tax", 0) or 0
    cantonal_tax = getattr(calculation, "cantonal_income_tax", None) or results.get("cantonal_income_tax", 0) or 0
    municipal_tax = getattr(calculation, "municipal_income_tax", None) or results.get("municipal_income_tax", 0) or 0
    wealth_tax = getattr(calculation, "wealth_tax", None) or results.get("wealth_tax", 0) or 0
    total_tax = getattr(calculation, "total_tax_due", None) or results.get("total_tax", 0) or 0
    taxable_income = getattr(calculation, "taxable_income", None) or results.get("taxable_income", 0) or 0
    taxable_wealth_val = getattr(calculation, "taxable_wealth", None) or results.get("taxable_wealth", 0) or 0

    def chf(val):
        try:
            return f"CHF {float(val):,.2f}"
        except Exception:
            return f"CHF {val}"

    # Build breakdown rows HTML
    breakdown_rows = ""
    for item in breakdown:
        breakdown_rows += f"""
        <tr>
            <td>{item.get('label', '')}</td>
            <td class="amount">{chf(item.get('amount', 0))}</td>
            <td class="rule">{item.get('rule_key', '')}</td>
        </tr>"""

    canton_code = tax_return.canton_code
    tax_year = tax_return.tax_year
    municipality = getattr(tax_return, "municipality_name", "") or getattr(tax_return, "municipality_code", "")
    rule_version = getattr(calculation, "rule_version", getattr(calculation, "tax_rule_version", "1.0.0"))
    generated_at = datetime.now().strftime("%d.%m.%Y %H:%M")

    html_content = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8"/>
<style>
  @page {{ size: A4; margin: 2cm 1.5cm; }}
  body {{ font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; color: #1a1a1a; }}
  .header {{ display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #CC0000; padding-bottom: 12px; margin-bottom: 20px; }}
  .logo {{ font-size: 22pt; font-weight: bold; color: #CC0000; }}
  .logo span {{ color: #1a1a1a; }}
  .subtitle {{ font-size: 9pt; color: #666; }}
  .meta {{ text-align: right; font-size: 9pt; color: #444; }}
  h2 {{ font-size: 12pt; color: #CC0000; border-bottom: 1px solid #eee; padding-bottom: 4px; margin-top: 20px; }}
  table {{ width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 9pt; }}
  th {{ background: #f5f5f5; text-align: left; padding: 6px 8px; font-weight: 600; border-bottom: 2px solid #ddd; }}
  td {{ padding: 5px 8px; border-bottom: 1px solid #eee; }}
  .amount {{ text-align: right; font-variant-numeric: tabular-nums; }}
  .rule {{ color: #888; font-size: 8pt; }}
  .total-box {{ background: #CC0000; color: white; padding: 16px 20px; border-radius: 6px; margin-top: 20px; display: flex; justify-content: space-between; align-items: center; }}
  .total-box .label {{ font-size: 13pt; font-weight: bold; }}
  .total-box .value {{ font-size: 18pt; font-weight: bold; }}
  .disclaimer {{ margin-top: 24px; padding: 10px 12px; background: #fff8e1; border-left: 4px solid #f9a825; font-size: 8pt; color: #555; }}
  .footer {{ margin-top: 30px; border-top: 1px solid #ddd; padding-top: 8px; font-size: 7.5pt; color: #888; display: flex; justify-content: space-between; }}
  .section-grid {{ display: flex; gap: 20px; }}
  .section-grid .col {{ flex: 1; }}
  .field {{ margin-bottom: 6px; }}
  .field label {{ font-size: 7.5pt; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }}
  .field value {{ display: block; font-size: 9.5pt; font-weight: 500; }}
</style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">Sun<span>Tax</span></div>
      <div class="subtitle">KI-gestützte Schweizer Steuererklärung</div>
    </div>
    <div class="meta">
      Kanton: <strong>{canton_code}</strong> | Gemeinde: <strong>{municipality}</strong><br/>
      Steuerjahr: <strong>{tax_year}</strong><br/>
      Regelversion: {rule_version}<br/>
      Erstellt: {generated_at}
    </div>
  </div>

  <h2>1. Persönliche Angaben</h2>
  <div class="section-grid">
    <div class="col">
      <div class="field"><label>Name</label><value>{name}</value></div>
      <div class="field"><label>Adresse</label><value>{address}</value></div>
    </div>
    <div class="col">
      <div class="field"><label>Geburtsdatum</label><value>{dob}</value></div>
      <div class="field"><label>Zivilstand</label><value>{marital}</value></div>
    </div>
  </div>

  <h2>2. Einkommen</h2>
  <table>
    <tr><th>Position</th><th class="amount">Betrag (CHF)</th></tr>
    <tr><td>Bruttolohn / Erwerbseinkommen</td><td class="amount">{chf(total_income)}</td></tr>
    <tr><td>Bankzinsen</td><td class="amount">{chf(inc.get('bank_interest', 0))}</td></tr>
    <tr><td>Dividenden</td><td class="amount">{chf(inc.get('dividends', 0))}</td></tr>
    <tr><td><strong>Total Einkommen</strong></td><td class="amount"><strong>{chf(total_income)}</strong></td></tr>
  </table>

  <h2>3. Abzüge</h2>
  <table>
    <tr><th>Abzug</th><th class="amount">Betrag (CHF)</th></tr>
    <tr><td>Säule 3a Beiträge</td><td class="amount">{chf(pillar3a)}</td></tr>
    <tr><td>Spenden</td><td class="amount">{chf(donations)}</td></tr>
    <tr><td>Hypothekarzinsen</td><td class="amount">{chf(mortgage_interest)}</td></tr>
    <tr><td><strong>Steuerbares Einkommen</strong></td><td class="amount"><strong>{chf(taxable_income)}</strong></td></tr>
  </table>

  <h2>4. Vermögen</h2>
  <table>
    <tr><th>Position</th><th class="amount">Betrag (CHF)</th></tr>
    <tr><td>Bankguthaben</td><td class="amount">{chf(total_wealth)}</td></tr>
    <tr><td>Schulden / Hypotheken</td><td class="amount">{chf(liab.get('total_mortgage_debt', 0))}</td></tr>
    <tr><td><strong>Steuerbares Vermögen</strong></td><td class="amount"><strong>{chf(taxable_wealth_val)}</strong></td></tr>
  </table>

  <h2>5. Steuerberechnung</h2>
  <table>
    <tr><th>Steuerart</th><th class="amount">Betrag (CHF)</th></tr>
    <tr><td>Direkte Bundessteuer</td><td class="amount">{chf(federal_tax)}</td></tr>
    <tr><td>Kantonssteuer ({canton_code})</td><td class="amount">{chf(cantonal_tax)}</td></tr>
    <tr><td>Gemeindesteuer ({municipality})</td><td class="amount">{chf(municipal_tax)}</td></tr>
    <tr><td>Vermögenssteuer</td><td class="amount">{chf(wealth_tax)}</td></tr>
  </table>

  <div class="total-box">
    <span class="label">Gesamtsteuerlast {tax_year}</span>
    <span class="value">{chf(total_tax)}</span>
  </div>

  {"<h2>6. Berechnungsdetails (Transparenz)</h2><table><tr><th>Position</th><th class='amount'>Betrag</th><th>Regelreferenz</th></tr>" + breakdown_rows + "</table>" if breakdown_rows else ""}

  <div class="disclaimer">
    <strong>Hinweis:</strong> Dieses Dokument wurde mit SunTax auf Basis der hochgeladenen Dokumente und der geltenden Steuerregeln erstellt.
    Die Berechnungen basieren auf den erfassten Daten. Bitte überprüfen Sie alle Angaben sorgfältig.
    SunTax ersetzt keine professionelle Steuerberatung. Komplexe Steuersituationen sollten mit einem Steuerberater besprochen werden.
    Regelversion: {rule_version} | Erstellt am: {generated_at}
  </div>

  <div class="footer">
    <span>SunTax – KI-gestützte Steuererklärung Schweiz</span>
    <span>Kanton {canton_code} | {municipality} | Steuerjahr {tax_year}</span>
  </div>
</body>
</html>"""

    if _WEASY_AVAILABLE:
        return _WeasyHTML(string=html_content).write_pdf()

    # ReportLab has no GTK/Pango dependency and always produces a valid PDF.
    return _generate_reportlab_pdf(tax_return, profile, calculation)
