# SunTax Backup, Disaster Recovery & Data Retention Policy

> **Classification:** Internal Engineering & Operational Documentation  
> **Compliance Standard:** Swiss revised Data Protection Act (nDSG / FDPIC / EDÖB)  
> **Encryption Standard:** AES-256-GCM (AEAD) with Dedicated Key Management  
> **Target Production Residency:** Switzerland (AWS Zürich `eu-central-2` / Exoscale / Infomaniak)

---

## 1. Executive Summary & Security Objectives

SunTax processes confidential personal tax declarations and financial records for Swiss taxpayers. Pursuant to the Swiss revised Federal Act on Data Protection (nDSG) and FDPIC guidelines:

1. **Zero Plaintext Backups:** Unencrypted database snapshots or customer data dumps (JSON/SQL) are strictly forbidden from being stored on disk or downloaded over unauthenticated networks.
2. **Dedicated Key Separation:** Backup encryption keys (`BACKUP_ENCRYPTION_KEY`) must remain strictly isolated from database credentials, S3 bucket credentials, and web application secrets (`SECRET_KEY`).
3. **Full Document Persistence:** Document files and encrypted payloads stored in `document_blobs` must be fully incorporated into every backup package to guarantee zero data loss upon container reboot or hardware reallocation.
4. **Isolated Verification Only:** Automated or manual database restores must target isolated test databases only (`--confirm-isolated-database`). Direct restores into active production or staging environments are strictly prevented by code-level safety guards.
5. **Statutory Retention & Erasure:** Inactive accounts are flagged after 700 days and permanently erased after 730 days (2 years), purging relational rows, document files, and database blobs.

---

## 2. Backup Architecture & Encryption Design

```
+-----------------------------------------------------------------------------------+
|                            SunTax Backup Engine                                   |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  | Relational Tables  |   |  DocumentBlob Payloads|   | Manifest & Checksum    |  |
|  | Users, Returns,    |   |  KMS-Encrypted Tax    |   | Record counts, SHA256  |  |
|  | Profiles, Calcs    |   |  Receipts & Slips     |   | timestamp, environment |  |
|  +---------+----------+   +-----------+-----------+   +-----------+------------+  |
|            |                          |                           |               |
|            +--------------------------+---------------------------+               |
|                                       |                                           |
|                                       v                                           |
|                     Structured JSON Backup Package                                |
|                                       |                                           |
|                                       v                                           |
|                     AES-256-GCM Encryption Engine                                 |
|                   (Dedicated BACKUP_ENCRYPTION_KEY)                               |
|                                       |                                           |
|                                       v                                           |
|         Encrypted Archive: SUNTAX_ENC_V1 + 12-byte Nonce + Ciphertext + Tag       |
|                                       |                                           |
|                                       v                                           |
|         Stored in `backups/suntax_backup_{env}_{timestamp}.enc.suntax`            |
+-----------------------------------------------------------------------------------+
```

### 2.1 Encryption Specifications
- **Algorithm:** AES-256-GCM (Authenticated Encryption with Associated Data).
- **Associated Data:** `SunTax-SecureBackup-v1`.
- **Envelope Header:** `SUNTAX_ENC_V1` (13-byte magic identifier).
- **Nonce:** Cryptographically secure 12-byte random IV (`os.urandom(12)`) per archive.
- **Integrity Tag:** 16-byte Poly1305 authentication tag appended to ciphertext.
- **Manifest:** Contains SHA-256 digest of plaintext tables JSON for post-decryption verification.

---

## 3. Operational Backup Procedures

### 3.1 On-Demand CLI Backup
To create a complete encrypted backup archive of the active database and all document blobs:

```bash
cd backend
python scripts/secure_backup.py --retention-days 30
```

