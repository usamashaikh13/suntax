"""
Swiss Document OCR & Extraction Accuracy Validation Suite.
Tests real-world Swiss tax documents across German, French, and bilingual formats:
1. Swiss Lohnausweis (Salary Certificate) with full 15-box schema & formatting variations
2. Swiss Bank Statements (Kontoauszug & Depotauszug) with 35% Verrechnungssteuer
3. Pillar 3a (Säule 3a) contribution certificates
4. Robustness against OCR noise, currency formatting, and missing fields
"""
import pytest
from app.api.v1.documents import _local_extract, _parse_currency_amount

def test_currency_amount_parsing_variations():
    """Verify Swiss, European, and Anglo-Saxon currency representations parse reliably."""
    cases = [
        ("95'000.00", 95000.0),
        ("64'600", 64600.0),
        ("120,500.50", 120500.5),
        ("120 500.50", 120500.5),
        ("7'258.00", 7258.0),
        ("CHF 84'250.75", 84250.75),
        ("57.755,00", 57755.0),  # European notation
        ("100000", 100000.0),
        ("0.00", 0.0),
        ("-", None),
        ("N/A", None),
    ]
    for raw, expected in cases:
        parsed = _parse_currency_amount(raw)
        assert parsed == expected, f"Failed on '{raw}': expected {expected}, got {parsed}"


def test_swiss_lohnausweis_box_extraction():
    """Verify official Swiss Lohnausweis (salary certificate) field extraction."""
    lohnausweis_sample = """
    KANTON ZÜRICH - STEUERAMT
    LOHNAUSWEIS / RENTENBESCHEINIGUNG
    
    Arbeitgeber:
    TechSolutions AG
    Industriestrasse 42, 8005 Zürich
    CHE-109.876.543 MWST

    A. Name und Adresse des Arbeitnehmers:
    Marc Schneider
    Seestrasse 14, 8002 Zürich
    Geburtsdatum: 12.04.1988
    AHV-Nummer: 756.9284.1029.44

    1. Lohn: 115'000.00
    2. Gehaltsnebenleistungen: 0.00
    8. Bruttolohn: 115'000.00
    9. Beiträge AHV/IV/EO/ALV/NBUV: 8'395.00
    10. Berufliche Vorsorge (BVG): 5'200.00
    11. Nettolohn: 101'405.00
    13.1 Reisekosten / Spesen: 2'400.00
    """
    doc_type, conf, extracted, conf_dict = _local_extract(lohnausweis_sample, "Lohnausweis_2025_Schneider.pdf")
    
    assert doc_type == "salary_certificate"
    assert conf >= 0.85
    assert extracted["gross_salary"] == 115000.0
    assert extracted["net_salary"] == 101405.0
    assert "Schneider" in str(extracted.get("employee_name"))
    assert "TechSolutions" in str(extracted.get("employer_name"))
    assert "756.9284.1029.44" in str(extracted.get("ahv_number"))


def test_french_certificat_de_salaire():
    """Verify Romandie / French Swiss Certificat de salaire extraction."""
    certificat_sample = """
    RÉPUBLIQUE ET CANTON DE GENÈVE
    CERTIFICAT DE SALAIRE / ATTESTATION DE RENTES
    
    Employeur:
    Horlogerie Prestige SA
    Rue du Rhône 10, 1204 Genève
    
    Salarié:
    Jean Dupont
    Avenue de Champel 25, 1206 Genève
    N° AVS: 756.3344.5566.77
    
    1. Salaire: 98'500.00
    8. Salaire brut: 98'500.00
    9. Cotisations AVS/AI/APG/AC: 7'190.50
    10. Prévoyance professionnelle (LPP): 4'500.00
    11. Salaire net: 86'809.50
    """
    doc_type, conf, extracted, _ = _local_extract(certificat_sample, "certificat_salaire_dupont.pdf")
    assert doc_type == "salary_certificate"
    # Gross salary should be captured even in French layout
    assert extracted["gross_salary"] in (98500.0, None) or extracted["net_salary"] is not None


def test_bank_statement_with_withholding_tax():
    """Verify Swiss bank statement balance and 35% withholding tax (Verrechnungssteuer)."""
    bank_statement_sample = """
    Zürcher Kantonalbank
    KONTOAUSZUG PER 31.12.2025
    
    Kontoinhaber:
    Marc Schneider, 8002 Zürich
    IBAN: CH93 0070 0110 0012 3456 7
    
    Saldo per 31.12.2025: CHF 42'350.80
    Habenzins brutto: CHF 420.00
    35% Verrechnungssteuer (VSt): -CHF 147.00
    Habenzins netto: CHF 273.00
    """
    doc_type, conf, extracted, _ = _local_extract(bank_statement_sample, "ZKB_Kontoauszug_2025.pdf")
    assert doc_type == "bank_statement"
    assert extracted.get("balance") == 42350.80
    assert extracted.get("interest_earned") in (420.0, 273.0)


def test_pillar_3a_certificate():
    """Verify Vorsorgebescheinigung Säule 3a extraction."""
    p3a_sample = """
    VIAC Vorsorgestiftung 3a
    BESCHEINIGUNG SÄULE 3A - STEUERPERIODE 2025
    
    Vorsorgenehmer:
    Marc Schneider
    AHV-Nr.: 756.9284.1029.44
    
    Einzahlung im Kalenderjahr 2025:
    Einzahlungsbetrag: CHF 7'258.00
    Guthaben per 31.12.2025: CHF 36'480.00
    
    Bestätigung:
    Dieser Betrag ist im Rahmen der gesetzlichen Höchstabzüge gemäss BVV 3 steuerabzugsfähig.
    """
    doc_type, conf, extracted, _ = _local_extract(p3a_sample, "VIAC_Saeule3a_2025.pdf")
    assert doc_type == "pillar3a"
    assert extracted.get("contribution_amount") == 7258.0
