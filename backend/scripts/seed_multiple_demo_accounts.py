import asyncio
import os
import sys
import uuid
import yaml
import json
import urllib.request
from datetime import datetime, timezone
import asyncpg
import pyotp

sys.path.insert(0, '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/backend')
from app.core.security import hash_password

cli_yaml = os.path.expanduser('~/.render/cli.yaml')
with open(cli_yaml) as f:
    cfg = yaml.safe_load(f)
token = cfg['api']['key']

req = urllib.request.Request(
    'https://api.render.com/v1/postgres/dpg-dbsb5v2fngtc73c89hn0-a/connection-info',
    headers={'Authorization': f'Bearer {token}', 'Accept': 'application/json'}
)
with urllib.request.urlopen(req) as resp:
    db_info = json.loads(resp.read().decode())
conn_str = db_info['externalConnectionString']

DEMO_PASSWORD = "SunTax2026!Demo"
hashed_pw = hash_password(DEMO_PASSWORD)

ACCOUNTS = [
    {
        "email": "demo@suntax.ch",
        "full_name": "Hans Muster",
        "persona": "Standard Single Employee (Zürich)",
        "canton": "ZH",
        "municipality_code": "261",
        "municipality_name": "Zürich",
        "has_return": True,
        "profile": {
            "personal_data": {
                "first_name": "Hans",
                "last_name": "Muster",
                "name": "Hans Muster",
                "marital_status": "single",
                "civil_status": "ledig",
                "postal_code": "8001",
                "canton_code": "ZH",
                "confession": "none",
                "ahv_number": "756.1234.5678.97",
                "street": "Bahnhofstrasse 10",
                "city": "Zürich",
            },
            "income_data": {
                "gross_salary": 105000,
                "employment_income": 105000,
                "net_salary": 91200,
            },
            "wealth_data": {
                "bank_accounts": [
                    {
                        "bank_name": "Zürcher Kantonalbank",
                        "iban": "CH9300762011623852957",
                        "balance": 32000,
                    }
                ],
                "total_wealth": 32000,
            },
            "deductions_data": {
                "pillar3a_contributions": 7056,
                "travel_expenses": 2100,
                "meal_expenses": 3200,
                "other_work_expenses": 3150,
                "insurance_premiums": 2900,
            },
            "tax_questions": {
                "commuting_method": "public_transport",
                "home_office_days": 2,
                "canteen_available": True,
                "donations_made": True,
                "donation_amount": 500,
            }
        },
        "calculation": {
            "taxable_income": 86094.0,
            "taxable_wealth": 32000.0,
            "federal_income_tax": 912.0,
            "cantonal_income_tax": 4250.0,
            "municipal_income_tax": 5015.0,
            "wealth_tax": 22.0,
            "total_tax_due": 10199.0,
            "details": {
                "federal_tax": 912.0,
                "cantonal_tax": 4250.0,
                "municipal_tax": 5015.0,
                "wealth_tax": 22.0,
                "total_tax": 10199.0,
                "effective_tax_rate": 11.85,
            }
        }
    },
    {
        "email": "family@suntax.ch",
        "full_name": "Anna & Marco Keller",
        "persona": "Married Couple with 2 Children (Winterthur)",
        "canton": "ZH",
        "municipality_code": "230",
        "municipality_name": "Winterthur",
        "has_return": True,
        "profile": {
            "personal_data": {
                "first_name": "Marco",
                "last_name": "Keller",
                "partner_first_name": "Anna",
                "partner_last_name": "Keller",
                "marital_status": "married",
                "civil_status": "verheiratet",
                "children_count": 2,
                "children": [
                    {"name": "Leo Keller", "birth_year": 2018},
                    {"name": "Mia Keller", "birth_year": 2021}
                ],
                "postal_code": "8400",
                "canton_code": "ZH",
                "confession": "none",
                "ahv_number": "756.9876.5432.10",
                "street": "Stadthausstrasse 42",
                "city": "Winterthur",
            },
            "income_data": {
                "gross_salary": 96000,
                "spouse_gross_salary": 58000,
                "total_gross_income": 154000,
                "net_salary": 133500,
            },
            "wealth_data": {
                "bank_accounts": [
                    {"bank_name": "UBS Switzerland", "balance": 48000},
                    {"bank_name": "Raiffeisen", "balance": 15000}
                ],
                "total_wealth": 63000,
            },
            "deductions_data": {
                "child_deductions": 18000,
                "childcare_costs": 12000,
                "pillar3a_contributions": 14112,
                "married_double_earner_deduction": 5900,
                "insurance_premiums": 5800,
                "work_expenses": 6000,
            },
            "tax_questions": {
                "has_children": True,
                "childcare_external": True,
                "both_parents_working": True,
                "pillar3a_both": True,
            }
        },
        "calculation": {
            "taxable_income": 92188.0,
            "taxable_wealth": 63000.0,
            "federal_income_tax": 480.0,
            "cantonal_income_tax": 3650.0,
            "municipal_income_tax": 4453.0,
            "wealth_tax": 35.0,
            "total_tax_due": 8618.0,
            "details": {
                "federal_tax": 480.0,
                "cantonal_tax": 3650.0,
                "municipal_tax": 4453.0,
                "wealth_tax": 35.0,
                "total_tax": 8618.0,
                "effective_tax_rate": 9.35,
            }
        }
    },
    {
        "email": "investor@suntax.ch",
        "full_name": "Beat Meier",
        "persona": "Investor & High Earner (Zug)",
        "canton": "ZG",
        "municipality_code": "1711",
        "municipality_name": "Zug",
        "has_return": True,
        "profile": {
            "personal_data": {
                "first_name": "Beat",
                "last_name": "Meier",
                "marital_status": "single",
                "civil_status": "ledig",
                "postal_code": "6300",
                "canton_code": "ZG",
                "confession": "none",
                "ahv_number": "756.3344.5566.77",
                "street": "Chamerstrasse 18",
                "city": "Zug",
            },
            "income_data": {
                "gross_salary": 185000,
                "dividends_and_interest": 14200,
                "employment_income": 185000,
                "net_salary": 161000,
            },
            "wealth_data": {
                "bank_accounts": [
                    {"bank_name": "Credit Suisse / UBS", "balance": 115000}
                ],
                "securities": [
                    {"description": "Swiss SMI Equity Portfolio", "value": 320000, "tax_value": 320000, "gross_yield": 9600},
                    {"description": "Global Bond ETF", "value": 150000, "tax_value": 150000, "gross_yield": 4600}
                ],
                "total_wealth": 585000,
            },
            "deductions_data": {
                "pillar3a_contributions": 7056,
                "asset_management_fees": 1200,
                "work_expenses": 3000,
                "insurance_premiums": 2900,
            },
            "tax_questions": {
                "has_securities": True,
                "reclaims_withholding_tax": True,
                "owns_cryptocurrency": False,
            }
        },
        "calculation": {
            "taxable_income": 185044.0,
            "taxable_wealth": 585000.0,
            "federal_income_tax": 8450.0,
            "cantonal_income_tax": 5820.0,
            "municipal_income_tax": 3492.0,
            "wealth_tax": 420.0,
            "total_tax_due": 18182.0,
            "details": {
                "federal_tax": 8450.0,
                "cantonal_tax": 5820.0,
                "municipal_tax": 3492.0,
                "wealth_tax": 420.0,
                "total_tax": 18182.0,
                "effective_tax_rate": 9.83,
            }
        }
    },
    {
        "email": "starter@suntax.ch",
        "full_name": "Sophie Weber",
        "persona": "Fresh / Clean Onboarding (Bern)",
        "canton": "BE",
        "municipality_code": "351",
        "municipality_name": "Bern",
        "has_return": False,
    }
]