**Output:**
```text
============================================================
SunTax Secure Encrypted Backup
Environment : staging
Retention   : 30 days
============================================================
Backup created successfully:
  File: suntax_backup_staging_20261121_163000.enc.suntax
  Path: /path/to/suntax/backend/backups/suntax_backup_staging_20261121_163000.enc.suntax
  Size: 421890 bytes
  Counts: {'users': 15, 'tax_returns': 18, 'tax_profiles': 18, 'tax_calculations': 18, 'documents': 42, 'document_blobs': 42, 'waitlist': 3, 'audit_logs': 110}
============================================================
```

### 3.2 Authenticated Admin API Endpoint
Administrators can trigger a backup via the authenticated REST endpoint:
- **Route:** `POST /api/v1/admin/database/encrypted-backup`
- **Security:** Requires `is_admin=True` JWT token.
- **Audit:** Automatically logs the operator email, timestamp, and generated archive hash in the audit log.

### 3.3 Automated Pruning Policy
Every backup invocation executes `purge_expired_backups(retention_days=30)`. Any archive file exceeding the retention threshold is unlinked from storage.

---

## 4. Disaster Recovery & Restoration Runbook

### 4.1 Safety Rule: Isolated Verification Only
The restoration engine strictly prohibits restoring backups directly over active production or staging databases. Attempting to pass the production `DATABASE_URL` will throw a code-level exception:
`RESTORE BLOCKED: Direct restore into active production or staging database is strictly prohibited.`

### 4.2 Standard Restoration Workflow
To verify or restore customer records during disaster recovery:

1. **Spin up an isolated test database** (e.g., PostgreSQL container or SQLite test instance):
   ```bash
   TARGET_URL="sqlite+aiosqlite:///tmp/isolated_recovery_test.db"
   ```
2. **Execute the restoration script with explicit confirmation:**
   ```bash
   python scripts/restore_backup.py \
       backups/suntax_backup_staging_20261121_163000.enc.suntax \
       --target-db-url "$TARGET_URL" \
       --confirm-isolated-database \
       --rehydrate-storage-dir /tmp/recovered_storage
   ```
3. **Verify Restored Records and Document Decryption:**
   - Database tables are automatically recreated and populated.
   - Document blobs are loaded into `DocumentBlob`.
   - The test script verifies that document payloads decrypt with KMS:
     ```python
     from app.services.envelope_encryption import envelope_service
     payload = envelope_service.decrypt_document(recovered_blob_payload)
     assert payload.startswith(b"%PDF")
     ```

---

## 5. External Production Blockers & Gap Analysis

The current deployment is operating in **staging mode** on Render (Frankfurt `eu-central-1`) and Vercel (Global CDN). The following external infrastructure dependencies must be resolved prior to official Swiss production certification:

| Gap / Dependency | Current Staging Status | Required Production Resolution |
| :--- | :--- | :--- |
| **Swiss Cloud Hosting** | Frankfurt, Germany (`eu-central-1`) | Migrate backend and database to AWS Zürich (`eu-central-2`) or Swiss-hosted cloud (Exoscale / Infomaniak). |
| **Encrypted Persistent Storage** | PostgreSQL `DocumentBlob` table | Configure dedicated S3 bucket in Swiss data center with KMS server-side encryption (`STORAGE_REGION=eu-central-2`). |
| **Backup Storage Bucket** | Local `/backups` directory | Implement automated daily export to write-once-read-many (WORM) Swiss backup bucket with 30-day lifecycle retention. |
| **Payrexx Merchant Account** | Sandbox / Simulator mode | Provision live Payrexx merchant account with Swiss payment methods (TWINT, PostFinance, Visa, Mastercard). |
| **Canton Zürich Certification** | Dossier PDF / Postal Filing | Complete eCH-0119 gateway certification with Canton Zürich tax authorities for automated XML submission. |
| **Official Domain & DNS** | `frontend-ruby-gamma-46.vercel.app` | Point official Swiss domain (`suntax.ch`) with CAA records and DNSSEC. |
| **Legal Agreements** | Placeholders in `brand_config.json` | Finalize terms of service, imprint, and nDSG data protection declaration with Swiss legal counsel. |
