"""
PDF Tax Return Export using WeasyPrint (production) or a stub (dev without GTK).
"""
from __future__ import annotations
from datetime import datetime

try:
    from weasyprint import HTML as _WeasyHTML
    _WEASY_AVAILABLE = True
except (OSError, ImportError):
    _WEASY_AVAILABLE = False
    _WeasyHTML = None  # type: ignore


def generate_tax_return_pdf(tax_return, profile, calculation) -> bytes:
    """Generate a PDF from the tax return data."""

    pd = profile.personal_data or {}
    inc = profile.income or {}
    wealth = profile.wealth or {}
    ded = profile.deductions or {}
    liab = profile.liabilities or {}
    results = calculation.results or {}
    breakdown = calculation.breakdown or []

    name = pd.get("name", "–")
    address = pd.get("address", "–")
    dob = pd.get("date_of_birth", "–")
    marital = pd.get("marital_status", "–")

    total_income = inc.get("total_employment_income", 0) or 0
    total_wealth = sum(
        (a.get("balance") or 0) for a in (wealth.get("bank_accounts") or [])
    )
    pillar3a = ded.get("pillar3a_total", 0) or 0
    donations = ded.get("donations_total", 0) or 0
    mortgage_interest = ded.get("mortgage_interest", 0) or 0

    federal_tax = results.get("federal_income_tax", 0) or 0
    cantonal_tax = results.get("cantonal_income_tax", 0) or 0
    municipal_tax = results.get("municipal_income_tax", 0) or 0
    wealth_tax = results.get("wealth_tax", 0) or 0
    total_tax = results.get("total_tax", 0) or 0
    taxable_income = results.get("taxable_income", 0) or 0
    taxable_wealth_val = results.get("taxable_wealth", 0) or 0

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
    municipality = tax_return.municipality_name
    rule_version = calculation.tax_rule_version
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

    # Dev-mode stub: return HTML bytes with a PDF-like header so browsers can display it
    stub = (
        "%PDF-1.4\n"
        "% SunTax dev-mode PDF stub (WeasyPrint not available - GTK missing)\n"
        "% Install GTK via: brew install pango cairo gobject-introspection\n\n"
        + html_content
    )
    return stub.encode("utf-8")
