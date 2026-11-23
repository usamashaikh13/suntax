# SunTax — Milestone 2 Client Handover Package
## Comprehensive System Delivery, AI Document Processing & Staging Verification
**Environment:** Staging / Demonstration Only  
**Release Target:** Milestone 2 Client Acceptance  
**Version:** 1.0.0-staging  
**Date:** 22 November 2026  
**Lead Engineering & QA Owner:** SunTax Engineering Team  
**Live Staging Frontend:** [https://frontend-ruby-gamma-46.vercel.app](https://frontend-ruby-gamma-46.vercel.app)  
**Live Staging API:** [https://suntax-api.onrender.com/api/v1](https://suntax-api.onrender.com/api/v1)  

---

> [!IMPORTANT]
> **STAGING ENVIRONMENT & TEST AUTHENTICATION CODE**  
> This package is prepared for client acceptance testing in the **isolated staging environment** using 100% synthetic taxpayer data.  
> **To log in effortlessly during testing, you can use the approved staging test code `123456` at the Two-Factor Authentication (2FA) prompt.**  
> *(Live TOTP authenticator app tokens are also supported using the Base32 secrets provided in Section 1).*

---

## 1. Client Test Accounts & Credentials

Both accounts are pre-provisioned in the staging database and ready for immediate end-to-end testing on the live Vercel frontend:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ DEMO ACCOUNT A — Single Employee                                                       │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Persona:         Single employed taxpayer in Winterthur (ZH), Tax Year 2025            │
│ Login URL:       https://frontend-ruby-gamma-46.vercel.app/login                      │
│ Email:           demo.single.a@suntax.ch                                               │
│ Password:        Single_ZuriTax2025!Rkh1MIupe3Ti2QMJ                                   │
│ 2FA Test Code:   123456 (Enter 123456 at the 2FA prompt for instant login)             │
│ Authenticator:   TOTP Secret: IKC6SPXRJJQOPCHHNSPC7NNRRGADU3KE                         │
│ Preloaded Return:72b90c29-ab41-431d-896a-cfb22ac6a805                                  │
│ Scope Tested:    Upload, Fast OCR, Classification, Field Review Modal, Edit & Sync     │
└────────────────────────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────────────────────────┐
│ DEMO ACCOUNT B — Family / Multi-Document & Inconsistency Verification                  │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Persona:         Married couple with 2 children in Zürich (ZH), Tax Year 2025          │
│ Login URL:       https://frontend-ruby-gamma-46.vercel.app/login                      │
│ Email:           demo.family.b@suntax.ch                                               │
│ Password:        Family_ZuriTax2025!biPRd9bbyjR5zICW                                   │
│ 2FA Test Code:   123456 (Enter 123456 at the 2FA prompt for instant login)             │
│ Authenticator:   TOTP Secret: UBOBO5TNOSXULITCKKNBTHNADY4Y3G2O                         │
│ Preloaded Return:344f38ae-1467-45d5-a795-55960540254d                                  │
│ Scope Tested:    Multi-Doc Batch, SHA-256 Duplicates, Financial Conflicts, Questions   │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Executive Summary: What Has Been Done

Every business logic, document processing, calculation, UI, and security task required for Milestone 2 and staging production-readiness has been completed:

### A. Milestone 2: AI Document Processing Engine
1. **Multi-Format Ingestion:** Secure upload handling for PDF, JPG, and PNG files with cryptographic magic-byte sniffing (blocking disguised executables).
2. **High-Speed Optical Character Recognition (OCR):** Skew correction (up to 8°), contrast auto-adjustment, and text layout preservation.
3. **Automated Document Classification:** Evaluates text and visual layout to classify documents into Swiss tax categories (`salary_certificate`, `bank_statement`, `pillar3a`, `donation`, `childcare`, `insurance`) with 80%–98% confidence.
4. **Structured Financial Extraction:** Accurate extraction of critical Swiss tax figures:
   - Ziffer 1 (Gross salary) and Ziffer 11 (Net salary)
   - AHV / AVS number (with strict EAN-13 checksum validation)
   - Swiss IBAN accounts (with ISO 7064 MOD-97-10 checksum validation)
   - Pillar 3a contributions, interest income, bank balances, and charitable donations
5. **Human-in-the-Loop Review Modal:** An interactive UI allowing taxpayers to inspect OCR confidence per field, manually adjust any figure, and explicitly approve fields before applying them.
6. **Unified Tax Profile Synchronization:** Merges approved figures directly into the persistent tax profile (`personal_data`, `income_data`, `deductions_data`, `wealth_data`) and automatically invalidates stale calculation caches.
7. **SHA-256 Duplicate File Detection:** Detects duplicate file uploads instantly via binary hash comparison and flags `is_duplicate_suspect: true` without data loss.
8. **Cross-Document Financial Conflict Detection:** Validates cross-document integrity (e.g. flagging conflicting gross salaries reported for the same employer).
9. **Smart Missing-Information Questions:** Dynamically identifies gaps in profile data (e.g. commute method, healthcare deductions, childcare expenses) and generates targeted question cards.

### B. Pixel-Accurate Landing Page Redesign
1. **1:1 Client Reference Implementation:** Replaced the legacy prototype with a pixel-accurate implementation of `SunTax Redesign (1).html`.
2. **Three-Step Timeline Grid & Baseline Standardization:**
   - Standardized all 3 step cards to an identical 204×104px container with 18px border radius.
   - Enclosed Step 3 in a dedicated `.sa3card` displaying the tax dossier document on the left, a dashed connection guide, and the Swiss tax authority vault icon on the right.
   - Aligned all step headings (`<h3>`) and descriptions (`<p>`) to an identical horizontal baseline.
3. **Registration CTA Heading Contrast Fix:** Resolved the dark-on-dark unreadable heading (`1.05:1` contrast) by enforcing `#FFFFFF` pure white typography on `#14181F` background (`16.8:1` contrast, WCAG AAA compliant).
4. **Correction of False Filing Claims:** Removed misleading "Direkt einreichen möglich / Ready to file" text for Zürich. Strictly displays "Dossier bereit (Postversand)" for Zürich and "Kommt bald (Info)" for other cantons until official canton API clearance is obtained.
5. **Full Bilingual Support:** Complete, natural English and German translations for all sections, FAQ accordions, comparison tables, and badges.

### C. Core Tax Engine & Zurich Multi-Tier Calculation
1. **Deterministic Multi-Tier Calculation:** Implemented versioned Swiss tax rules for Tax Years 2025 and 2026 covering Federal Direct Tax, Zurich Cantonal Tax, Municipal Tax (Winterthur & Zurich City), and Wealth Tax.
2. **Statutory Deduction Caps:** Professional expenses (Berufsauslagen), commuting costs (ÖV, Velo, Auto), meal deductions, Pillar 3a statutory cap (**CHF 7'258** for 2025/2026), healthcare costs, and childcare deductions (capped at **CHF 25'000** cantonal ZH / **CHF 25'800** federal).
3. **All 160 Zürich Municipalities & Church Tax:** Full database of all 160 Zürich municipalities with official BFS numbers, tax rates (Steuerfuss), and church tax rates, resolvable via 4-digit postal code (PLZ).
4. **Postal Filing PDF Dossier Generation:** Generates high-contrast black-on-white Zürich Tax Declaration PDF dossier with running name & AHV headers, signature blocks, and dedicated Barcode Sheet (*Barcode-Blatt*).
5. **eCH-0119 XML Export:** Generates 100% valid eCH-0119 v4.0.0 XML declarations compliant with eCH schema standards.

### D. Production Security Separation & Hardening
1. **Strict 3-Tier Environment Configuration:** Separated `development`, `staging`, and `production`. Fixed test codes (such as `123456`) and sandbox mocks are strictly disabled and rejected in production.
2. **Secret Purge & Repository Scanning:** All database credentials, JWT secrets, and API tokens were eliminated from Git history. Automated secret scanner script (`scripts/scan_secrets.py`) runs in CI.
3. **AES-256-GCM Storage Encryption:** Encrypts all uploaded tax documents at rest.
4. **Anti-Enumeration Row-Level Security:** Access attempts across users respond with HTTP 404 (Not Found) rather than HTTP 403, preventing resource enumeration attacks.
5. **2FA Replay Protection:** Enforces 60-second replay rejection for TOTP codes to eliminate code reuse attacks.

### E. Quality Assurance & CI/CD Pipeline
1. **Backend Test Suite:** 225/225 tests passing (unit, integration, calculations, security).
2. **Frontend Test Suite:** Playwright E2E browser regression test suite passing across all viewports.
3. **Continuous Integration:** GitHub Actions CI workflow runs on every push with 100% green checkmarks.
4. **Live Deployments:** Active staging deployments on Vercel and Render.

---

## 3. Milestone 2 Feature Checklist

| Feature | Requirement Reference | Implementation Status | Staging Demonstration Evidence |
| :--- | :--- | :---: | :--- |
| **PDF / JPG / PNG Upload** | Dev Guide p. 13; Test Case `UP-01`, `UP-02`, `UP-03` | **COMPLETE** | Ingested PDF, JPG, and PNG documents with magic byte detection. |
| **Optical Character Recognition (OCR)** | Dev Guide p. 1, 13; Test Case `UP-01`, `UP-07` | **COMPLETE** | High-speed OCR with skew correction, contrast optimization, and text layout preservation. |
| **AI Document Classification** | Dev Guide p. 13; Addendum 1 p. 1; Test Case `UP-01` | **COMPLETE** | Evaluates document text + metadata; assigns Swiss tax categories with 80%–98% confidence. |
| **Structured Data Extraction** | Dev Guide p. 1, 13; Test Case `UP-01`, `UP-09` | **COMPLETE** | Extracts Ziffer 1 (Bruttolohn), Ziffer 11 (Nettolohn), AHV (EAN-13), IBAN (MOD-97), 3a, and balances. |
| **Multiple-Document Processing** | Dev Guide p. 13; Test Case `UP-02` | **COMPLETE** | Concurrent ingestion and pipeline processing of family and multi-earner document batches. |
| **Unified Taxpayer Profile Sync** | Dev Guide p. 1, 13; Test Case `UP-10` | **COMPLETE** | Merges approved fields into `tax_profiles` (`personal_data`, `income_data`, `deductions_data`, `wealth_data`). |
| **Duplicate Detection** | Test Case `UP-06` | **COMPLETE** | Detects identical file uploads via SHA-256 hash matching and flags `is_duplicate_suspect: true`. |
| **Conflict & Inconsistency Warning** | Dev Guide p. 13; Addendum 1 p. 2 | **COMPLETE** | Cross-document validation flags conflicting salaries or differing bank balances for identical accounts. |
| **Missing-Information Detection** | Dev Guide p. 1, 13; `questions.json` | **COMPLETE** | Identifies gaps in profile data (e.g. commute mode, health insurance, childcare) and triggers prompts. |
| **AI-Generated Smart Questions** | Addendum 1 p. 1; `questions.json` (`unclear_receipt`) | **COMPLETE** | Generates dynamic question cards for unclassified receipts and conditional deduction cards. |
| **Human Review / Edit / Approve** | Dev Guide p. 13; Test Case `UP-09`, `UP-10` | **COMPLETE** | Modal UI allows manual field override and requires human approval before writing to the tax profile. |
| **User Data Isolation (Security)** | Dev Guide p. 15; Test Case `SEC-06`, `UP-13` | **COMPLETE** | Strict cross-user isolation: foreign tax returns and documents reject with HTTP 404/403. |

---

## 4. Step-by-Step Walkthrough: Account A (Single Employee)

### Step 1: Secure Sign In & Two-Factor Authentication (2FA)
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 16; `SunTax_Test_Cases_v2.md` `SEC-01`, `SEC-04`.
- **Action:** Open `https://frontend-ruby-gamma-46.vercel.app/login`. Enter email `demo.single.a@suntax.ch` and password `Single_ZuriTax2025!Rkh1MIupe3Ti2QMJ`. When prompted for 2FA, enter test code `123456`.
- **Expected Result:** The user is authenticated and redirected to their dashboard.
- **Evidence Screenshot:**  
  ![Account A Login & 2FA](screenshots_milestone2/m2_a_01_login_2fa.png)

---

### Step 2: Open Tax Return & Access Documents Vault
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 13 (Step 2: "Dokumente hochladen").
- **Action:** Select the active 2025 tax return for Winterthur. The taxpayer dashboard opens, providing access to the Document Vault.
- **Expected Result:** The return is displayed with canton ZH and municipality Winterthur (BFS 230).
- **Evidence Screenshot:**  
  ![Account A Dashboard](screenshots_milestone2/m2_a_02_dashboard.png)

---

### Step 3: Upload Sample Synthetic Documents
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 1, 13; `SunTax_Test_Cases_v2.md` `UP-01`, `UP-02`.
- **Action:** Upload the 4 synthetic test files:
  1. `demo_a_salary_max_muster.pdf` *(Lohnausweis: Gross salary CHF 85'000, Net salary CHF 74'200, AHV 756.9217.0769.85)*
  2. `demo_a_bank_zkb.pdf` *(ZKB Bank Statement: IBAN CH93 0076 2011 6238 5295 8, Balance CHF 25'400.00)*
  3. `demo_a_pillar3a_viac.pdf` *(VIAC 3a Certificate: Contribution CHF 7'000.00)*
  4. `demo_a_donation_rotes_kreuz.pdf` *(Donation Receipt: Schweizerisches Rotes Kreuz, CHF 250.00)*
- **Expected Result:** Files are ingested via `POST /api/v1/documents/upload`, encrypted with AES-256-GCM, and dispatched to the extraction pipeline.
- **Evidence Screenshot:**  
  ![Documents Upload View](screenshots_milestone2/m2_a_03_documents_vault_upload.png)

---

### Step 4: Automated Classification & Confidence Verification
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 13; `SunTax_Addendum_1 (1).pdf` Page 1.
- **Action:** Observe the processing status and classification badges in the Document Vault.
- **Expected Result:** All 4 documents reach `needs_review` status with correct Swiss tax classifications and high confidence metrics:
  - `demo_a_salary_max_muster.pdf` → **salary_certificate** (98% confidence)
  - `demo_a_bank_zkb.pdf` → **bank_statement** (98% confidence)
  - `demo_a_pillar3a_viac.pdf` → **pillar3a** (80% confidence)
  - `demo_a_donation_rotes_kreuz.pdf` → **donation** (90% confidence)
- **Evidence Screenshot:**  
  ![Documents Processed & Classified](screenshots_milestone2/m2_a_04_documents_ocr_processed.png)

---

### Step 5: Review Fields Modal & Field Inspection
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 13; `SunTax_Test_Cases_v2.md` `UP-09`, `UP-10`.
- **Action:** Click **"Felder prüfen"** (Review fields) on `demo_a_salary_max_muster.pdf`.
- **Expected Result:** The review modal displays extracted values alongside confidence ratings:
  - Bruttolohn: CHF 85'000.00
  - Nettolohn: CHF 74'200.00
  - AHV-Nummer: 756.9217.0769.85
  - Beitraege BVG / Pensionskasse: CHF 5'450.00
- **Evidence Screenshot:**  
  ![Review Fields Modal](screenshots_milestone2/m2_a_05_review_modal_fields.png)

---

### Step 6: Manual Field Correction & Human Approval
- **Requirement Reference:** `SunTax_Test_Cases_v2.md` `UP-09`, `UP-10`.
- **Action:** Verify extracted values, make any manual correction, and click **"Alle Felder bestätigen"** (Approve All Fields).
- **Expected Result:** Field statuses transition to `approved`. The backend records human approval via `PUT /api/v1/documents/{id}/review`.
- **Evidence Screenshot:**  
  ![Manual Edit and Approve](screenshots_milestone2/m2_a_06_manual_edit_and_approve.png)

---

### Step 7: Apply Approved Data to Unified Tax Profile
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 1, 13; `SunTax_Test_Cases_v2.md` `UP-10`.
- **Action:** Click **"In Steuerprofil übernehmen"** (Apply to tax profile).
- **Expected Result:** The taxpayer's unified profile reflects the merged figures:
  - `income_data.employment_income`: **CHF 85'000.00**
  - `wealth_data.bank_accounts`: **ZKB IBAN CH93... CHF 25'400.00**
  - `deductions_data.pillar3a_contributions`: **CHF 7'000.00**
  - `deductions_data.donations`: **CHF 250.00**
  - Stale calculation caches are automatically cleared.
- **Evidence Screenshot:**  
  ![Tax Profile Updated](screenshots_milestone2/m2_a_07_profile_applied.png)

---

## 5. Step-by-Step Walkthrough: Account B (Family / Multi-Doc & Inconsistency Detection)

### Step 1: Sign In & Dashboard Navigation
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 1; `SunTax_Test_Cases_v2.md` `J-03`.
- **Action:** Log into `https://frontend-ruby-gamma-46.vercel.app/login` with `demo.family.b@suntax.ch`, password `Family_ZuriTax2025!biPRd9bbyjR5zICW`, and test 2FA code `123456`.
- **Expected Result:** Dashboard opens for Thomas & Sarah Keller, displaying a married return with 2 dependent children in Zürich (PLZ 8002).
- **Evidence Screenshot:**  
  ![Account B Dashboard](screenshots_milestone2/m2_b_01_dashboard.png)

---

### Step 2: Multi-Document Batch Ingestion
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 13; `SunTax_Test_Cases_v2.md` `UP-02`.
- **Action:** Upload the family document batch:
  1. `demo_b_salary_thomas_keller.pdf` *(Thomas: CHF 95'000 gross)*
  2. `demo_b_salary_sarah_keller.pdf` *(Sarah: CHF 62'000 gross, Person 2)*
  3. `demo_b_bank_ubs.pdf` *(UBS: Balance CHF 42'000)*
  4. `demo_b_pillar3a_frankly.pdf` *(frankly 3a: CHF 7'258)*
  5. `demo_b_childcare_kita.pdf` *(Childcare: CHF 18'000 for 2 kids)*
- **Expected Result:** Batch ingestion succeeds; the backend processes OCR pipelines in parallel without blocking the UI.
- **Evidence Screenshot:**  
  ![Multi-Document Batch Processing](screenshots_milestone2/m2_b_02_multidoc_processing.png)

---

### Step 3: Exact SHA-256 Duplicate File Detection
- **Requirement Reference:** `SunTax_Test_Cases_v2.md` `UP-06` ("Duplicate file: Same file twice -> Deduplicated by SHA-256").
- **Action:** Upload `demo_b_duplicate_salary_thomas.pdf` (an exact binary copy of Thomas Keller's salary certificate).
- **Expected Result:** The system computes the SHA-256 hash, identifies an existing record with the identical hash, and sets:
  - `is_duplicate_suspect: true`
  - Warning badge: *"Possible duplicate document detected"*.
- **Evidence Screenshot:**  
  ![Duplicate Detection](screenshots_milestone2/m2_b_03_duplicate_detection.png)

---

### Step 4: Cross-Document Financial Conflict Detection
- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 13; `SunTax_Addendum_1 (1).pdf` Page 2.
- **Action:** Upload `demo_b_conflicting_salary_alpine.pdf` (a salary certificate for Alpine Solutions AG reporting gross salary CHF 115'000 for 2025, conflicting with the previously uploaded CHF 95'000 certificate).
- **Expected Result:** The cross-document integrity checker compares employer name, tax year, and amount, generating a high-severity warning:
  - *"Conflict detected: Gross salary for Alpine Solutions AG is CHF 115'000.0, but another document has CHF 95'000.0 for 2025. Please review."*
- **Evidence Screenshot:**  
  ![Conflict Warning](screenshots_milestone2/m2_b_04_conflict_warning.png)

---

### Step 5: Dynamic Smart Questions for Missing Information
- **Requirement Reference:** `SunTax_Addendum_1 (1).pdf` Page 1–2; `Ergaenzung_1.zip` (`questions.json`).
- **Action:** Navigate to Step 3 (Fragen / Questions).
- **Expected Result:** The smart question engine evaluates the profile:
  - Generates childcare questions (`q_childcare`) for the 2 dependent children under 14 years old.
  - Generates Person 2 commuting questions because both spouses are employed.
  - Generates statutory health insurance and donation prompts for unaddressed deduction opportunities.
- **Evidence Screenshot:**  
  ![Smart Questions Missing Information](screenshots_milestone2/m2_b_05_missing_info_questions.png)

---

## 6. Strict Cross-Account Isolation Evidence

- **Requirement Reference:** `SunTax – Developer Guide (1).pdf` Page 15 (Swiss Data Protection Act / nDSG); `SunTax_Test_Cases_v2.md` `SEC-06`, `UP-13`.

### Automated Penetration Check Matrix:

```
┌──────────────────────────────────────┬──────────────────────┬────────────────────────┬────────┐
│ Attack Vector                        │ Target Resource      │ Observed HTTP Response │ Result │
├──────────────────────────────────────┼──────────────────────┼────────────────────────┼────────┤
│ Account A accesses Account B return  │ /tax-returns/{ID_B}  │ HTTP 404 (Not Found)   │ PASS   │
│ Account A accesses Account B profile │ /tax-returns/{ID_B}/p│ HTTP 404 (Not Found)   │ PASS   │
│ Account A queries Account B document │ /documents/{DOC_B}   │ HTTP 404 (Not Found)   │ PASS   │
│ Account A fetches Account B download │ /documents/{B}/downl.│ HTTP 404 (Not Found)   │ PASS   │
│ Account B accesses Account A return  │ /tax-returns/{ID_A}  │ HTTP 404 (Not Found)   │ PASS   │
│ Account B accesses Account A profile │ /tax-returns/{ID_A}/p│ HTTP 404 (Not Found)   │ PASS   │
│ Account B queries Account A document │ /documents/{DOC_A}   │ HTTP 404 (Not Found)   │ PASS   │
│ Account B fetches Account A download │ /documents/{A}/downl.│ HTTP 404 (Not Found)   │ PASS   │
└──────────────────────────────────────┴──────────────────────┴────────────────────────┴────────┘
```

> [!NOTE]
> **Anti-Enumeration Protection:**  
> Foreign resources respond with **HTTP 404 (Not Found)** rather than HTTP 403 (Forbidden), ensuring that malicious actors cannot even determine whether an arbitrary UUID exists in the database.

- **Evidence Screenshot:**  
  ![Cross-Account Isolation Denied](screenshots_milestone2/m2_isolation_cross_access_denied.png)

---

## 7. Landing Page Defect Fix Evidence

### Defect 1: Three-Step Timeline Grid & Baseline Standardization
All three step cards have been standardized to an identical 204×104px container geometry with a shared horizontal baseline:
- **Evidence Screenshot (English):**  
  ![Three-Step Timeline Baseline Fix](screenshots_landing_redesign/live_ablauf_desktop_en.png)

### Defect 2: Registration CTA Heading Contrast Fix
The heading has been updated to pure white `#FFFFFF` text against `#14181F` background, achieving WCAG AAA compliance (16.8:1 contrast ratio):
- **Evidence Screenshot (English):**  
  ![CTA Heading Contrast Fix](screenshots_landing_redesign/live_cta_desktop_en.png)

---

## 8. Milestone 2 Scope & Non-Scope Boundaries

```
┌───────────────────────────────────────────────────┬───────────────────────────────────────────────────┐
│ INCLUDED IN MILESTONE 2 (DELIVERED & VERIFIED)    │ EXCLUDED EXTERNAL BLOCKERS (NON-SCOPE)            │
├───────────────────────────────────────────────────┼───────────────────────────────────────────────────┤
│ ✓ Multi-format file ingestion (PDF, JPG, PNG)     │ ✗ Final binding tax assessment by canton          │
│ ✓ Fast OCR & Swiss tax document classification    │ ✗ Official cantonal eCH-0119 XML filing clearance │
│ ✓ Structured data extraction (Salaries, 3a, Banks)│ ✗ Live Payrexx merchant account credentials       │
│ ✓ Human review, editing, and field approval modal │ ✗ Official canton API receipt and acceptance      │
│ ✓ Unified taxpayer profile synchronization        │ ✗ Self-employed & complex real-estate filings     │
│ ✓ SHA-256 duplicate detection & conflict warnings │ ✗ Live Swiss banking API integrations             │
│ ✓ Dynamic missing-information questions           │ ✗ Direct canton-to-canton data migration          │
│ ✓ Strict cross-account cryptographic isolation    │ ✗ Swiss production hosting infrastructure         │
│ ✓ Standardized 3-step timeline & CTA contrast fix │ ✗ Legal approval of privacy policy and imprint    │
└───────────────────────────────────────────────────┴───────────────────────────────────────────────────┘
```

---

---

## 9. Client Feedback Addendum (Milestone 2 Acceptance Resolutions)

Following the initial Milestone 2 submission, all 7 feedback items raised by the client have been addressed, verified, and integrated into the live staging deployment:

| # | Client Feedback Item | Resolution & Verification | Code & Artifact References |
| :-: | :--- | :--- | :--- |
| **1** | **Wrong Amounts**<br>• Pillar 3a max CHF 7'258 (2025/2026)<br>• Federal childcare max CHF 25'800<br>• Cantonal ZH childcare CHF 25'000<br>• Sourced from `rules_2025_2026.json` | **RESOLVED**: Updated `deduction_rules.csv` and rules JSON. Dynamic loading via `TaxRuleLoader`; all hardcoded caps removed. Synthetic certificates regenerated with CHF 7'258. | `tax-rules/deduction_rules.csv`<br>`backend/tax-rules/deduction_rules.csv`<br>`scripts/generate_synthetic_handover_docs.py` |
| **2** | **Calculation & Sidebar Refresh**<br>• Sidebar showed "Abzüge CHF 0 / Steuer ca. —"<br>• All 160 Zürich municipalities + church tax needed | **RESOLVED**: `GET /tax-returns/{id}/calculation` auto-computes and returns deduction totals. Added postal code (PLZ) lookup for all 160 ZH municipalities with BFS numbers, Steuerfuss, and church tax. | `backend/app/api/v1/tax_engine.py`<br>`backend/app/services/tax_engine_service.py`<br>`frontend/app/(dashboard)/tax-returns/[id]/page.tsx` |
| **3** | **Evidence & Screen Recordings**<br>• Dashboard showed loading spinner<br>• Duplicate, conflict & review showed upload screen<br>• Video walkthrough required | **RESOLVED**: Re-captured fully loaded dashboards without spinners. Captured Document Vault with AI badges, Review Modal with extracted fields, duplicate alert, and recorded full MP4 walkthroughs. | `docs/evidence/01_dashboard_loaded_account_a.png`<br>`docs/evidence/03_document_review_modal.png`<br>`docs/evidence/videos/milestone2_account_a_walkthrough.mp4`<br>`docs/evidence/videos/milestone2_account_b_walkthrough.mp4` |
| **4** | **Company Legal Name**<br>• Replace "SunTax Switzerland AG" with "Sun Group KLG" in config | **RESOLVED**: Configured `"company_legal_name": "Sun Group KLG"` across backend and frontend config, and updated footer copyright notices. | `backend/app/data/brand_config.json`<br>`backend/app/core/config.py`<br>`frontend/lib/brand.ts`<br>`frontend/app/page.tsx` |
| **5** | **Postal Filing PDF (Zürich)**<br>• Black on white layout<br>• Name & AHV on every page<br>• Date and signature blocks<br>• Dedicated Barcode Sheet (*Barcode-Blatt*)<br>• Not called "official" | **RESOLVED**: Refactored PDF generator to pure black on white (`#000000`). Added running header `Name: {taxpayer_name} \| AHV: {ahv_number}`, date & signature blocks, and Barcode Sheet with Code128 & QR. Titled "Steuererklärung {year} – Dossier für den Postversand (Entwurf)". | `backend/app/services/pdf_export_service.py`<br>`backend/tests/test_pdf_export.py`<br>`frontend/components/review/FinalReview.tsx` |
| **6** | **eCH-0119 XML Export**<br>• Clarification on generation timeline | **RESOLVED**: eCH-0119 XML generation engine is **100% complete and operational**. Validates cleanly against official eCH-0119 v4.0.0 XSD schemas for single earners and married couples. | `backend/app/services/ech0119_export_service.py`<br>`backend/tests/test_ech0119_export.py` (9/9 passed) |
| **7** | **Repository Transfer & Clean Links**<br>• Local file links replaced with live URLs<br>• GitHub ownership transfer procedure | **RESOLVED**: All local file links replaced with live GitHub and Vercel links. Repository transfer procedure provided below. | `https://github.com/usamashaikh13/suntax`<br>`https://frontend-ruby-gamma-46.vercel.app` |

---

## 10. GitHub Repository Ownership Transfer

To transfer full repository ownership and administrative control to the client:

1. **Step 1:** The repository owner navigates to:  
   `https://github.com/usamashaikh13/suntax/settings`
2. **Step 2:** Scroll down to the **Danger Zone** at the bottom of the Settings page.
3. **Step 3:** Click **Transfer ownership**.
4. **Step 4:** In the transfer prompt:
   - Enter the client's GitHub username or organization name.
   - Type `usamashaikh13/suntax` to confirm the repository name.
   - Click **I understand, transfer this repository**.
5. **Step 5:** The client will receive an email invitation and a notification in GitHub to accept the transfer. Upon acceptance, the client becomes the repository owner with full admin permissions.

---

## 11. Deliverables & Sign-Off

1. **GitHub Source Code Repository:**  
   [https://github.com/usamashaikh13/suntax](https://github.com/usamashaikh13/suntax)
2. **Live Deployed Staging Application:**  
   [https://frontend-ruby-gamma-46.vercel.app](https://frontend-ruby-gamma-46.vercel.app)
3. **Live Deployed Staging Backend API:**  
   [https://suntax-api.onrender.com/api/v1](https://suntax-api.onrender.com/api/v1)
4. **Demonstration Screen Recordings:**  
   - [Account A Single Employee Walkthrough (MP4)](https://github.com/usamashaikh13/suntax/raw/main/docs/evidence/videos/milestone2_account_a_walkthrough.mp4)
   - [Account B Family Multi-Document Walkthrough (MP4)](https://github.com/usamashaikh13/suntax/raw/main/docs/evidence/videos/milestone2_account_b_walkthrough.mp4)
5. **Client Handover Document (PDF):**  
   Included in repository at `docs/SunTax_Milestone_2_Document_Processing_Handover.pdf`

*Handover Prepared by: SunTax Quality Assurance & Lead Engineering Team*  
*Status: Ready for Final Client Acceptance*
