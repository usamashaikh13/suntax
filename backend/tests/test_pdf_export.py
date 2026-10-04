"""Regression coverage for truthful amounts and long, valid PDF summaries."""
from types import SimpleNamespace as NS
import fitz
from app.services.pdf_export_service import generate_tax_return_pdf


def fixture():
    tr = NS(id='sample-bern-2026', canton_code='BE', tax_year=2026, municipality_name='Bern')
    profile = NS(personal_data={'first_name': 'Sample', 'last_name': 'Taxpayer'},
                 income_data={'employment_income': 0, 'dividend_income': 120, 'interest_income': 45},
                 deductions_data={}, wealth_data={}, liabilities_data={})
    calc = NS(calculation_details={'taxable_income': 0, 'taxable_wealth': 0,
              'federal_income_tax': 0, 'cantonal_income_tax': 0, 'municipal_income_tax': 0,
              'wealth_tax_canton': 12, 'wealth_tax_municipal': 8, 'total_tax': 20,
              'breakdown': [{'label': 'Saved calculation line ' + str(i), 'amount': i,
                             'rule_reference': 'Example reference'} for i in range(35)]})
    return tr, profile, calc


def test_missing_data_never_becomes_deductions_or_account():
    tr, profile, calc = fixture()
    data = generate_tax_return_pdf(tr, profile, calc)
    with fitz.open(stream=data, filetype='pdf') as pdf:
        text = '\n'.join(page.get_text() for page in pdf)
    assert 'Not provided' in text
    assert "2'000.00" not in text and "2'600.00" not in text
    assert 'Lohnkonto' not in text and 'Kantonale Steuerverwaltung' not in text
    assert 'CHF 120.00' in text and 'CHF 45.00' in text
    assert 'CHF 20.00' in text and 'CHF 0.00' in text
    assert 'Saved calculation line 34' in text


def test_nested_results_and_model_fallback():
    tr, profile, _ = fixture()
    calc = NS(calculation_details='{"results": {"total_tax": 0}}',
              federal_income_tax=123, total_tax_due=999)
    with fitz.open(stream=generate_tax_return_pdf(tr, profile, calc), filetype='pdf') as pdf:
        text = '\n'.join(page.get_text() for page in pdf)
    assert 'CHF 123.00' in text and 'CHF 999.00' not in text


def test_pdf_export_includes_securities_and_cantonal_portal_guide():
    """Verify that securities_positions and cantonal filing guide appear in the generated PDF."""
    tr = NS(id='test-zh-return', canton_code='ZH', tax_year=2025, municipality_name='Zürich')
    profile = NS(
        personal_data={'first_name': 'Hans', 'last_name': 'Muster'},
        income_data={'employment_income': 90000, 'dividend_income': 1500},
        deductions_data={},
        wealth_data={
            'securities_positions': [
                {'name': 'Swiss Market Index ETF', 'isin': 'CH0012345678', 'total_value_chf': 75000}
            ]
        },
        liabilities_data={},
    )
    calc = NS(
        calculation_details={
            'taxable_income': 85000,
            'taxable_wealth': 50000,
            'federal_income_tax': 1200,
            'cantonal_income_tax': 4500,
            'municipal_income_tax': 5355,
            'total_tax': 11055,
        }
    )
    pdf_bytes = generate_tax_return_pdf(tr, profile, calc)
    with fitz.open(stream=pdf_bytes, filetype='pdf') as pdf:
        text = '\n'.join(page.get_text() for page in pdf)
    
    assert 'Swiss Market Index ETF' in text or 'CH0012345678' in text
    assert "75'000.00" in text
    assert 'eTax.zh' in text
    assert 'OFFICIAL TAX SUMMARY' in text


def test_xml_export_includes_securities():
    """Verify that eCH XML export includes securities with eCH-0196 standard compatibility."""
    from app.services.xml_export_service import generate_ech_xml
    tr = NS(id='test-xml-return', canton_code='BE', tax_year=2025, municipality_name='Biel/Bienne')
    profile = NS(
        personal_data={'first_name': 'Anna', 'last_name': 'Schmidt', 'civil_status': 'Single'},
        income_data={'employment_income': 80000, 'dividend_income': 2400},
        deductions_data={},
        wealth_data={
            'bank_accounts': [{'bank_name': 'UBS', 'iban': 'CH9300000000000000000', 'balance_chf': 45000}],
            'securities_positions': [
                {'name': 'Nestle SA', 'isin': 'CH0038863350', 'total_value_chf': 62000}
            ]
        },
        liabilities_data={},
    )
    calc = NS(
        calculation_details={
            'taxable_income': 75000,
            'taxable_wealth': 80000,
            'federal_income_tax': 900,
            'cantonal_income_tax': 3500,
            'municipal_income_tax': 5775,
            'total_tax': 10175,
        }
    )
    xml_str = generate_ech_xml(tr, profile, calc)
    assert '<?xml' in xml_str
    assert 'ech-0196' in xml_str.lower()
    assert 'Nestle SA' in xml_str or 'CH0038863350' in xml_str
    assert '62000' in xml_str


if __name__ == '__main__':
    import sys
    from pathlib import Path
    Path(sys.argv[1]).write_bytes(generate_tax_return_pdf(*fixture()))