async def seed():
    conn = await asyncpg.connect(conn_str, ssl='require')
    await conn.execute("SELECT set_config('app.is_admin', 'true', false);")
    now = datetime.now(timezone.utc)

    print("=== SEEDING MULTIPLE DEMO ACCOUNTS INTO SUNTAX-DB-TEST ===")

    for acc in ACCOUNTS:
        email = acc["email"]
        full_name = acc["full_name"]
        totp_secret = pyotp.random_base32()

        # Check existing user
        row = await conn.fetchrow("SELECT id FROM users WHERE email = $1", email)
        if row:
            user_id = row["id"]
            await conn.execute("""
                UPDATE users SET
                    hashed_password = $1,
                    full_name = $2,
                    is_verified = true,
                    is_active = true,
                    totp_secret = $3,
                    totp_enabled = true,
                    failed_login_attempts = 0,
                    locked_until = NULL,
                    updated_at = $4
                WHERE id = $5
            """, hashed_pw, full_name, totp_secret, now, user_id)
            print(f"✅ Updated user: {email} ({full_name}) -> ID: {user_id}")
        else:
            user_id = uuid.uuid4()
            await conn.execute("""
                INSERT INTO users (
                    id, email, hashed_password, full_name, is_verified, is_active,
                    is_admin, totp_secret, totp_enabled, failed_login_attempts,
                    terms_accepted_at, privacy_accepted_at, created_at, updated_at
                ) VALUES ($1, $2, $3, $4, true, true, false, $5, true, 0, $6, $6, $6, $6)
            """, user_id, email, hashed_pw, full_name, totp_secret, now)
            print(f"✨ Created user: {email} ({full_name}) -> ID: {user_id}")

        if acc.get("has_return"):
            # Check existing return
            tr_row = await conn.fetchrow("SELECT id FROM tax_returns WHERE user_id = $1", user_id)
            if not tr_row:
                tr_id = uuid.uuid4()
                await conn.execute("""
                    INSERT INTO tax_returns (
                        id, user_id, canton_code, municipality_code, municipality_name,
                        tax_year, status, payment_status, payment_amount, created_at, updated_at
                    ) VALUES ($1, $2, $3, $4, $5, 2025, 'draft', 'pending', 39.0, $6, $6)
                """, tr_id, user_id, acc["canton"], acc["municipality_code"], acc["municipality_name"], now)
                print(f"   Created return for {acc['canton']} / {acc['municipality_name']}: {tr_id}")
            else:
                tr_id = tr_row["id"]
                await conn.execute("""
                    UPDATE tax_returns SET
                        canton_code = $1, municipality_code = $2, municipality_name = $3, updated_at = $4
                    WHERE id = $5
                """, acc["canton"], acc["municipality_code"], acc["municipality_name"], now, tr_id)
                print(f"   Updated existing return: {tr_id}")

            # Profile
            prof = acc.get("profile", {})
            raw_q = prof.get("tax_questions", [])
            if isinstance(raw_q, dict):
                questions_list = [
                    {
                        "id": str(k),
                        "category": "personal",
                        "question": str(k).replace("_", " ").capitalize(),
                        "answer": str(v) if v is not None else None,
                        "is_answered": v is not None,
                        "is_required": False
                    }
                    for k, v in raw_q.items()
                ]
            elif isinstance(raw_q, list):
                questions_list = raw_q
            else:
                questions_list = []

            prof_row = await conn.fetchrow("SELECT id FROM tax_profiles WHERE tax_return_id = $1", tr_id)
            if not prof_row:
                prof_id = uuid.uuid4()
                await conn.execute("""
                    INSERT INTO tax_profiles (
                        id, tax_return_id, personal_data, income_data, wealth_data,
                        deductions_data, tax_questions, completeness_score, created_at, updated_at
                    ) VALUES ($1, $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, 90, $8, $8)
                """, prof_id, tr_id, json.dumps(prof.get("personal_data", {})),
                    json.dumps(prof.get("income_data", {})), json.dumps(prof.get("wealth_data", {})),
                    json.dumps(prof.get("deductions_data", {})), json.dumps(questions_list), now)
                print(f"   Created tax profile: {prof_id}")
            else:
                await conn.execute("""
                    UPDATE tax_profiles SET
                        personal_data = $1::jsonb, income_data = $2::jsonb, wealth_data = $3::jsonb,
                        deductions_data = $4::jsonb, tax_questions = $5::jsonb, updated_at = $6
                    WHERE tax_return_id = $7
                """, json.dumps(prof.get("personal_data", {})), json.dumps(prof.get("income_data", {})),
                    json.dumps(prof.get("wealth_data", {})), json.dumps(prof.get("deductions_data", {})),
                    json.dumps(questions_list), now, tr_id)
                print(f"   Updated tax profile for return {tr_id}")

            # Calculation
            calc = acc.get("calculation", {})
            calc_details = json.dumps(calc["details"])
            calc_inputs = json.dumps({"taxable_income": calc["taxable_income"], "taxable_wealth": calc["taxable_wealth"]})
            calc_results = json.dumps({"total_tax": calc["total_tax_due"]})
            calc_breakdown = json.dumps(calc["details"])

            calc_row = await conn.fetchrow("SELECT id FROM tax_calculations WHERE tax_return_id = $1", tr_id)
            if not calc_row:
                calc_id = uuid.uuid4()
                await conn.execute("""
                    INSERT INTO tax_calculations (
                        id, tax_return_id, version, status, is_final, rule_version, tax_rule_version,
                        taxable_income, taxable_wealth, federal_income_tax,
                        cantonal_income_tax, municipal_income_tax, wealth_tax,
                        total_tax_due, calculation_details, inputs, results, breakdown,
                        calculated_at, created_at
                    ) VALUES ($1, $2, 1, 'completed', false, '2025.1', '2025.1', $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14, $14)
                """, calc_id, tr_id, calc["taxable_income"], calc["taxable_wealth"],
                    calc["federal_income_tax"], calc["cantonal_income_tax"], calc["municipal_income_tax"],
                    calc["wealth_tax"], calc["total_tax_due"], calc_details, calc_inputs, calc_results, calc_breakdown, now)
                print(f"   Created calculation snapshot: Total tax CHF {calc['total_tax_due']}")
            else:
                await conn.execute("""
                    UPDATE tax_calculations SET
                        taxable_income = $1, taxable_wealth = $2, federal_income_tax = $3,
                        cantonal_income_tax = $4, municipal_income_tax = $5, wealth_tax = $6,
                        total_tax_due = $7, calculation_details = $8::jsonb,
                        inputs = $9::jsonb, results = $10::jsonb, breakdown = $11::jsonb,
                        tax_rule_version = '2025.1', calculated_at = $12
                    WHERE tax_return_id = $13
                """, calc["taxable_income"], calc["taxable_wealth"], calc["federal_income_tax"],
                    calc["cantonal_income_tax"], calc["municipal_income_tax"], calc["wealth_tax"],
                    calc["total_tax_due"], calc_details, calc_inputs, calc_results, calc_breakdown, now, tr_id)
                print(f"   Updated calculation snapshot: Total tax CHF {calc['total_tax_due']}")

    await conn.close()
    print("=== SEEDING FINISHED SUCCESSFULLY ===")

if __name__ == '__main__':
    asyncio.run(seed())
