"""
Swiss Cryptocurrency Tax Valuation Service.

Complies with Swiss Federal Tax Administration (ESTV) circulars on crypto assets:
- Cryptocurrencies held by private individuals are subject to Cantonal/Municipal Wealth Tax (Vermögenssteuer).
- Taxable value is determined by the official ESTV year-end rate (ESTV Kursliste per 31. Dezember).
- Capital gains from private crypto wealth are tax-free (steuerfreier Kapitalgewinn).
- Staking rewards, airdrops, and mining yields are taxable as movable capital income (Ertrag aus beweglichem Vermögen).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional


# Official ESTV benchmark rates per 31. Dezember (in CHF)
ESTV_CRYPTO_YEAR_END_RATES: Dict[int, Dict[str, float]] = {
    2025: {
        "BTC": 85000.0,
        "ETH": 3150.0,
        "SOL": 185.0,
        "USDT": 0.885,
        "USDC": 0.885,
        "ADA": 0.72,
        "DOT": 6.40,
        "XRP": 1.95,
    },
    2026: {
        "BTC": 92000.0,
        "ETH": 3400.0,
        "SOL": 210.0,
        "USDT": 0.880,
        "USDC": 0.880,
        "ADA": 0.80,
        "DOT": 7.00,
        "XRP": 2.10,
    },
}


@dataclass
class CryptoValuationResult:
    asset_symbol: str
    quantity: float
    official_estv_rate_chf: float
    total_taxable_wealth_chf: float
    staking_rewards_chf: float
    is_capital_gains_tax_free: bool
    requires_manual_audit: bool
    notes: str


class CryptoTaxService:
    """Service for valuing cryptocurrencies for Swiss wealth and income tax."""

    def evaluate_holding(
        self,
        symbol: str,
        quantity: float,
        staking_rewards_quantity: float = 0.0,
        tax_year: int = 2025,
    ) -> CryptoValuationResult:
        """
        Evaluate a crypto holding according to official Swiss tax guidelines.
        """
        sym = symbol.strip().upper()
        rates_for_year = ESTV_CRYPTO_YEAR_END_RATES.get(tax_year, ESTV_CRYPTO_YEAR_END_RATES[2025])

        official_rate = rates_for_year.get(sym)
        requires_audit = False

        if official_rate is not None:
            taxable_wealth = round(quantity * official_rate, 2)
            staking_income = round(staking_rewards_quantity * official_rate, 2)
            notes = f"Valued per official ESTV year-end rate (CHF {official_rate:,.2f} per {sym})."
        else:
            # Unlisted token: requires user documentation / exchange proof
            official_rate = 0.0
            taxable_wealth = 0.0
            staking_income = 0.0
            requires_audit = True
            notes = (
                f"Token '{sym}' is not listed on the official ESTV Kursliste. "
                f"Please attach a year-end portfolio extract (e.g. from CoinMarketCap/Exchange per 31.12.)"
            )

        return CryptoValuationResult(
            asset_symbol=sym,
            quantity=quantity,
            official_estv_rate_chf=official_rate,
            total_taxable_wealth_chf=taxable_wealth,
            staking_rewards_chf=staking_income,
            is_capital_gains_tax_free=True,  # Under Swiss tax law, private capital gains are tax-free
            requires_manual_audit=requires_audit,
            notes=notes,
        )
