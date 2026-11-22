import asyncio
import asyncpg
import json
import sys

DATABASE_URL = 'postgresql://suntax_db_test_user:BlOhHQ0Fz8PmWvcL1Mk80Rhq5Rw264Kl@dpg-dbsb5v2fngtc73c89hn0-a.frankfurt-postgres.render.com/suntax_db_test'
USER_ID = '54f8f30a-ec2e-404f-9709-8737ca94a2d9'
RETURN_ID = '4bf51a1d-31dd-442c-883c-243b18119278'

def parse_json_field(val):
    if val is None:
        return {}
    if isinstance(val, str):
        try:
            return json.loads(val)
        except Exception:
            return {}
    return dict(val)

async def verify():
    conn = await asyncpg.connect(DATABASE_URL, ssl='require')
    await conn.execute(f"SET app.current_user_id = '{USER_ID}';")

    # 1. User
    u = await conn.fetchrow("SELECT id, email, is_verified, totp_enabled FROM users WHERE id = $1;", USER_ID)
    print("DB_USER:" + json.dumps({k: str(v) if v is not None else None for k, v in dict(u).items()} if u else {}))

    # 2. Tax Return
    tr = await conn.fetchrow("""
        SELECT id, canton_code, tax_year, status, payment_status, payment_amount, paid_at,
               transmission_status, confirmed_at, updated_at
        FROM tax_returns WHERE id = $1;
    """, RETURN_ID)
    print("DB_TAX_RETURN:" + json.dumps({k: str(v) if v is not None else None for k, v in dict(tr).items()} if tr else {}))

    # 3. Documents
    docs = await conn.fetch("""
        SELECT id, original_filename, document_type, processing_status, classification_confidence
        FROM documents WHERE tax_return_id = $1 ORDER BY uploaded_at;
    """, RETURN_ID)
    print("DB_DOCUMENTS:" + json.dumps([{k: str(v) if v is not None else None for k, v in dict(d).items()} for d in docs]))

    # 4. Tax Profile
    tp = await conn.fetchrow("""
        SELECT id, personal_data, income_data, deductions_data, wealth_data, updated_at
        FROM tax_profiles WHERE tax_return_id = $1;
    """, RETURN_ID)
    if tp:
        pd = parse_json_field(tp['personal_data'])
        inc = parse_json_field(tp['income_data'])
        ded = parse_json_field(tp['deductions_data'])
        wlt = parse_json_field(tp['wealth_data'])
        tp_dict = {
            'id': str(tp['id']),
            'ahv_number': pd.get('ahv_number'),
            'first_name': pd.get('first_name'),
            'employment_income': inc.get('employment_income'),
            'pillar3a': ded.get('pillar3a_contributions'),
            'wealth': wlt.get('bank_accounts'),
            'updated_at': str(tp['updated_at'])
        }
    else:
        tp_dict = {}
    print("DB_TAX_PROFILE:" + json.dumps(tp_dict))

    # 5. Tax Calculation
    tc = await conn.fetchrow("""
        SELECT id, tax_rule_version, taxable_income, taxable_wealth, cantonal_income_tax,
               municipal_income_tax, federal_income_tax, wealth_tax, total_tax_due, created_at
        FROM tax_calculations WHERE tax_return_id = $1 ORDER BY created_at DESC LIMIT 1;
    """, RETURN_ID)
    print("DB_TAX_CALCULATION:" + json.dumps({k: str(v) if v is not None else None for k, v in dict(tc).items()} if tc else {}))

    # 6. Audit Logs
    logs = await conn.fetch("""
        SELECT action, user_id, created_at FROM audit_logs
        WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5;
    """, USER_ID)
    print("DB_AUDIT_LOGS:" + json.dumps([{k: str(v) for k, v in dict(l).items()} for l in logs]))

    await conn.close()

if __name__ == '__main__':
    asyncio.run(verify())
