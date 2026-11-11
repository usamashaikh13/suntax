"""Bilingual (German/English) SunTax summaries from recorded profile data and calculation snapshots."""
from __future__ import annotations

import io
import json
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from html import escape
from typing import Any

from app.core.config import settings


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


def _text(value, missing: str = 'Nicht angegeben'):
    value = _raw(value)
    return str(value) if value is not None and str(value).strip() else missing


def _chf(value, missing: str = 'Nicht angegeben'):
    number = _number(value)
    return missing if number is None else f"CHF {number:,.2f}".replace(',', "'")


def _pick(data, *keys):
    return next((data[k] for k in keys if _raw(data.get(k)) is not None), None)


_ASSET_LABELS = {
    'de': {
        'real_estate': 'Liegenschaft',
        'vehicles': 'Fahrzeug',
        'other_assets': 'Übriger Vermögenswert',
        'life_insurance_value': 'Lebensversicherung (Rückkaufswert)',
        'pillar2_capital': 'Kapital Säule 2 (BVG)',
        'pillar3a_capital': 'Kapital Säule 3a',
        'bank_account': 'Bankkonto',
        'securities_account': 'Wertschriftendepot',
    },
    'en': {
        'real_estate': 'Real Estate',
        'vehicles': 'Vehicle',
        'other_assets': 'Other Asset',
        'life_insurance_value': 'Life Insurance Value',
        'pillar2_capital': 'Pillar 2 Capital',
        'pillar3a_capital': 'Pillar 3a Capital',
        'bank_account': 'Bank Account',
        'securities_account': 'Securities Account',
    },
}


