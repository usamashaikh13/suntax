import os
import shutil
from pathlib import Path
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.pdfgen import canvas
from reportlab.lib.units import mm

DEST = Path("/Users/osamashaikh/.gemini/antigravity/scratch/suntax/docs/demo_documents_synthetic")
DEST.mkdir(parents=True, exist_ok=True)

def draw_header(pdf, title, doc_type_tag, width, height):
    pdf.setFillColor(colors.HexColor("#1E7B52"))  # SunTax Green
    pdf.rect(0, height - 35 * mm, width, 35 * mm, fill=1, stroke=0)
    pdf.setFillColor(colors.white)
    pdf.setFont("Helvetica-Bold", 15)
    pdf.drawString(20 * mm, height - 18 * mm, title)
    pdf.setFont("Helvetica", 9)
    pdf.drawString(20 * mm, height - 26 * mm, f"Synthetisches Demodokument · Staging Test Only · Kategorie: {doc_type_tag}")

    # Disclaimer banner
    pdf.setFillColor(colors.HexColor("#FFFBEB"))
    pdf.setStrokeColor(colors.HexColor("#F59E0B"))
    pdf.rect(20 * mm, height - 50 * mm, width - 40 * mm, 11 * mm, fill=1, stroke=1)
    pdf.setFillColor(colors.HexColor("#92400E"))
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(24 * mm, height - 44 * mm, "ACHTUNG: Fiktive Testdaten für SunTax Milestone 2 Abnahme.")
    pdf.setFont("Helvetica", 7.5)
    pdf.drawString(24 * mm, height - 48 * mm, "Kein amtliches Dokument. Nicht für tatsächliche Steuerveranlagung zulässig.")

def draw_row(pdf, y, label, value, width, is_bold=False):
    pdf.setStrokeColor(colors.HexColor("#E5E7EB"))
    pdf.line(20 * mm, y - 3 * mm, width - 20 * mm, y - 3 * mm)
    pdf.setFillColor(colors.HexColor("#4B5563"))
    pdf.setFont("Helvetica", 8.5)
    pdf.drawString(22 * mm, y, label)
    pdf.setFillColor(colors.HexColor("#111827"))
    pdf.setFont("Helvetica-Bold" if is_bold else "Helvetica", 9)
    pdf.drawRightString(width - 22 * mm, y, str(value))
    return y - 7.5 * mm

