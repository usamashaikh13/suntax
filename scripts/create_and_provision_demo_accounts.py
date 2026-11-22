import urllib.request
import json
import pyotp
import os
import secrets
import string
import time
from pathlib import Path

BASE_URL = "https://suntax-api.onrender.com/api/v1"
CREDENTIALS_FILE = Path("/Users/osamashaikh/.gemini/antigravity/scratch/suntax/docs/demo_accounts_credentials.staging.credentials")
BRAIN_CREDENTIALS_FILE = Path("/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/demo_accounts_credentials.staging.credentials")

def gen_strong_password(prefix=""):
    chars = string.ascii_letters + string.digits + "!@#%&*-_"
    core = ''.join(secrets.choice(chars) for _ in range(16))
    return f"{prefix}ZuriTax2025!{core}"

ACCOUNTS = [
    {
        "id_name": "Account A (Single Employee)",
        "email": "demo.single.a@suntax.ch",
        "full_name": "Max Muster",
        "password": gen_strong_password("Single_"),
        "persona": "Single employed taxpayer in Winterthur (ZH), tax year 2025",
        "canton_code": "ZH",
        "municipality_code": "230",
        "municipality_name": "Winterthur",
        "zip_code": "8400",
        "tax_year": 2025,
        "marital_status": "single",
    },
    {
        "id_name": "Account B (Family / Multi-Doc)",
        "email": "demo.family.b@suntax.ch",
        "full_name": "Thomas & Sarah Keller",
        "password": gen_strong_password("Family_"),
        "persona": "Married couple with 2 children in Zurich (ZH), tax year 2025",
        "canton_code": "ZH",
        "municipality_code": "261",
        "municipality_name": "Zürich",
        "zip_code": "8002",
        "tax_year": 2025,
        "marital_status": "married",
    }
]

def make_request(endpoint, method="GET", data=None, token=None):
    url = f"{BASE_URL}{endpoint}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(url, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as err:
        err_body = err.read().decode("utf-8")
        try:
            return err.code, json.loads(err_body)
        except Exception:
            return err.code, {"raw_error": err_body}

def provision_account(acc):
    print(f"\n=======================================================")
    print(f"Setting up: {acc['id_name']} <{acc['email']}>")
    print(f"=======================================================")

    # 1. Register
    reg_code, reg_resp = make_request("/auth/register", method="POST", data={
        "email": acc["email"],
        "password": acc["password"],
        "full_name": acc["full_name"],
    })
    print(f"Register status: {reg_code}")

    # 2. Login
    login_code, login_resp = make_request("/auth/login", method="POST", data={
        "email": acc["email"],
        "password": acc["password"],
    })

    access_token = None
    totp_secret = None

    if login_code == 200 and not login_resp.get("two_factor_required"):
        access_token = login_resp["access_token"]
        print("Initial direct login successful (2FA pending setup).")

        # 3. Setup 2FA
        setup_code, setup_resp = make_request("/auth/2fa/setup", method="POST", data={}, token=access_token)
        totp_secret = setup_resp["secret"]
        provisioning_uri = setup_resp["provisioning_uri"]
        print("Initiated 2FA setup.")

        # 4. Verify 2FA
        code = pyotp.TOTP(totp_secret).now()
        v_code, v_resp = make_request("/auth/2fa/verify", method="POST", data={"code": code}, token=access_token)
        print(f"2FA activated successfully: {v_code}")
    else:
        # If already registered with 2FA, we need login via 2FA
        print("Account already has 2FA or requires challenge:", login_resp)

    # 5. Create / Ensure Tax Return exists
    # Refresh login with 2FA to ensure token is fully authenticated
    l2_code, l2_resp = make_request("/auth/login", method="POST", data={
        "email": acc["email"],
        "password": acc["password"],
    })
    if l2_resp.get("two_factor_required"):
        temp_token = l2_resp["temp_token"]
        # In staging, test code '123456' works or real TOTP if secret known
        totp_code = pyotp.TOTP(totp_secret).now() if totp_secret else "123456"
        c_code, c_resp = make_request("/auth/login/2fa", method="POST", data={
            "temp_token": temp_token,
            "code": totp_code,
        })
        if c_code != 200:
            c_code, c_resp = make_request("/auth/login/2fa", method="POST", data={
                "temp_token": temp_token,
                "code": "123456",
            })
        access_token = c_resp["access_token"]
        print("Logged in with 2FA token.")

    # Check existing returns
    r_code, r_resp = make_request("/tax-returns", token=access_token)
    items = r_resp.get("items", []) if isinstance(r_resp, dict) else (r_resp if isinstance(r_resp, list) else [])

    tax_return_id = None
    if items:
        tax_return_id = items[0]["id"]
        print(f"Existing Tax Return found: {tax_return_id}")
    else:
        cr_code, cr_resp = make_request("/tax-returns", method="POST", data={
            "canton_code": acc["canton_code"],
            "municipality_code": acc["municipality_code"],
            "municipality_name": acc["municipality_name"],
            "tax_year": acc["tax_year"],
        }, token=access_token)
        tax_return_id = cr_resp["id"]
        print(f"Created new Tax Return: {tax_return_id}")

    # Set initial profile details
    init_profile = {
        "personal_data": {
            "first_name": acc["full_name"].split()[0],
            "last_name": acc["full_name"].split()[-1],
            "canton_code": acc["canton_code"],
            "address_zip": acc["zip_code"],
            "address_city": acc["municipality_name"],
            "marital_status": acc["marital_status"],
            "civil_status": acc["marital_status"],
        }
    }
    make_request(f"/tax-returns/{tax_return_id}/profile", method="PATCH", data=init_profile, token=access_token)

    return {
        "id_name": acc["id_name"],
        "email": acc["email"],
        "password": acc["password"],
        "totp_secret": totp_secret,
        "tax_return_id": tax_return_id,
        "access_token": access_token,
        "persona": acc["persona"],
    }

def main():
    results = []
    for acc in ACCOUNTS:
        res = provision_account(acc)
        results.append(res)

    CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
    BRAIN_CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)

    header = """# ==============================================================================
# SUNTAX STAGING DEMO CREDENTIALS — STRICTLY CONFIDENTIAL / STAGING ONLY
# DO NOT COMMIT THIS FILE TO GIT OR DISTRIBUTE OUTSIDE THE AUTHORIZED QA TEAM
# ==============================================================================
Generated At: 2026-11-22
Environment: Staging (Render Backend + Vercel Frontend)
Frontend URL: https://frontend-ruby-gamma-46.vercel.app
Backend API:  https://suntax-api.onrender.com/api/v1

"""
    content = header
    for r in results:
        totp_uri = f"otpauth://totp/SunTax:{r['email']}?secret={r['totp_secret']}&issuer=SunTax" if r['totp_secret'] else "N/A"
        content += f"""## {r['id_name']}
- Email:           {r['email']}
- Password:        {r['password']}
- 2FA Secret:      {r['totp_secret']}
- Provisioning URI:{totp_uri}
- Staging Bypass:  123456 (Available in staging environment only)
- Demo Return ID:  {r['tax_return_id']}
- Persona:         {r['persona']}

"""

    with open(CREDENTIALS_FILE, "w") as f:
        f.write(content)
    with open(BRAIN_CREDENTIALS_FILE, "w") as f:
        f.write(content)

    print(f"\n[OK] Secure staging credentials written to:")
    print(f"  - {CREDENTIALS_FILE}")
    print(f"  - {BRAIN_CREDENTIALS_FILE}")

if __name__ == "__main__":
    main()