def generate_tax_return_pdf(tax_return: Any, profile: Any, calculation: Any, lang: str = "de") -> bytes:
    """Render a draft summary in German ('de', default) or English ('en'); never invent profile values or recalculate tax."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak

    locale = "en" if str(lang or "de").strip().lower().startswith("en") else "de"
    is_de = locale == "de"
    missing_lbl = 'Nicht angegeben' if is_de else 'Not provided'

    def t(de_txt: str, en_txt: str) -> str:
        return de_txt if is_de else en_txt

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

    canton = _text(getattr(tax_return, 'canton_code', None), missing_lbl)
    year = _text(getattr(tax_return, 'tax_year', None), missing_lbl)
    brand_name = settings.get_brand_config()["brand_name"]
    municipality = _text(getattr(tax_return, 'municipality_name', None), missing_lbl)
    reference = str(getattr(tax_return, 'id', missing_lbl))
    output = io.BytesIO()
    doc_title = f'{brand_name} {canton} {year} ' + t('Zusammenfassung Steuererklärung', 'Tax Return Summary')
    doc = SimpleDocTemplate(output, pagesize=A4, leftMargin=42, rightMargin=42,
                            topMargin=66, bottomMargin=52, title=doc_title, author=brand_name)
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
        return Paragraph(escape(_text(value, missing_lbl)), styles[style])

    story = []

    def section(title):
        story.append(p(title, 'section'))

    def table(headers, rows, proportions=(0.70, 0.30), money_last=False):
        data = [[p(h, 'small') for h in headers]]
        for row in rows:
            data.append([p(v, 'amount' if money_last and i == len(row) - 1 else 'body') for i, v in enumerate(row)])
        tbl = Table(data, colWidths=[width * n for n in proportions], repeatRows=1, hAlign='LEFT')
        tbl.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#eaf0eb')),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f7f9f6')]),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 8), ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
            ('LINEBELOW', (0, 0), (-1, 0), 0.5, colors.HexColor('#cad7cf')),
        ]))
        story.append(tbl)

    def recorded(data, fields, extra_key=None, empty_msg='Keine Beträge erfasst'):
        rows = [(label, _chf(_pick(data, *keys), missing_lbl)) for label, keys in fields if _pick(data, *keys) is not None]
        extras = data.get(extra_key, []) if extra_key else []
        for item in extras if isinstance(extras, list) else []:
            if isinstance(item, dict):
                rows.append((_text(item.get('description'), missing_lbl), _chf(item.get('amount'), missing_lbl)))
        return rows or [(empty_msg, missing_lbl)]

    story.extend([
        p(t('Zusammenfassung Steuererklärung', 'Tax Return Summary'), 'title'),
        p(t(f'Steuerjahr {year}  /  Kanton {canton}  /  {municipality}', f'Tax year {year}  /  Canton {canton}  /  {municipality}')),
        Spacer(1, 12),
        p(
            t(
                f'Erstellt durch {brand_name} zu Ihrer Prüfung. Diese Zusammenfassung ist kein amtliches Steuerformular und kein Einreichungsnachweis. Die Angaben aus der gespeicherten Berechnung sind Schätzwerte.',
                f'Prepared by {brand_name} for your review. This summary is not an official tax form or proof of submission. Figures from the saved calculation are estimates.',
            ),
            'small',
        ),
    ])

    section(t('01  Persönliche Angaben', '01  Taxpayer details'))
    name = ' '.join(str(_raw(personal[k])) for k in ('first_name', 'last_name') if _raw(personal.get(k))) or personal.get('name')
    address = ', '.join(str(_raw(personal[k])) for k in ('address_street', 'address_zip', 'address_city') if _raw(personal.get(k))) or personal.get('address')
    table(
        [t('PROFIL', 'PROFILE'), t('ERFASSTER WERT', 'RECORDED VALUE')],
        [
            (t('Name', 'Name'), name),
            (t('Adresse', 'Address'), address),
            (t('Geburtsdatum', 'Date of birth'), _pick(personal, 'date_of_birth', 'birth_date')),
            (t('AHV-Nummer', 'AHV / AVS number'), _pick(personal, 'ahv_number', 'vn')),
            (t('Zivilstand', 'Marital status'), _pick(personal, 'civil_status', 'marital_status')),
        ],
    )

    section(t('02  Gespeicherte Steuerschätzung', '02  Saved tax estimate'))
    wealth_tax = result('wealth_tax')
    if wealth_tax is None:
        parts = [_number(result(k)) for k in ('wealth_tax_canton', 'wealth_tax_municipal')]
        if all(v is not None for v in parts):
            wealth_tax = sum(parts)
    table(
        [t('KOMPONENTE', 'COMPONENT'), t('GESCHÄTZTER BETRAG', 'ESTIMATED AMOUNT')],
        [
            (t('Steuerbares Einkommen', 'Taxable income'), _chf(result('taxable_income'), missing_lbl)),
            (t('Steuerbares Vermögen', 'Taxable wealth'), _chf(result('taxable_wealth'), missing_lbl)),
            (t('Direkte Bundessteuer', 'Federal income tax'), _chf(result('federal_income_tax'), missing_lbl)),
            (t('Staatssteuer (Kanton)', 'Cantonal income tax'), _chf(result('cantonal_income_tax'), missing_lbl)),
            (t('Gemeindesteuer', 'Municipal income tax'), _chf(result('municipal_income_tax'), missing_lbl)),
            (t('Vermögenssteuer', 'Wealth tax'), _chf(wealth_tax, missing_lbl)),
            (t('Geschätzte Gesamtsteuer - gespeichertes Ergebnis', 'Total estimated tax - saved result'), _chf(result('total_tax', 'total_tax_due'), missing_lbl)),
        ],
        money_last=True,
    )
    story.append(Spacer(1, 10))
    story.append(
        p(
            t(
                f"Berechnungsdatum: {_text(getattr(calculation, 'calculated_at', None), missing_lbl)}. Regelversion: {_text(getattr(calculation, 'rule_version', None), missing_lbl)}. Nach Änderungen am Profil bitte neu berechnen.",
                f"Calculation date: {_text(getattr(calculation, 'calculated_at', None), missing_lbl)}. Rule version: {_text(getattr(calculation, 'rule_version', None), missing_lbl)}. Profile entries below may differ from the saved calculation if edited afterwards; recalculate after changes.",
            ),
            'small',
        )
    )

    story.append(PageBreak())
    story.append(p(t('Erfasste Finanzen', 'Your recorded finances'), 'title'))
    story.append(
        p(
            t(
                'Dies sind Ihre Profileinträge und keine verbindliche Anerkennung von Abzügen. Fehlende Beträge werden nicht stillschweigend auf null gesetzt.',
                'These are profile entries, not a determination of allowable deductions. Missing amounts are not assumed to be zero.',
            ),
            'small',
        )
    )
    section(t('03  Einkünfte', '03  Income'))
    table(
        [t('EINKOMMENSKATEGORIE', 'INCOME CATEGORY'), t('ERFASSTER BETRAG', 'RECORDED AMOUNT')],
        recorded(
            income,
            [
                (t('Erwerbseinkommen', 'Employment income'), ('employment_income', 'gross_salary', 'total_employment_income')),
                (t('Erwerbseinkommen Partner(in)', 'Spouse employment income'), ('employment_income_spouse',)),
                (t('Selbstständige Erwerbstätigkeit', 'Self-employment'), ('self_employment_income',)),
                (t('Renten / Pensionen', 'Pensions'), ('pension_income',)),
                (t('Mieterträge', 'Rental income'), ('rental_income',)),
                (t('Dividendenerträge', 'Dividends'), ('dividend_income',)),
                (t('Zinserträge', 'Interest'), ('interest_income',)),
                (t('Gemeldete Kapitalgewinne', 'Capital gains reported'), ('capital_gains',)),
                (t('Erhaltene Unterhaltsbeiträge', 'Alimony received'), ('alimony_received',)),
            ],
            'other_income',
            empty_msg=t('Keine Beträge erfasst', 'No amounts recorded'),
        ),
        money_last=True,
    )
    section(t('04  Erfasste Abzüge', '04  Deductions entered'))
    table(
        [t('ABZUGSKATEGORIE', 'DEDUCTION CATEGORY'), t('ERFASSTER BETRAG', 'RECORDED AMOUNT')],
        recorded(
            deductions,
            [
                (t('Übrige Berufskosten', 'Professional expenses'), ('professional_expenses',)),
                (t('Fahrkosten Arbeitsweg', 'Commuting'), ('travel_expenses',)),
                (t('Auswärtige Verpflegung', 'Meals'), ('meal_expenses',)),
                (t('Einkäufe / Beiträge Säule 2 (BVG)', 'Pillar 2 contributions'), ('pillar2_contributions',)),
                (t('Beiträge Säule 3a', 'Pillar 3a contributions'), ('pillar3a_contributions',)),
                (t('Krankenkassen- / Versicherungsprämien', 'Health insurance premiums'), ('health_insurance_premiums',)),
                (t('Krankheits- und Unfallkosten', 'Medical expenses'), ('medical_expenses',)),
                (t('Drittbetreuungskosten Kinder', 'Childcare'), ('childcare_expenses',)),
                (t('Gemeinnützige Spenden', 'Donations'), ('donations',)),
                (t('Schuldzinsen', 'Debt interest'), ('debt_interest',)),
                (t('Aus- und Weiterbildungskosten', 'Education'), ('education_expenses',)),
                (t('Geleistete Unterhaltsbeiträge', 'Alimony paid'), ('alimony_paid',)),
            ],
            'other_deductions',
            empty_msg=t('Keine Beträge erfasst', 'No amounts recorded'),
        ),
        money_last=True,
    )

    story.append(PageBreak())
    story.append(p(t('Vermögen & Schulden', 'Assets & liabilities'), 'title'))
    section(t('05  Erfasstes Vermögen', '05  Recorded assets'))
    labels_map = _ASSET_LABELS[locale]
    asset_rows = []
    for acc in wealth.get('bank_accounts', []) if isinstance(wealth.get('bank_accounts'), list) else []:
        if isinstance(acc, dict):
            lbl = ' / '.join(_text(acc[k], missing_lbl) for k in ('bank_name', 'iban') if acc.get(k)) or labels_map['bank_account']
            asset_rows.append((lbl, _chf(_pick(acc, 'balance_chf', 'balance'), missing_lbl)))

    sec_source = wealth.get('securities') or wealth.get('securities_positions') or []
    for s in sec_source if isinstance(sec_source, list) else []:
        if isinstance(s, dict):
            lbl = ' / '.join(_text(s[k], missing_lbl) for k in ('name', 'broker_name', 'isin') if s.get(k)) or labels_map['securities_account']
            asset_rows.append((lbl, _chf(_pick(s, 'value_chf', 'total_value_chf', 'value'), missing_lbl)))

    for key, name_keys, value_keys in [
        ('real_estate', ('address',), ('market_value', 'value')),
        ('vehicles', ('description',), ('value',)),
        ('other_assets', ('description',), ('value',)),
    ]:
        for item in wealth.get(key, []) if isinstance(wealth.get(key), list) else []:
            if isinstance(item, dict):
                label = ' / '.join(_text(item[k], missing_lbl) for k in name_keys if item.get(k)) or labels_map[key]
                asset_rows.append((label, _chf(_pick(item, *value_keys), missing_lbl)))

    for key in ('life_insurance_value', 'pillar2_capital', 'pillar3a_capital'):
        if wealth.get(key) is not None:
            asset_rows.append((labels_map[key], _chf(wealth[key], missing_lbl)))
    table(
        [t('VERMÖGENSWERT / KONTO', 'ASSET / ACCOUNT'), t('ERFASSTER WERT (CHF)', 'RECORDED CHF VALUE')],
        asset_rows or [(t('Kein Vermögen erfasst', 'No assets recorded'), missing_lbl)],
        money_last=True,
    )
    story.append(
        p(
            t(
                'Erfasste Vermögenswerte sind nicht automatisch vollständig steuerbar. Liegenschaften und Vorsorgeguthaben unterliegen den jeweiligen Bewertungsregeln; massgeblich ist die gespeicherte Berechnung.',
                'Asset entries are not automatically taxable. Property values and pension capital require their applicable tax treatment; refer to the saved calculation.',
            ),
            'small',
        )
    )

    section(t('06  Schulden', '06  Debts'))
    debt_rows = []
    for key in ('mortgages', 'loans'):
        for item in liabilities.get(key, []) if isinstance(liabilities.get(key), list) else []:
            if isinstance(item, dict):
                debt_rows.append((_text(item.get('lender'), missing_lbl), _chf(item.get('outstanding_balance'), missing_lbl)))
    if liabilities.get('other_liabilities') is not None:
        debt_rows.append((t('Übrige Schulden', 'Other liabilities'), _chf(liabilities['other_liabilities'], missing_lbl)))
    table(
        [t('GLÄUBIGER / VERBINDLICHKEIT', 'LENDER / LIABILITY'), t('ERFASSTER SALDO', 'RECORDED BALANCE')],
        debt_rows or [(t('Keine Schulden erfasst', 'No debts recorded'), missing_lbl)],
        money_last=True,
    )

    submission_portals = {
        'ZH': ('eTax.zh / zhservices.ch', 'Kantonales Steueramt Zürich / Gemeindesteueramt'),
        'BE': ('TaxMe-Online via BE-Login (taxme.ch)', 'Steuerverwaltung des Kantons Bern'),
        'ZG': ('eTax.zug (zg.ch/steuerverwaltung)', 'Kantonale Steuerverwaltung Zug'),
        'BS': ('BalTax / eTax Basel-Stadt (steuerverwaltung.bs.ch)', 'Steuerverwaltung Basel-Stadt'),
        'AG': ('SmartTax / EasyTax (ag.ch/steuern)', 'Kantonales Steueramt Aargau'),
        'SG': ('eTax.sg (sg.ch/steuern)', 'Kantonales Steueramt St. Gallen'),
        'SZ': ('eTax.sz (sz.ch/steuern)', 'Kantonales Steueramt Schwyz'),
    }
    default_portal = (t('Offizielles kantonales Steuerportal', 'Official Cantonal Tax Portal'), f'Kantonale Steuerverwaltung {canton}')
    portal_info = submission_portals.get(canton, default_portal)

    section(t('07  Einreichungshinweise: Selbstdeklaration (Art. 110 DBG)', '07  Filing Information: Self-Declaration (Art. 110 DBG)'))
    story.append(
        p(
            t(
                f'Rechtliche Grundlage: Selbstdeklaration gemäss Art. 110 DBG (Bundesgesetz über die direkte Bundessteuer). '
                f'Dieses Dokument ist eine unverbindliche Zusammenfassung und Berechnungshilfe zur Vorbereitung Ihrer Steuererklärung und stellt keine amtliche Steuerveranlagung dar. '
                f'Die steuerpflichtige Person reicht die Steuererklärung eigenverantwortlich über das offizielle Portal des Kantons {canton} ein ({portal_info[0]}) '
                f'oder unterzeichnet die offizielle Druckfassung zur postalischen Zustellung an: {portal_info[1]}. '
                f'Die verbindliche Veranlagung und Festsetzung der Steuerfaktoren erfolgt ausschliesslich durch die zuständige kantonale Steuerbehörde.',
                f'Legal basis: Self-declaration pursuant to Art. 110 DBG (Swiss Federal Act on Direct Federal Taxation). '
                f'This document is a non-binding summary and preparation aid for your tax return and does not constitute an official tax assessment. '
                f'The taxpayer is solely responsible for filing via the official portal of Canton {canton} ({portal_info[0]}) '
                f'or signing the official declaration for postal submission to: {portal_info[1]}. '
                f'Binding tax assessment and final tax factor determination rest exclusively with the competent cantonal tax authority.',
            )
        )
    )
    story.append(Spacer(1, 8))

    sig_data = [
        [
            p(t('Ort, Datum:\n\n__________________________________', 'Place, Date:\n\n__________________________________'), 'small'),
            p(t('Unterschrift Steuerpflichtige(r) gemäss Art. 110 DBG:\n\n__________________________________', 'Signature of Taxpayer pursuant to Art. 110 DBG:\n\n__________________________________'), 'small'),
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
    story.append(
        p(
            t(
                'Erforderliche Belege (Lohnausweis, Säule 3a, Bankauszüge) sind der Steuererklärung beizulegen.',
                'Requisite supporting documents (salary certificate, Pillar 3a, bank statements) must accompany this declaration.',
            ),
            'small',
        )
    )
    breakdown = getattr(calculation, 'breakdown', None) or results.get('breakdown') or details.get('breakdown') or []
    if isinstance(breakdown, list) and breakdown:
        story.append(PageBreak())
        story.append(p(t('Berechnungsdetails', 'Calculation details'), 'title'))
        story.append(
            p(
                t(
                    'Alle nachstehenden Positionen stammen direkt aus der gespeicherten Berechnung. Die Regelreferenzen werden von der Berechnungs-Engine geliefert.',
                    'All line items below are reproduced from the saved calculation. Rule references are supplied by the calculation engine.',
                ),
                'small',
            )
        )
        story.append(Spacer(1, 12))
        table(
            [t('POSITION', 'LINE ITEM'), t('BETRAG', 'AMOUNT'), t('REGELREFERENZ', 'RULE REFERENCE')],
            [
                (item.get('label'), _chf(item.get('amount'), missing_lbl), item.get('rule_reference') or item.get('rule_key'))
                for item in breakdown if isinstance(item, dict)
            ],
            (0.48, 0.22, 0.30),
        )

    header_badge = t('STEUERERKLÄRUNG ZUSAMMENFASSUNG (ENTWURF)', 'TAX RETURN SUMMARY (DRAFT)')
    ref_label = t('Referenz', 'Reference')
    page_label = t('Seite', 'Page')

    def page_frame(canvas, document):
        canvas.saveState()
        canvas.setFillColor(ink)
        canvas.setFont('Helvetica-Bold', 12)
        canvas.drawString(42, A4[1] - 35, brand_name)
        canvas.setFont('Helvetica', 8)
        canvas.drawRightString(A4[0] - 42, A4[1] - 35, f'{canton} / {year}  |  {header_badge}')
        canvas.setStrokeColor(colors.HexColor('#cad7cf'))
        canvas.line(42, 40, A4[0] - 42, 40)
        canvas.setFillColor(muted)
        canvas.setFont('Helvetica', 7)
        canvas.drawString(42, 28, f'{ref_label}: {reference[:36]}')
        canvas.drawRightString(A4[0] - 42, 28, f'{datetime.now(timezone.utc):%Y-%m-%d} UTC  |  {page_label} {document.page}')
        canvas.restoreState()

    doc.build(story, onFirstPage=page_frame, onLaterPages=page_frame)
    return output.getvalue()
