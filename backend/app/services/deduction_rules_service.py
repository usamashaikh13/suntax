"""
Deduction Rules Service for SunTax — Milestone 2, Part A1 & A2.

Provides:
- CSV import / seed into deduction_rules table
- Fast in-memory and database lookups by (canton, tax_year, level)
- Evaluation of rule types: cap, flat, rate, per_day, per_km, choice
"""
from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Dict, List, Optional

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.deduction_rule import DeductionRule

logger = logging.getLogger(__name__)


@dataclass
class EvaluatedDeduction:
    code: str
    label: str
    amount: Decimal
    rule_type: str
    level: str  # "canton" | "federal"
    form_field: Optional[str]
    source_ref: Optional[str]
    explanation: Optional[str] = None


class DeductionRulesService:
    """Manages deduction rules retrieval, CSV import, and rule execution."""

    def __init__(self, rules_csv_path: Optional[Path] = None) -> None:
        if rules_csv_path is None:
            base_dir = Path(__file__).resolve().parent.parent.parent
            candidates = [
                base_dir / "tax-rules" / "deduction_rules.csv",
                base_dir.parent / "tax-rules" / "deduction_rules.csv",
                Path.cwd() / "tax-rules" / "deduction_rules.csv",
                Path.cwd() / "backend" / "tax-rules" / "deduction_rules.csv",
            ]
            for c in candidates:
                if c.exists():
                    rules_csv_path = c
                    break
            if not rules_csv_path or not rules_csv_path.exists():
                rules_csv_path = base_dir / "tax-rules" / "deduction_rules.csv"
        self.rules_csv_path = rules_csv_path

    def parse_csv_content(self, csv_text: str) -> List[Dict[str, Any]]:
        """Parse raw CSV text into a list of deduction rule dicts."""
        reader = csv.DictReader(io.StringIO(csv_text.strip()))
        rules_data: List[Dict[str, Any]] = []

        for row in reader:
            canton = (row.get("canton") or "ZH").strip().upper()
            tax_year = int(row.get("tax_year") or 2025)
            level = (row.get("level") or "canton").strip().lower()
            code = (row.get("code") or "").strip()
            if not code:
                continue

            def _flt(k: str) -> Optional[float]:
                v = row.get(k)
                if v and v.strip():
                    try:
                        return float(v.strip())
                    except ValueError:
                        return None
                return None

            rules_data.append({
                "canton": canton,
                "tax_year": tax_year,
                "level": level,
                "code": code,
                "form_field": (row.get("form_field") or "").strip() or None,
                "type": (row.get("type") or "cap").strip().lower(),
                "value": _flt("value"),
                "min_val": _flt("min"),
                "max_val": _flt("max"),
                "base": (row.get("base") or "").strip() or None,
                "conditions": (row.get("conditions") or "").strip() or None,
                "depends_on": (row.get("depends_on") or "").strip() or None,
                "source_url": (row.get("source_url") or "").strip() or None,
                "source_page": (row.get("source_page") or "").strip() or None,
                "status": (row.get("status") or "checked").strip().lower(),
            })

        return rules_data

    async def seed_from_csv(self, db: AsyncSession, csv_text: Optional[str] = None) -> int:
        """Seed or update database rules from CSV file or text."""
        if csv_text is None:
            if not self.rules_csv_path.exists():
                logger.warning("Rules CSV not found at %s", self.rules_csv_path)
                return 0
            csv_text = self.rules_csv_path.read_text(encoding="utf-8")

        parsed = self.parse_csv_content(csv_text)
        if not parsed:
            return 0

        # Upsert rules
        count = 0
        for item in parsed:
            # Check existing rule
            stmt = select(DeductionRule).where(
                DeductionRule.canton == item["canton"],
                DeductionRule.tax_year == item["tax_year"],
                DeductionRule.level == item["level"],
                DeductionRule.code == item["code"],
            )
            res = await db.execute(stmt)
            existing = res.scalar_one_or_none()

            if existing:
                for k, v in item.items():
                    setattr(existing, k, v)
            else:
                db.add(DeductionRule(**item))
            count += 1

        await db.commit()
        logger.info("Successfully seeded %d deduction rules", count)
        return count

    async def get_rules_for_level(
        self,
        db: AsyncSession,
        canton: str,
        tax_year: int,
        level: str,  # "canton" | "federal"
    ) -> Dict[str, DeductionRule]:
        """Fetch all deduction rules for a specific canton/federal level and year."""
        canton_code = canton.upper()
        # For federal level, query rules matching canton or federal
        stmt = select(DeductionRule).where(
            DeductionRule.tax_year == tax_year,
            DeductionRule.level == level.lower(),
        )
        if level.lower() == "canton":
            stmt = stmt.where(DeductionRule.canton == canton_code)
        else:
            # Federal level rules can apply across cantons or be tagged federal/canton
            stmt = stmt.where((DeductionRule.canton == canton_code) | (DeductionRule.canton == "CH"))

        result = await db.execute(stmt)
        rules = result.scalars().all()
        return {r.code: r for r in rules}

    def load_fallback_rules_from_csv(
        self,
        canton: str,
        tax_year: int,
        level: str,
    ) -> Dict[str, Dict[str, Any]]:
        """Fallback in-memory rule loader when DB session is unavailable (e.g. unit tests)."""
        if not self.rules_csv_path.exists():
            return {}
        text = self.rules_csv_path.read_text(encoding="utf-8")
        parsed = self.parse_csv_content(text)
        canton_code = canton.upper()
        lvl = level.lower()

        rules: Dict[str, Dict[str, Any]] = {}
        for r in parsed:
            if r["tax_year"] == tax_year and r["level"] == lvl:
                if lvl == "canton" and r["canton"] == canton_code:
                    rules[r["code"]] = r
                elif lvl == "federal" and (r["canton"] == canton_code or r["canton"] == "CH"):
                    rules[r["code"]] = r
        return rules

    def evaluate_rule(
        self,
        rule: DeductionRule | Dict[str, Any],
        actual_claimed: Decimal,
        base_value: Decimal,
        context: Optional[Dict[str, Any]] = None,
    ) -> EvaluatedDeduction:
        """
        Evaluate a single deduction rule against user claimed inputs.
        
        Rule types:
          - cap: min(actual_claimed, max_val)
          - flat: fixed value
          - rate: base_value * rate, bounded between min_val and max_val
          - per_day: value * days, capped at max_val
          - per_km: value * km_per_day * days, capped at max_val
          - choice: max(flat_value, actual_claimed) bounded by max_val
        """
        ctx = context or {}
        r_type = rule.type if isinstance(rule, DeductionRule) else rule["type"]
        r_code = rule.code if isinstance(rule, DeductionRule) else rule["code"]
        r_level = rule.level if isinstance(rule, DeductionRule) else rule["level"]
        r_val = Decimal(str(rule.value or 0)) if (rule.value if isinstance(rule, DeductionRule) else rule.get("value")) is not None else None
        r_min = Decimal(str(rule.min_val or 0)) if (rule.min_val if isinstance(rule, DeductionRule) else rule.get("min_val")) is not None else None
        r_max = Decimal(str(rule.max_val or 0)) if (rule.max_val if isinstance(rule, DeductionRule) else rule.get("max_val")) is not None else None
        form_field = rule.form_field if isinstance(rule, DeductionRule) else rule.get("form_field")
        source_ref = rule.source_page if isinstance(rule, DeductionRule) else rule.get("source_page")
        conditions = (rule.conditions or "") if isinstance(rule, DeductionRule) else (rule.get("conditions") or "")

        # Check conditions
        if "no company car" in conditions and ctx.get("has_company_car"):
            # Box F ticked: company car -> no commuting deduction
            return EvaluatedDeduction(
                code=r_code,
                label=f"{r_code} (Company car - no deduction)",
                amount=Decimal("0"),
                rule_type=r_type,
                level=r_level,
                form_field=form_field,
                source_ref=source_ref,
                explanation="Box F: Firmenwagen / Unentgeltliche Beförderung",
            )

        amount = Decimal("0")
        explanation = ""

        if r_type == "flat":
            amount = r_val or Decimal("0")
            explanation = f"Pauschale: CHF {amount:,.0f}"

        elif r_type == "cap":
            if r_max is not None:
                amount = min(actual_claimed, r_max)
                explanation = f"Effektive Kosten bis max. CHF {r_max:,.0f}"
            else:
                amount = actual_claimed
                explanation = "Effektive Kosten"

        elif r_type == "rate":
            rate = r_val or Decimal("0")
            computed = base_value * rate
            if r_min is not None and computed < r_min:
                computed = r_min
            if r_max is not None and computed > r_max:
                computed = r_max
            amount = computed
            explanation = f"{float(rate)*100:.1f}% von Basis (CHF {base_value:,.0f})"

        elif r_type == "per_day":
            days = Decimal(str(ctx.get("days", 0)))
            rate_per_day = r_val or Decimal("0")
            computed = rate_per_day * days
            amount = min(computed, r_max) if r_max is not None else computed
            explanation = f"CHF {rate_per_day} x {days} Tage"

        elif r_type == "per_km":
            km = Decimal(str(ctx.get("km_per_day", 0)))
            days = Decimal(str(ctx.get("days", 240)))
            rate_per_km = r_val or Decimal("0.70")
            computed = rate_per_km * km * days
            amount = min(computed, r_max) if r_max is not None else computed
            explanation = f"CHF {rate_per_km}/km x {km} km x {days} Tage"

        elif r_type == "choice":
            flat_val = r_val or Decimal("0")
            chosen = max(actual_claimed, flat_val)
            amount = min(chosen, r_max) if r_max is not None else chosen
            explanation = "Günstigerer Betrag (Pauschale vs. Effektiv)"

        # Round to Swiss 5-Rappen
        five_cent = Decimal("0.05")
        amount = (amount / five_cent).quantize(Decimal("1")) * five_cent

        return EvaluatedDeduction(
            code=r_code,
            label=r_code,
            amount=max(amount, Decimal("0")),
            rule_type=r_type,
            level=r_level,
            form_field=form_field,
            source_ref=source_ref,
            explanation=explanation,
        )


# Module-level singleton
deduction_rules_service = DeductionRulesService()