def create_lohnausweis(filename, person, employer, ahv, gross, net, bvg, alv):
    filepath = DEST / filename
    pdf = canvas.Canvas(str(filepath), pagesize=A4)
    width, height = A4
    draw_header(pdf, "Lohnausweis 2025 / Certificat de salaire", "salary_certificate", width, height)

    y = height - 60 * mm
    pdf.setFillColor(colors.HexColor("#1E7B52"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "A. Angaben zum Arbeitnehmer & Arbeitgeber")
    y -= 8 * mm

    y = draw_row(pdf, y, "Arbeitnehmer Name & Vorname", person["name"], width, True)
    y = draw_row(pdf, y, "Wohnadresse", person["address"], width)
    y = draw_row(pdf, y, "AHV-Nummer", ahv, width, True)
    y = draw_row(pdf, y, "Geburtsdatum", person["dob"], width)
    y = draw_row(pdf, y, "Arbeitgeber", employer["name"], width, True)
    y = draw_row(pdf, y, "Sitz des Arbeitgebers", employer["address"], width)
    y = draw_row(pdf, y, "Beschaeftigungsgrad / Periode", "100% · 01.01.2025 - 31.12.2025", width)

    y -= 6 * mm
    pdf.setFillColor(colors.HexColor("#1E7B52"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "B. Einkuenfte und Abzuege (Lohnausweis-Ziffern)")
    y -= 8 * mm

    y = draw_row(pdf, y, "1. Lohn / Bruttolohn", f"CHF {gross:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "2. Gehaltsnebenleistungen", "CHF 0.00", width)
    y = draw_row(pdf, y, "8. Bruttolohn total", f"CHF {gross:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "9. Beitraege AHV/IV/EO/ALV/NBUV", f"CHF {alv:,.2f}".replace(",", "'"), width)
    y = draw_row(pdf, y, "10. Beitraege berufliche Vorsorge (BVG / Pensionskasse)", f"CHF {bvg:,.2f}".replace(",", "'"), width)
    y = draw_row(pdf, y, "11. Nettolohn", f"CHF {net:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "Spesenverguetungen / Mittagessen", "Kantine / verbilligte Verpflegung", width)

    pdf.save()
    print(f"Generated: {filepath.name}")

def create_bank(filename, bank_name, owner, iban, balance, interest):
    filepath = DEST / filename
    pdf = canvas.Canvas(str(filepath), pagesize=A4)
    width, height = A4
    draw_header(pdf, f"{bank_name} - Kontoauszug per 31.12.2025", "bank_statement", width, height)

    y = height - 60 * mm
    pdf.setFillColor(colors.HexColor("#1E7B52"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "Zins- und Saldoausweis per 31.12.2025 / Steuerausweis")
    y -= 8 * mm

    y = draw_row(pdf, y, "Bankinstitut", bank_name, width, True)
    y = draw_row(pdf, y, "Kontoinhaber", owner, width)
    y = draw_row(pdf, y, "IBAN", iban, width, True)
    y = draw_row(pdf, y, "Waehrung", "CHF", width)
    y = draw_row(pdf, y, "Saldo per 31.12.2025", f"CHF {balance:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "Habenzins 2025", f"CHF {interest:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "Verrechnungssteuer (35%)", "CHF 0.00", width)
    pdf.save()
    print(f"Generated: {filepath.name}")

def create_pillar3a(filename, provider, owner, ahv, amount):
    filepath = DEST / filename
    pdf = canvas.Canvas(str(filepath), pagesize=A4)
    width, height = A4
    draw_header(pdf, f"{provider} - Bescheinigung Saeule 3a (Pillar 3a)", "pillar3a", width, height)

    y = height - 60 * mm
    pdf.setFillColor(colors.HexColor("#1E7B52"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "Bescheinigung gebundene Vorsorge Saeule 3a / Pillar 3a Steuerjahr 2025")
    y -= 8 * mm

    y = draw_row(pdf, y, "Vorsorgestiftung", provider, width, True)
    y = draw_row(pdf, y, "Vorsorgenehmer", owner, width)
    y = draw_row(pdf, y, "AHV-Nummer", ahv, width, True)
    y = draw_row(pdf, y, "Konto-/Policennummer", "3A-789456-2025", width)
    y = draw_row(pdf, y, "Einbezahlter Betrag", f"CHF {amount:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "Total Beitraege an die Saeule 3a", f"CHF {amount:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "Guthaben per 31.12.2025", "CHF 28'450.00", width)
    pdf.save()
    print(f"Generated: {filepath.name}")

def create_donation(filename, org, donor, amount):
    filepath = DEST / filename
    pdf = canvas.Canvas(str(filepath), pagesize=A4)
    width, height = A4
    draw_header(pdf, "Spendenbescheinigung / Spendenquittung 2025", "donation", width, height)

    y = height - 60 * mm
    pdf.setFillColor(colors.HexColor("#1E7B52"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "Bestaetigung gemeinnuetzige Spende / Spendenbescheinigung 2025")
    y -= 8 * mm

    y = draw_row(pdf, y, "Organisation", org, width, True)
    y = draw_row(pdf, y, "Spender", donor, width)
    y = draw_row(pdf, y, "Spendenbetrag", f"CHF {amount:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "Steuerbefreiung", "Kanton Zuerich gemaess Verfuegung steuerbefreit", width)
    pdf.save()
    print(f"Generated: {filepath.name}")

def create_childcare(filename, facility, parents, kids, amount):
    filepath = DEST / filename
    pdf = canvas.Canvas(str(filepath), pagesize=A4)
    width, height = A4
    draw_header(pdf, f"{facility} - Bestaetigung Betreuungskosten", "childcare", width, height)

    y = height - 60 * mm
    pdf.setFillColor(colors.HexColor("#1E7B52"))
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawString(20 * mm, y, "Aufstellung drittbetreute Kinderbetreuungskosten 2025")
    y -= 8 * mm

    y = draw_row(pdf, y, "Betreuungseinrichtung", facility, width, True)
    y = draw_row(pdf, y, "Eltern", parents, width)
    y = draw_row(pdf, y, "Betreute Kinder", kids, width, True)
    y = draw_row(pdf, y, "Betreuungsaufwand 2025", f"CHF {amount:,.2f}".replace(",", "'"), width, True)
    y = draw_row(pdf, y, "Zweck", "Drittbetreuungskosten berufsbedingt", width)
    pdf.save()
    print(f"Generated: {filepath.name}")

# Account A (Single: Max Muster)
create_lohnausweis(
    "demo_a_salary_max_muster.pdf",
    {"name": "Max Muster", "address": "Marktgasse 10, 8400 Winterthur", "dob": "12.04.1995"},
    {"name": "SwissTech Solutions AG", "address": "Technoparkstrasse 1, 8005 Zuerich"},
    "756.9217.0769.85",
    85000.0, 74200.0, 5450.0, 5350.0
)
create_bank(
    "demo_a_bank_zkb.pdf",
    "Zuercher Kantonalbank", "Max Muster", "CH93 0076 2011 6238 5295 8",
    25400.0, 45.50
)
create_pillar3a(
    "demo_a_pillar3a_viac.pdf",
    "Stiftung VIAC 3a", "Max Muster", "756.9217.0769.85",
    7000.0
)
create_donation(
    "demo_a_donation_rotes_kreuz.pdf",
    "Stiftung Schweizerisches Rotes Kreuz", "Max Muster",
    250.0
)

# Account B (Family: Thomas & Sarah Keller)
create_lohnausweis(
    "demo_b_salary_thomas_keller.pdf",
    {"name": "Thomas Keller", "address": "Seestrasse 45, 8002 Zuerich", "dob": "08.09.1988"},
    {"name": "Alpine Solutions AG", "address": "Gotthardstrasse 20, 8002 Zuerich"},
    "756.1234.5678.97",
    95000.0, 82500.0, 6200.0, 6300.0
)
create_lohnausweis(
    "demo_b_salary_sarah_keller.pdf",
    {"name": "Sarah Keller", "address": "Seestrasse 45, 8002 Zuerich", "dob": "14.11.1990"},
    {"name": "Zurich Media GmbH", "address": "Foerrlibuckstrasse 10, 8005 Zuerich"},
    "756.9876.5432.10",
    62000.0, 54000.0, 4100.0, 3900.0
)
create_bank(
    "demo_b_bank_ubs.pdf",
    "UBS Switzerland AG", "Thomas & Sarah Keller", "CH58 0024 0240 1234 5678 9",
    42000.0, 85.00
)
create_pillar3a(
    "demo_b_pillar3a_frankly.pdf",
    "Stiftung frankly Saeule 3a", "Thomas Keller", "756.1234.5678.97",
    7258.0
)
create_childcare(
    "demo_b_childcare_kita.pdf",
    "Kita Sonnenblume Zuerich", "Thomas & Sarah Keller", "Leo Keller (2018), Mia Keller (2021)",
    18000.0
)

# Conflicting salary certificate for Thomas Keller at Alpine Solutions AG with CHF 115'000.00
create_lohnausweis(
    "demo_b_conflicting_salary_alpine.pdf",
    {"name": "Thomas Keller", "address": "Seestrasse 45, 8002 Zuerich", "dob": "08.09.1988"},
    {"name": "Alpine Solutions AG", "address": "Gotthardstrasse 20, 8002 Zuerich"},
    "756.1234.5678.97",
    115000.0, 99500.0, 7500.0, 8000.0
)

# Duplicate document (exact identical copy of Thomas's salary certificate)
shutil.copyfile(DEST / "demo_b_salary_thomas_keller.pdf", DEST / "demo_b_duplicate_salary_thomas.pdf")
print("Generated duplicate document: demo_b_duplicate_salary_thomas.pdf")

print("All synthetic demo documents generated successfully!")
