"""
Service for Contextual Info Texts and Tips — Milestone 2, Part B5.

Stores and serves the standardized «i» helper text for every question:
1. Warum wir fragen (Why we ask)
2. Was zählt und was nicht (What counts and what does not)
3. Ein Beispiel (One example)
Plus proactive tips for missed deductions and warnings.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.question_info_text import QuestionInfoText

logger = logging.getLogger(__name__)

INITIAL_QUESTION_INFO_TEXTS = [
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "commute_transport",
        "title_de": "Arbeitsweg & Transportmittel",
        "why_we_ask": "Die Kosten für den Arbeitsweg zwischen Wohn- und Arbeitsstätte können als Berufsauslagen vom steuerbaren Einkommen abgezogen werden.",
        "what_counts": "Fahrrad (Pauschale CHF 700), öffentliche Verkehrsmittel (effektive Abonnementspreise z.B. ZVV/GA) oder Auto (CHF 0.70/km). Ein Autoabzug wird steueramtlich nur akzeptiert, wenn kein zumutbarer ÖV existiert oder erhebliche Zeitersparnis (> 1 Std./Tag) vorliegt. Bei Geschäftsfahrzeug (Feld F auf Lohnausweis) entfällt der Abzug vollständig.",
        "example": "Sie pendeln von Winterthur nach Zürich mit dem ZVV-NetzPass für CHF 2'100 im Jahr. Dieser Betrag wird vollständig als Abzug geltend gemacht.",
        "tip_text": "Maximalabzug Kanton Zürich: CHF 5'200. Direkte Bundessteuer: maximal CHF 3'300.",
        "tip_type": "missed_deduction",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "home_office",
        "title_de": "Homeoffice-Tage",
        "why_we_ask": "Tage, an denen Sie von zu Hause aus arbeiten, reduzieren Ihre tatsächlichen Fahrten und Auslagen für auswärtige Verpflegung.",
        "what_counts": "Effektive Tage im Homeoffice. An diesen Tagen entfällt der Anspruch auf Fahrkosten und die Pauschale für auswärtige Verpflegung anteilsmässig.",
        "example": "Bei 240 Arbeitstagen und 40 Homeoffice-Tagen werden Fahrkosten und Mittagsabzug für 200 effektive Pendeltage berechnet.",
        "tip_text": "Achtung: Mehr Homeoffice-Tage reduzieren Ihren Pendler- und Verpflegungsabzug. Geben Sie die genaue Anzahl an.",
        "tip_type": "warning",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "commute_car",
        "title_de": "Benützung des privaten Motorfahrzeugs",
        "why_we_ask": "Die Autokosten-Pauschale von CHF 0.70 pro Fahrkilometer ist deutlich höher als ein ÖV-Abonnement und wird vom Steueramt streng geprüft.",
        "what_counts": "Zulässig nur, wenn kein öffentliches Verkehrsmittel zur Verfügung steht, der Arbeitsweg mit ÖV mehr als 60 Minuten länger dauern würde oder ein Gebrechen vorliegt. Andernfalls werden nur die hypothetischen ÖV-Kosten anerkannt.",
        "example": "Bei 20 km einfacher Strecke und 200 Arbeitstagen: 40 km/Tag × 200 Tage × CHF 0.70 = CHF 5'600 (gekappt auf Max. CHF 5'200 im Kt. ZH bzw. CHF 3'300 Bund).",
        "tip_text": "Prüfen Sie vorab, ob die Benützung des Autos für das Steueramt als zumutbar begründet werden kann.",
        "tip_type": "warning",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "meals",
        "title_de": "Auswärtige Verpflegung",
        "why_we_ask": "Wenn Sie mittags nicht nach Hause zurückkehren können, entsteht Ihnen ein steuerlich anerkannter Mehrkostenaufwand.",
        "what_counts": "Standard-Pauschale beträgt CHF 3'200 pro Jahr (CHF 15 pro Tag). Falls Ihr Arbeitgeber eine Kantine betreibt oder Essensgutscheine abgibt (Feld G im Lohnausweis angekreuzt), halbiert sich der Abzug auf CHF 1'600 (CHF 7.50 pro Tag).",
        "example": "Arbeiten Sie 220 Tage vor Ort mit Arbeitgeber-Kantine: 220 × CHF 7.50 = CHF 1'650 (gedeckelt auf CHF 1'600 Jahrespauschale).",
        "tip_text": "Feld G im Lohnausweis beachten: Bei verbilligter Verpflegung greift automatisch der reduzierte Satz von CHF 1'600.",
        "tip_type": "missed_deduction",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "pillar3a",
        "title_de": "Säule 3a (Gebundene Vorsorge)",
        "why_we_ask": "Beiträge in die Säule 3a können zu 100% direkt vom steuerbaren Einkommen abgezogen werden — eine der wirksamsten Sparmöglichkeiten.",
        "what_counts": "Zahlungen an anerkannte Vorsorgestiftungen oder Versicherungspolicen bis zum gesetzlichen Maximalbetrag (Steuerjahr 2025: CHF 7'258 für Angestellte mit Pensionskasse).",
        "example": "Bei Einzahlung von CHF 7'000 sparen Sie je nach Grenzsteuersatz ca. CHF 1'500 bis CHF 2'300 an Steuern.",
        "tip_text": "Haben Sie 2025 noch nicht den vollen Betrag von CHF 7'258 eingezahlt? Jeder eingezahlte Franken mindert Ihre Steuerlast direkt.",
        "tip_type": "missed_deduction",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "health_insurance",
        "title_de": "Versicherungsprämien & Sparkapitalzinsen",
        "why_we_ask": "Krankenkassen-Grundversicherungsprämien und Zusatzversicherungen sind pauschal abzugsfähig.",
        "what_counts": "Pauschaler Abzug im Kanton Zürich: CHF 2'600 für Alleinstehende, CHF 5'200 für Verheiratete, plus CHF 1'300 pro Kind. Bei der Bundessteuer: CHF 2'800 (Alleinstehend) / CHF 5'600 (Verheiratet) + CHF 700 pro Kind.",
        "example": "Ein verheiratetes Paar mit 2 Kindern im Kanton Zürich erhält automatisch einen Abzug von CHF 5'200 + CHF 2'600 = CHF 7'800.",
        "tip_text": "Sie müssen keine einzelnen Krankenkassen-Rechnungen heraussuchen, die Pauschale wird voll angerechnet.",
        "tip_type": "missed_deduction",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "further_education",
        "title_de": "Aus- und Weiterbildungskosten",
        "why_we_ask": "Berufsorientierte Aus- und Weiterbildungskosten sowie Umschulungen können vom Einkommen in Abzug gebracht werden.",
        "what_counts": "Kursgelder, Prüfungsgebühren, Fachliteratur und notwendige Reisespesen, sofern diese nicht vom Arbeitgeber rückvergütet wurden. Maximal CHF 12'000 pro Jahr.",
        "example": "Ein Lehrgang für CAS Project Management für CHF 4'500 selbst bezahlt mindert Ihr steuerbares Einkommen um den vollen Betrag.",
        "tip_text": "Haben Sie berufsbezogene Kurse, Sprachdiplome oder Zertifizierungen absolviert? Belege bereithalten!",
        "tip_type": "missed_deduction",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "donations",
        "title_de": "Freiwillige Zuwendungen (Spenden)",
        "why_we_ask": "Spenden an steuerbefreite gemeinnützige Institutionen mit Sitz in der Schweiz sind abzugsfähig.",
        "what_counts": "Zuwendungen ab CHF 100 pro Jahr an ZEWO-zertifizierte oder kantonal als gemeinnützig anerkannte Organisationen. Maximal 20% des Reineinkommens.",
        "example": "Spenden von CHF 250 an das Rote Kreuz und CHF 150 an die Krebsliga = CHF 400 Abzug.",
        "tip_text": "Spendenbestätigungen aufbewahren. Viele Organisationen senden jährliche Sammelbestätigungen.",
        "tip_type": "missed_deduction",
    },
    {
        "canton": "ZH",
        "tax_year": 2025,
        "question_key": "children",
        "title_de": "Kinder & Kinderbetreuung",
        "why_we_ask": "Für minderjährige Kinder und Kinder in Erstausbildung stehen Ihnen wesentliche Sozialabzüge zu.",
        "what_counts": "Kinderabzug: Kanton Zürich CHF 9'000 pro Kind; Bund CHF 6'700 pro Kind. Drittbetreuungskosten (Kita, Hort, Tagesfamilie) bis zu CHF 10'100 (Kt. ZH) bzw. CHF 25'500 (Bund).",
        "example": "Bei 1 Kind in Kita (Kosten CHF 8'000): Abzug = CHF 9'000 (Kinderabzug) + CHF 8'000 (Betreuung) = CHF 17'000 im Kanton Zürich.",
        "tip_text": "Kita- und Hortrechnungen als Beleg bereithalten für den Drittbetreuungsabzug.",
        "tip_type": "missed_deduction",
    },
]


class QuestionInfoService:
    """Provides contextual «i» information cards and tips for questions."""

    async def seed_defaults(self, db: AsyncSession) -> int:
        """Seed default question info texts if not already present."""
        count = 0
        for item in INITIAL_QUESTION_INFO_TEXTS:
            stmt = select(QuestionInfoText).where(
                QuestionInfoText.canton == item["canton"],
                QuestionInfoText.tax_year == item["tax_year"],
                QuestionInfoText.question_key == item["question_key"],
            )
            res = await db.execute(stmt)
            existing = res.scalar_one_or_none()
            if existing:
                for k, v in item.items():
                    setattr(existing, k, v)
            else:
                db.add(QuestionInfoText(**item))
            count += 1
        await db.commit()
        logger.info("Seeded %d question info texts", count)
        return count

    async def get_info_texts(
        self, db: Optional[AsyncSession], canton: str, tax_year: int
    ) -> Dict[str, Dict[str, Any]]:
        """Fetch all info texts for a canton and year, mapping key -> data."""
        if db is None:
            return {
                item["question_key"]: dict(item)
                for item in INITIAL_QUESTION_INFO_TEXTS
                if item["canton"] in (canton.upper(), "CH") and item["tax_year"] == tax_year
            }

        stmt = select(QuestionInfoText).where(
            (QuestionInfoText.canton == canton.upper()) | (QuestionInfoText.canton == "CH"),
            QuestionInfoText.tax_year == tax_year,
        )
        result = await db.execute(stmt)
        rows = result.scalars().all()

        output: Dict[str, Dict[str, Any]] = {}
        # First put CH fallbacks, then overwrite with canton-specific
        for r in rows:
            if r.canton == "CH" or r.question_key not in output:
                output[r.question_key] = {
                    "question_key": r.question_key,
                    "title_de": r.title_de,
                    "why_we_ask": r.why_we_ask,
                    "what_counts": r.what_counts,
                    "example": r.example,
                    "tip_text": r.tip_text,
                    "tip_type": r.tip_type,
                }
            elif r.canton == canton.upper():
                output[r.question_key] = {
                    "question_key": r.question_key,
                    "title_de": r.title_de,
                    "why_we_ask": r.why_we_ask,
                    "what_counts": r.what_counts,
                    "example": r.example,
                    "tip_text": r.tip_text,
                    "tip_type": r.tip_type,
                }

        # Fallback to in-memory defaults if DB is empty
        if not output:
            for item in INITIAL_QUESTION_INFO_TEXTS:
                if item["canton"] in (canton.upper(), "CH") and item["tax_year"] == tax_year:
                    output[item["question_key"]] = dict(item)

        return output


question_info_service = QuestionInfoService()
