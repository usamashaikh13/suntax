# Tax Rules System

> [!CAUTION]
> All tax rules **must be verified against official Swiss tax authority publications** before being deployed. Incorrect rules will result in wrong tax calculations which may expose users to penalties. Never add rules based solely on third-party sources.

---

## How the Rule System Works

Tax rules are stored in the `tax_rules` database table. Each row represents a single rule that the tax calculation engine can look up by:

- `canton_code` — the 2-letter canton code (e.g., `ZH`, `BE`)
- `tax_year` — the relevant tax year (e.g., `2025`)
- `rule_type` — category of the rule (see types below)
- `rule_key` — specific rule identifier within the type

The calculation engine loads all rules for a given (canton, year) combination and applies them in a deterministic order.

### Rule Types

| `rule_type` | Description | Example `rule_key` |
|-------------|-------------|-------------------|
| `rate` | Progressive tax rate table | `federal_rate_table`, `cantonal_rate_married` |
| `deduction` | Fixed or percentage deductions | `professional_expenses_max`, `insurance_deduction` |
| `allowance` | Personal/family allowances | `child_allowance`, `double_earner_allowance` |
| `threshold` | Income thresholds that change behaviour | `wealth_tax_threshold` |
| `multiplier` | Cantonal tax multiplier (Steuerfuss) | `tax_multiplier` |

### `rule_data` JSON Schema

The `rule_data` JSONB column is typed by `rule_type`:

**`rate` rule:**
```json
{
  "brackets": [
    {"from": 0,      "to": 14500,  "rate": 0.00},
    {"from": 14500,  "to": 31600,  "rate": 0.077},
    {"from": 31600,  "to": 41400,  "rate": 0.088},
    {"from": 41400,  "to": 55200,  "rate": 0.099},
    {"from": 55200,  "to": null,   "rate": 0.115}
  ],
  "applies_to": "single",
  "currency": "CHF"
}
```

**`deduction` rule:**
```json
{
  "type": "fixed",
  "amount": 2700,
  "currency": "CHF",
  "condition": null
}
```
or
```json
{
  "type": "percentage",
  "rate": 0.03,
  "max": 4000,
  "min": 2000,
  "currency": "CHF",
  "condition": "employed"
}
```

**`allowance` rule:**
```json
{
  "amount": 6700,
  "per": "child",
  "currency": "CHF",
  "notes": "Per child under 18 or in education"
}
```

**`multiplier` rule:**
```json
{
  "multiplier": 1.19,
  "effective_year": 2025,
  "source": "https://www.zh.ch/steuerfuss-2025"
}
```

---

## How to Add a New Tax Year

### Step 1: Gather official sources

