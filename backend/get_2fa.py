#!/usr/bin/env python3
import sys
import pyotp
import sqlite3

def get_code(email_or_secret=None):
    if not email_or_secret:
        email = "demo@suntax.ch"
    else:
        email_or_secret = email_or_secret.strip()
        # If user directly passed a 32-character Base32 secret key from the screen:
        if len(email_or_secret) >= 16 and " " not in email_or_secret and "@" not in email_or_secret:
            totp = pyotp.TOTP(email_or_secret)
            print("\n" + "=" * 45)
            print(f"👉 2FA CODE FOR KEY: {totp.now()}")
            print("=" * 45 + "\n")
            return
        email = email_or_secret

    conn = sqlite3.connect("suntax_dev.db")
    cur = conn.cursor()
    cur.execute("SELECT totp_secret FROM users WHERE email = ?", (email,))
    row = cur.fetchone()
    conn.close()
    
    if not row or not row[0]:
        print(f"\n❌ No 2FA secret found in DB for '{email}'.")
        print("💡 Tip: You can also pass the Secret Key directly from screen:")
        print("   .venv/bin/python get_2fa.py <COPIED_SECRET_KEY>\n")
        return
        
    secret = row[0]
    totp = pyotp.TOTP(secret)
    print("\n" + "=" * 45)
    print(f"👉 2FA CODE FOR {email}: {totp.now()}")
    print("=" * 45 + "\n")

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else None
    get_code(arg)
