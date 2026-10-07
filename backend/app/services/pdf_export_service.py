"""English SunTax summaries from recorded profile data and calculation snapshots."""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html import escape
from typing import Any


def _mapping(value):
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except (ValueError, TypeError):
            return {}
    return value if isinstance(value, dict) else {}


def _raw(value):
    return value.get('value') if isinstance(value, dict) and 'value' in value else value


def _number(value):
    try:
        result = Decimal(str(_raw(value)))
        return result if result.is_finite() else None
    except (InvalidOperation, ValueError, TypeError):
        return None


def _text(value):
    value = _raw(value)
    return str(value) if value is not None and str(value).strip() else 'Not provided'


def _chf(value):
    number = _number(value)
    return 'Not provided' if number is None else f"CHF {number:,.2f}".replace(',', "'")


def _pick(data, *keys):
    return next((data[k] for k in keys if _raw(data.get(k)) is not None), None)


def generate_tax_return_pdf(tax_return: Any, profile: Any, calculation: Any) -> bytes:
    """Render a draft summary; never invent profile values or recalculate tax."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

    personal = _mapping(getattr(profile, 'personal_data', None))
    income = _mapping(getattr(profile, 'income_data', None))
    deductions = _mapping(getattr(profile, 'deductions_data', None))
    wealth = _mapping(getattr(profile, 'wealth_data', None))
    liabilities = _mapping(getattr(profile, 'liabilities_data', None))
    details = _mapping(getattr(calculation, 'calculation_details', None))
    results = _mapping(getattr(calculation, 'results', None)) or _mapping(details.get('results')) or details

    def result(*keys):
        value = _pick(results, *keys)
        if value is not None:
            return value
        return next((getattr(calculation, k, None) for k in keys if getattr(calculation, k, None) is not None), None)

    canton = _text(getattr(tax_return, 'canton_code', None))
    year = _text(getattr(tax_return, 'tax_year', None))
    municipality = _text(getattr(tax_return, 'municipality_name', None))
    reference = str(getattr(tax_return, 'id', 'Not provided'))
    output = io.BytesIO()
    doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=42, rightMargin=42,
                            topMargin=66, bottomMargin=52, title=f'SunTax {canton} {year} Tax Return Summary', author='SunTax')
    width = A4[0] - 84
    ink = colors.HexColor('#173b35')
    muted = colors.HexColor('#64756e')
    styles = {
        'body': ParagraphStyle('body', fontName='Helvetica', fontSize=9, leading=13, textColor=ink),
        'title': ParagraphStyle('title', fontName='Helvetica-Bold', fontSize=25, leading=30, textColor=ink, spaceAfter=8),
        'section': ParagraphStyle('section', fontName='Helvetica-Bold', fontSize=13, leading=17, textColor=ink, spaceBefore=16, spaceAfter=8, keepWithNext=True),
        'small': ParagraphStyle('small', fontName='Helvetica', fontSize=8, leading=11, textColor=muted),
        'amount': ParagraphStyle('amount', fontName='Helvetica', fontSize=9, leading=13, textColor=ink, alignment=2),
    }
    def p(value, style='body'):
        return Paragraph(escape(_text(value)), styles[style])

    story = []
    def section(title):
        story.append(p(title, 'section'))

    def table(headers, rows, proportions=(0.70, 0.30), money_last=False):
        data = [[p(h, 'small') for h in headers]]
        for row in rows:
            data.append([p(v, 'amount' if money_last and i == len(row)-1 else 'body') for i, v in enumerate(row)])
        t = Table(data, colWidths=[width * n for n in proportions], repeatRows=1, hAlign='LEFT')
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eaf0eb')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7f9f6')]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#cad7cf')),
        ]))
        story.append(t)

    def recorded(data, fields, extra_key=None):
        rows = [(label, _chf(_pick(data, *keys))) for label, keys in fields if _pick(data, *keys) is not None]
        extras = data.get(extra_key, []) if extra_key else []
        for item in extras if isinstance(extras, list) else []:
            if isinstance(item, dict):
                rows.append((_text(item.get('description')), _chf(item.get('amount'))))
        return rows or [('No amounts recorded', 'Not provided')]

    story.extend([p('Tax Return Summary', 'title'), p(f'Tax year {year}  /  Canton {canton}  /  {municipality}'), Spacer(1, 12),
                  p('Prepared by SunTax for your review. This summary is not an official tax form or proof of submission. Figures from the saved calculation are estimates.', 'small')])
    section('01  Taxpayer details')
    name = ' '.join(str(_raw(personal[k])) for k in ('first_name', 'last_name') if _raw(personal.get(k))) or personal.get('name')
    address = ', '.join(str(_raw(personal[k])) for k in ('address_street', 'address_zip', 'address_city') if _raw(personal.get(k))) or personal.get('address')
    table(['PROFILE', 'RECORDED VALUE'], [('Name', name), ('Address', address), ('Date of birth', personal.get('date_of_birth')),
          ('AHV / AVS number', personal.get('ahv_number')), ('Marital status', _pick(personal, 'civil_status', 'marital_status'))])
    section('02  Saved tax estimate')
    wealth_tax = result('wealth_tax')
    if wealth_tax is None:
        parts = [_number(result(k)) for k in ('wealth_tax_canton', 'wealth_tax_municipal')]
        if all(v is not None for v in parts):
            wealth_tax = sum(parts)
    table(['COMPONENT', 'ESTIMATED AMOUNT'], [
        ('Taxable income', _chf(result('taxable_income'))),
        ('Taxable wealth', _chf(result('taxable_wealth'))),
        ('Federal income tax', _chf(result('federal_income_tax'))),
        ('Cantonal income tax', _chf(result('cantonal_income_tax'))),
        ('Municipal income tax', _chf(result('municipal_income_tax'))),
        ('Wealth tax', _chf(wealth_tax)),
        ('Total estimated tax - saved result', _chf(result('total_tax', 'total_tax_due'))),
    ], money_last=True)
    story.append(Spacer(1, 10))
    story.append(p(f"Calculation date: {_text(getattr(calculation, 'calculated_at', None))}. Rule version: {_text(getattr(calculation, 'rule_version', None))}. Profile entries below may differ from the saved calculation if edited afterwards; recalculate after changes.", 'small'))
    story.append(PageBreak())
    story.append(p('Your recorded finances', 'title'))
    story.append(p('These are profile entries, not a determination of allowable deductions. Missing amounts are not assumed to be zero.', 'small'))
    section('03  Income')
    table(['INCOME CATEGORY', 'RECORDED AMOUNT'], recorded(income, [
        ('Employment income', ('employment_income', 'gross_salary', 'total_employment_income')),
        ('Spouse employment income', ('employment_income_spouse',)), ('Self-employment', ('self_employment_income',)),
        ('Pensions', ('pension_income',)), ('Rental income', ('rental_income',)), ('Dividends', ('dividend_income',)),
        ('Interest', ('interest_income',)), ('Capital gains reported', ('capital_gains',)), ('Alimony received', ('alimony_received',)),
    ], 'other_income'), money_last=True)
    section('04  Deductions entered')
    table(['DEDUCTION CATEGORY', 'RECORDED AMOUNT'], recorded(deductions, [
        ('Professional expenses', ('professional_expenses',)), ('Commuting', ('travel_expenses',)), ('Meals', ('meal_expenses',)),
        ('Pillar 2 contributions', ('pillar2_contributions',)), ('Pillar 3a contributions', ('pillar3a_contributions',)),
        ('Health insurance premiums', ('health_insurance_premiums',)), ('Medical expenses', ('medical_expenses',)),
        ('Childcare', ('childcare_expenses',)), ('Donations', ('donations',)), ('Debt interest', ('debt_interest',)),
        ('Education', ('education_expenses',)), ('Alimony paid', ('alimony_paid',)),
    ], 'other_deductions'), money_last=True)
    story.append(PageBreak())
    story.append(p('Assets & liabilities', 'title'))
    section('05  Recorded assets')
    asset_rows = []
    # 1. Bank accounts
    for acc in wealth.get('bank_accounts', []) if isinstance(wealth.get('bank_accounts'), list) else []:
        if isinstance(acc, dict):
            lbl = ' / '.join(_text(acc[k]) for k in ('bank_name', 'iban') if acc.get(k)) or 'Bank Account'
            asset_rows.append((lbl, _chf(_pick(acc, 'balance_chf', 'balance'))))

    # 2. Securities
    sec_source = wealth.get('securities') or wealth.get('securities_positions') or []
    for s in sec_source if isinstance(sec_source, list) else []:
        if isinstance(s, dict):
            lbl = ' / '.join(_text(s[k]) for k in ('name', 'broker_name', 'isin') if s.get(k)) or 'Securities Account'
            asset_rows.append((lbl, _chf(_pick(s, 'value_chf', 'total_value_chf', 'value'))))

    # 3. Other property
    for key, name_keys, value_keys in [
        ('real_estate', ('address',), ('market_value', 'value')),
        ('vehicles', ('description',), ('value',)),
        ('other_assets', ('description',), ('value',)),
    ]:
        for item in wealth.get(key, []) if isinstance(wealth.get(key), list) else []:
            if isinstance(item, dict):
                label = ' / '.join(_text(item[k]) for k in name_keys if item.get(k)) or key.replace('_', ' ').title()
                asset_rows.append((label, _chf(_pick(item, *value_keys))))

    for key in ('life_insurance_value', 'pillar2_capital', 'pillar3a_capital'):
        if wealth.get(key) is not None:
            asset_rows.append((key.replace('_', ' ').title(), _chf(wealth[key])))
    table(['ASSET / ACCOUNT', 'RECORDED CHF VALUE'], asset_rows or [('No assets recorded', 'Not provided')], money_last=True)
    story.append(p('Asset entries are not automatically taxable. Property values and pension capital require their applicable tax treatment; refer to the saved calculation.', 'small'))
    section('06  Debts')
    debt_rows = []
    for key in ('mortgages', 'loans'):
        for item in liabilities.get(key, []) if isinstance(liabilities.get(key), list) else []:
            if isinstance(item, dict):
                debt_rows.append((_text(item.get('lender')), _chf(item.get('outstanding_balance'))))
    if liabilities.get('other_liabilities') is not None:
        debt_rows.append(('Other liabilities', _chf(liabilities['other_liabilities'])))
    table(['LENDER / LIABILITY', 'RECORDED BALANCE'], debt_rows or [('No debts recorded', 'Not provided')], money_last=True)

    # 07 Official Cantonal Filing Submission Guide
    submission_portals = {
        'ZH': ('eTax.zh / zhservices.ch', 'Kantonales Steueramt Zürich / Gemeindesteueramt'),
        'BE': ('TaxMe-Online via BE-Login (taxme.ch)', 'Steuerverwaltung des Kantons Bern'),
        'ZG': ('eTax.zug (zg.ch/steuerverwaltung)', 'Kantonale Steuerverwaltung Zug'),
        'BS': ('BalTax / eTax Basel-Stadt (steuerverwaltung.bs.ch)', 'Steuerverwaltung Basel-Stadt'),
        'AG': ('SmartTax / EasyTax (ag.ch/steuern)', 'Kantonales Steueramt Aargau'),
        'SG': ('eTax.sg (sg.ch/steuern)', 'Kantonales Steueramt St. Gallen'),
        'SZ': ('eTax.sz (sz.ch/steuern)', 'Kantonales Steueramt Schwyz'),
    }
    portal_info = submission_portals.get(canton, ('Official Cantonal Tax Portal', f'Kantonale Steuerverwaltung {canton}'))

    section(f'07  Legal Filing Framework: Selbstdeklaration (Art. 110 DBG)')
    story.append(p(
        f'Rechtliche Grundlage: Selbstdeklaration gemäss Art. 110 DBG (Bundesgesetz über die direkte Bundessteuer). '
        f'SunTax agiert als automatisiertes Vorbereitungs- und Berechnungswerkzeug zur Erstellung ESTV-konformer Steuerdeklarationen. '
        f'Der Steuerpflichtige reicht das validierte Deklarationspaket direkt über das offizielle Portal des Kantons {canton} ein ({portal_info[0]}) '
        f'oder unterzeichnet die Druckfassung zur postalischer Zustellung an: {portal_info[1]}. '
        f'Dies garantiert volle Gesetzeskonformität ohne unberechtigte Stellvertretung.'
    ))
    story.append(Spacer(1, 8))
    
    # Statutory taxpayer signature block
    sig_data = [
        [
            p("Ort, Datum (Place, Date):\n\n__________________________________", 'small'),
            p("Unterschrift Steuerpflichtige(r) gemäss Art. 110 DBG:\n\n__________________________________", 'small')
        ]
    ]
    sig_table = Table(sig_data, colWidths=[width * 0.45, width * 0.55])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 1, colors.HexColor('#cbd5e1')),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
    ]))
    story.append(sig_table)
    story.append(Spacer(1, 8))
    story.append(p('Requisite supporting documents (Lohnausweis, Säule 3a, bank statements) must accompany this declaration.', 'small'))
    breakdown = getattr(calculation, 'breakdown', None) or results.get('breakdown') or details.get('breakdown') or []
    if isinstance(breakdown, list) and breakdown:
        story.append(PageBreak())
        story.append(p('Calculation details', 'title'))
        story.append(p('All line items below are reproduced from the saved calculation. Rule references are supplied by the calculation engine.', 'small'))
        story.append(Spacer(1, 12))
        table(['LINE ITEM', 'AMOUNT', 'RULE REFERENCE'], [
            (item.get('label'), _chf(item.get('amount')), item.get('rule_reference') or item.get('rule_key'))
            for item in breakdown if isinstance(item, dict)
        ], (0.48, 0.22, 0.30))

    def page_frame(canvas, document):
        canvas.saveState()
        canvas.setFillColor(ink)
        canvas.setFont('Helvetica-Bold', 12)
        canvas.drawString(42, A4[1]-35, 'SunTax')
        canvas.setFont('Helvetica', 8)
        canvas.drawRightString(A4[0]-42, A4[1]-35, f'{canton} / {year}  |  OFFICIAL TAX SUMMARY')
        canvas.setStrokeColor(colors.HexColor('#cad7cf'))
        canvas.line(42, 40, A4[0]-42, 40)
        canvas.setFillColor(muted)
        canvas.setFont('Helvetica', 7)
        canvas.drawString(42, 28, f'Reference: {reference[:36]}')
        canvas.drawRightString(A4[0]-42, 28, f'{datetime.now(timezone.utc):%Y-%m-%d} UTC  |  Page {document.page}')
        canvas.restoreState()

    doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return output.getvalue()
