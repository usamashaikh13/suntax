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


if __name__ == '__main__':
    import sys
    from pathlib import Path
    Path(sys.argv[1]).write_bytes(generate_tax_return_pdf(*fixture()))