Collect from the official sources (ESTV / Kantonale Steuerverwaltungen):
- [ESTV — Kreisschreiben](https://www.estv.admin.ch/estv/de/home/direkte-bundessteuer/kreisschreiben.html)
- Canton-specific tax law publications
- Official Steuerbuch of each canton

### Step 2: Create the migration

```bash
cd backend
alembic revision --autogenerate -m "tax_rules_2026"
```

### Step 3: Write the seed data

Create `backend/app/scripts/seed_tax_rules_YEAR.py`:

```python
"""
Seed tax rules for year YYYY.
All values sourced from:
- Federal: ESTV Kreisschreiben Nr. XX vom YYYY-MM-DD
- ZH: Steuergesetz ZH §XX, Weisung YYYY/XX
(Add source for each canton)
"""
from app.db.session import AsyncSessionLocal
from app.models.tax_rules import TaxRule

TAX_YEAR = 2026

RULES = [
    # ── Federal ────────────────────────────────────────────────
    TaxRule(
        canton_code=None,  # None = federal rule (all cantons)
        tax_year=TAX_YEAR,
        rule_type="rate",
        rule_key="federal_rate_single",
        rule_data={
            "brackets": [...],  # from ESTV source
            "applies_to": "single",
            "currency": "CHF",
        },
        source_url="https://www.estv.admin.ch/.../kreisschreiben-2026.pdf",
        verified_at="2026-01-15T00:00:00Z",
    ),
    # ── Zürich ─────────────────────────────────────────────────
    TaxRule(
        canton_code="ZH",
        tax_year=TAX_YEAR,
        rule_type="multiplier",
        rule_key="tax_multiplier",
        rule_data={"multiplier": 1.19},
        source_url="https://www.zh.ch/...",
        verified_at="2026-01-15T00:00:00Z",
    ),
    # ... rest of cantons
]
```

### Step 4: Run and verify

```bash
docker compose exec backend python -m app.scripts.seed_tax_rules_2026
```

Verify in database:
```sql
SELECT canton_code, rule_type, rule_key, rule_data
FROM tax_rules
WHERE tax_year = 2026
ORDER BY canton_code, rule_type, rule_key;
```

---

## How to Add a New Canton

1. Add a row to the `cantons` table with the 2-letter code and names in all 4 languages.
2. Add all required rules for the new canton (same schema as existing cantons).
3. Add the canton to the frontend canton picker (`frontend/lib/cantons.ts`).
4. Write at least one test for the new canton's tax calculation.
5. Document the official sources in the rule's `source_url` and add to the table in `README.md`.

---

## How to Update a Rule

> [!WARNING]
> Do NOT modify existing rule rows once they have been used in tax calculations. Instead, use `effective_to` / `effective_from` to expire the old rule and create a new one. This preserves audit history.

```python
# ❌ Wrong: modifying existing rule
rule.rule_data["multiplier"] = 1.21

# ✅ Correct: expire old, create new
old_rule.effective_to = date(2025, 12, 31)
new_rule = TaxRule(
    canton_code="ZH",
    tax_year=2026,
    rule_type="multiplier",
    rule_key="tax_multiplier",
    rule_data={"multiplier": 1.21},
    effective_from=date(2026, 1, 1),
    source_url="https://...",
)
```

---

## Schema Reference

```sql
CREATE TABLE tax_rules (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    canton_code     VARCHAR(2) REFERENCES cantons(code),  -- NULL = federal
    tax_year        INTEGER NOT NULL,
    rule_type       VARCHAR NOT NULL,  -- rate | deduction | allowance | threshold | multiplier
    rule_key        VARCHAR NOT NULL,
    rule_data       JSONB NOT NULL,
    effective_from  DATE,
    effective_to    DATE,
    source_url      VARCHAR,          -- REQUIRED: link to official publication
    verified_at     TIMESTAMPTZ,      -- when a human verified against official source
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (canton_code, tax_year, rule_type, rule_key, effective_from)
);
```

---

## Verifying Rules Against Official Sources

Every rule **must** have a `source_url` pointing to the primary official source. Acceptable sources:

| Type | Acceptable Sources |
|------|--------------------|
| Federal income tax rates | [ESTV Kreisschreiben](https://www.estv.admin.ch/estv/de/home/direkte-bundessteuer/kreisschreiben.html) |
| Federal wealth tax | ESTV Merkblatt |
| Cantonal rates | Official Steuergesetz / Steuerordnung of the canton |
| Cantonal multiplier (Steuerfuss) | Official decree published by canton |
| Deductions | Weisungen / Merkblätter of the cantonal tax office |

**Not acceptable**: news articles, accounting firm blogs, Wikipedia, third-party tax calculators.

### Verification Checklist

Before merging a PR that adds/changes tax rules:

- [ ] `source_url` present for every new/changed rule
- [ ] Source is an official government publication
- [ ] Rule values match the official source exactly (numbers, thresholds)
- [ ] `verified_at` is set to today's date
- [ ] Old rule (if replaced) has `effective_to` set
- [ ] Unit test updated to cover the new rule
- [ ] PR reviewed by at least one person who independently checked the source

---

## Useful Official Links

| Resource | URL |
|----------|-----|
| ESTV (Eidg. Steuerverwaltung) | https://www.estv.admin.ch |
| Federal tax rates (DBSt) | https://www.estv.admin.ch/estv/de/home/direkte-bundessteuer/tarife.html |
| Cantonal tax comparisons | https://www.estv.admin.ch/estv/de/home/allgemein/steuerinformationen/kantone.html |
| Tax calculator reference (ESTV) | https://swisstaxcalculator.estv.admin.ch |
| ZH Steuerverwaltung | https://www.zh.ch/de/steuern-finanzen/steuern/natuerliche-personen.html |
| BE Steuerverwaltung | https://www.sv.fin.be.ch |
| GE Administration fiscale | https://www.ge.ch/calculer-impots |
