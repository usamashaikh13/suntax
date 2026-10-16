#!/usr/bin/env python3
"""
SunTax — Client Handover & Testing Guide
A clean, professional 2-page document prepared for client review.
Written in natural, human-friendly language with clean typography and spacing.
"""

import os
import shutil
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Palette: Clean, restrained corporate palette
SWISS_RED = colors.HexColor("#D52B1E")
TEXT_PRIMARY = colors.HexColor("#1E293B")      # Slate 800
TEXT_SECONDARY = colors.HexColor("#475569")    # Slate 600
TEXT_MUTED = colors.HexColor("#64748B")        # Slate 500
BORDER_COLOR = colors.HexColor("#E2E8F0")      # Slate 200
BG_CARD = colors.HexColor("#F8FAFC")           # Slate 50
BG_CALLOUT = colors.HexColor("#F1F5F9")        # Slate 100
LINK_BLUE = colors.HexColor("#0284C7")         # Sky 600
CODE_COLOR = colors.HexColor("#0F172A")        # Slate 900


class CleanNumberedCanvas(canvas.Canvas):
    """Clean running footer with page count and document title."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_decorations(self, total_pages):
        self.saveState()
        self.setFont("Helvetica", 8.5)
        self.setFillColor(TEXT_MUTED)

        # Header on page 2
        if self._pageNumber > 1:
            self.drawString(40, 808, "SunTax — Client Handover & Testing Guide")
            self.drawRightString(555, 808, "October 2026")
            self.setStrokeColor(BORDER_COLOR)
            self.setLineWidth(0.5)
            self.line(40, 802, 555, 802)

        # Footer on all pages
        self.setStrokeColor(BORDER_COLOR)
        self.setLineWidth(0.5)
        self.line(40, 36, 555, 36)
        self.drawString(40, 24, "SunTax • Swiss Digital Tax Platform")
        self.drawRightString(555, 24, f"Page {self._pageNumber} of {total_pages}")
        self.restoreState()


def build_pdf(target_path: str):
    doc = SimpleDocTemplate(
        target_path,
        pagesize=A4,
        leftMargin=40,
        rightMargin=40,
        topMargin=38,
        bottomMargin=42,
    )

    styles = getSampleStyleSheet()

    # Clean, human typography
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=TEXT_PRIMARY,
    )

    subtitle_style = ParagraphStyle(
        'DocSubtitle',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=10,
        leading=14,
        textColor=TEXT_SECONDARY,
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=TEXT_PRIMARY,
        spaceBefore=12,
        spaceAfter=5,
    )

    sub_heading = ParagraphStyle(
        'SubHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9.5,
        leading=13,
        textColor=TEXT_PRIMARY,
        spaceBefore=7,
        spaceAfter=3,
    )

    body = ParagraphStyle(
        'Body',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=TEXT_PRIMARY,
    )

    body_secondary = ParagraphStyle(
        'BodySecondary',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=TEXT_SECONDARY,
    )

    body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=TEXT_PRIMARY,
    )

    code_font = ParagraphStyle(
        'CodeFont',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=7.8,
        leading=10.5,
        textColor=CODE_COLOR,
    )

    callout_text = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=11.5,
        textColor=TEXT_SECONDARY,
    )

    story = []

    # ══════════════════════════════════════════════════════════════════════════════
    # PAGE 1: OVERVIEW, LIVE LINKS, TEST ACCOUNTS, TESTING STEPS
    # ══════════════════════════════════════════════════════════════════════════════

    # Document Header
    header_table = Table([
        [
            Paragraph("<b>SunTax</b> <font color='#D52B1E'><b>CH</b></font>", title_style),
            Paragraph("<b>Client Handover & Testing Guide</b><br/><font color='#64748B'>Version 1.0 • October 2026</font>", ParagraphStyle('HRight', parent=body, alignment=2))
        ]
    ], colWidths=[335, 180])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1, color=SWISS_RED, spaceBefore=3, spaceAfter=8))

    # Friendly human intro
    intro_p = Paragraph(
        "Hi team, here is a quick overview of the <b>SunTax</b> platform for your testing and review. "
        "This guide covers where the application is hosted, the test accounts you can use, a simple 5-step walkthrough "
        "to test the full declaration flow, and our recommendations for production deployment and storage in Switzerland.",
        body
    )
    story.append(intro_p)
    story.append(Spacer(1, 4))

    # SECTION 1: LIVE APPLICATION LINKS
    story.append(Paragraph("1. Live Deployment & Repository Links", section_heading))

    links_table_data = [
        [
            Paragraph("<b>Component</b>", body_bold),
            Paragraph("<b>URL / Location</b>", body_bold),
            Paragraph("<b>Notes</b>", body_bold)
        ],
        [
            Paragraph("<b>Web App (Frontend)</b>", body),
            Paragraph("<font color='#0284C7'><b>https://frontend-ruby-gamma-46.vercel.app/</b></font>", body),
            Paragraph("Hosted on Vercel. Fully responsive across desktop and mobile.", body_secondary)
        ],
        [
            Paragraph("<b>Backend API</b>", body),
            Paragraph("<font color='#0284C7'><b>https://suntax-api.onrender.com</b></font>", body),
            Paragraph("FastAPI service handling calculations, OCR, and user sessions.", body_secondary)
        ],
        [
            Paragraph("<b>API Docs (Swagger)</b>", body),
            Paragraph("<font color='#0284C7'><b>https://suntax-api.onrender.com/api/docs</b></font>", body),
            Paragraph("Interactive API explorer to inspect all endpoints and test requests.", body_secondary)
        ],
        [
            Paragraph("<b>GitHub Repository</b>", body),
            Paragraph("<font color='#0284C7'><b>https://github.com/usamashaikh13/suntax</b></font>", body),
            Paragraph("Full codebase: Next.js frontend, Python backend, and Swiss tax rules.", body_secondary)
        ]
    ]
    t_links = Table(links_table_data, colWidths=[120, 225, 170])
    t_links.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_CARD]),
    ]))
    story.append(t_links)
    story.append(Spacer(1, 3))

    # Helpful note about Render spinup
    note_box = Table([[
        Paragraph("<b>Note on initial loading:</b> The backend is currently running on Render's free tier. If the server has been idle, the very first request takes roughly 45–60 seconds to spin up. All subsequent clicks and API calls will respond immediately.", callout_text)
    ]], colWidths=[515])
    note_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), BG_CALLOUT),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(note_box)
    story.append(Spacer(1, 4))

    # SECTION 2: TEST ACCOUNTS
    story.append(Paragraph("2. Demo Accounts & Logins", section_heading))

    accounts_data = [
        [
            Paragraph("<b>Account</b>", body_bold),
            Paragraph("<b>Credentials</b>", body_bold),
            Paragraph("<b>2FA Setup & Access</b>", body_bold)
        ],
        [
            Paragraph("<b>Primary Test Account</b><br/><font color='#64748B'>Full 2FA enabled</font>", body),
            Paragraph("<b>Email:</b> client@suntax.ch<br/><b>Password:</b> TestPassword123!", body),
            Paragraph("Requires a 6-digit 2FA code.<br/>• <b>Authenticator Key:</b> <code>OWZDANSQXHFBZXANGHT3ZKUYM2XW2AAV</code><br/>• Or run: <code>python get_2fa.py client@suntax.ch</code>", body_secondary)
        ],
        [
            Paragraph("<b>Standard Demo Account</b><br/><font color='#64748B'>Direct sign-in</font>", body),
            Paragraph("<b>Email:</b> demo@suntax.ch<br/><b>Password:</b> TestPassword123!", body),
            Paragraph("Logs in directly without 2FA prompt. You can test setting up 2FA on your phone from <i>My Account → Security</i>.", body_secondary)
        ]
    ]
    t_accounts = Table(accounts_data, colWidths=[120, 165, 230])
    t_accounts.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 4.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_CARD]),
    ]))
    story.append(t_accounts)
    story.append(Spacer(1, 4))

    # SECTION 3: STEP-BY-STEP TESTING GUIDE
    story.append(Paragraph("3. How to Test the Application (5-Step Walkthrough)", section_heading))

    steps_data = [
        [
            Paragraph("<b>1. Sign In</b>", body_bold),
            Paragraph("Go to the live web app and log in with <b>client@suntax.ch</b> / <b>TestPassword123!</b>. Enter the 6-digit code from your authenticator app when prompted.", body)
        ],
        [
            Paragraph("<b>2. Start Return</b>", body_bold),
            Paragraph("On your dashboard, click <b>+ New Tax Return</b>. Select Canton <b>ZH (Zürich)</b>, Municipality <b>Zürich (BFS #261)</b>, and Tax Year <b>2025</b>, then click confirm.", body)
        ],
        [
            Paragraph("<b>3. Upload Documents</b>", body_bold),
            Paragraph("In the <b>Documents</b> tab, drag and drop test documents (e.g. Salary Certificate, Bank Statement, Pillar 3a Certificate, or Donation Receipt). The OCR worker extracts financial data automatically.", body)
        ],
        [
            Paragraph("<b>4. Review Extracted Data</b>", body_bold),
            Paragraph("Click <b>Review Fields</b> on any processed document to verify the extracted figures, then click <b>Approve & Apply to Profile</b> to save them to your tax declaration.", body)
        ],
        [
            Paragraph("<b>5. Calculate & Submit</b>", body_bold),
            Paragraph("Go to the <b>Calculation</b> tab to run the official Swiss tax engine (Federal, Cantonal, and Municipal breakdown). When ready, proceed to <b>Review & Submit</b> and finalize the declaration.", body)
        ]
    ]
    t_steps = Table(steps_data, colWidths=[95, 420])
    t_steps.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 3.5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3.5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, BG_CARD]),
    ]))
    story.append(t_steps)

    # PAGE BREAK TO PAGE 2
    story.append(PageBreak())

    # ══════════════════════════════════════════════════════════════════════════════
    # PAGE 2: DATABASE, APIS, HOSTING & STORAGE RECOMMENDATIONS
    # ══════════════════════════════════════════════════════════════════════════════

    # SECTION 4: DATABASE & CODEBASE ARCHITECTURE
    story.append(Paragraph("4. Database & Codebase Details", section_heading))

    db_details = [
        "<b>Local SQLite Database:</b> Located at <code>backend/suntax_dev.db</code>. It comes pre-seeded with tax rules for initial cantons, test user accounts, and sample declarations so the app works out-of-the-box locally.",
        "<b>Production PostgreSQL 16:</b> In production, the system connects via asyncpg and uses Row-Level Security (RLS) policies. Each user's documents and declarations are isolated at the database level.",
        "<b>Document File Storage:</b> Uploaded files are stored in <code>backend/dev_storage/</code> during development (mirroring an S3 bucket structure with user-prefixed paths). In production, this maps to an S3-compatible bucket.",
        "<b>Running Locally:</b> Simply run <code>./backend/start_dev.sh</code> to create the Python virtualenv and start the backend, and <code>npm run dev</code> inside <code>frontend/</code> to run the web interface."
    ]
    for d in db_details:
        story.append(Paragraph(f"• {d}", body))
        story.append(Spacer(1, 2))

    story.append(Spacer(1, 4))

    # SECTION 5: KEY API ENDPOINTS
    story.append(Paragraph("5. Core API Endpoints Reference", section_heading))

    api_data = [
        [Paragraph("<b>Endpoint</b>", body_bold), Paragraph("<b>Method</b>", body_bold), Paragraph("<b>Purpose</b>", body_bold)],
        [Paragraph("<code>/api/v1/auth/login</code>", code_font), Paragraph("POST", body), Paragraph("User authentication; returns JWT token or 2FA challenge", body_secondary)],
        [Paragraph("<code>/api/v1/auth/login/2fa</code>", code_font), Paragraph("POST", body), Paragraph("Validates 6-digit TOTP code and returns full session token", body_secondary)],
        [Paragraph("<code>/api/v1/tax-returns</code>", code_font), Paragraph("GET / POST", body), Paragraph("Lists all user tax returns or creates a new draft declaration", body_secondary)],
        [Paragraph("<code>/api/v1/documents/upload</code>", code_font), Paragraph("POST", body), Paragraph("Uploads tax documents, generates hash, and triggers OCR pipeline", body_secondary)],
        [Paragraph("<code>/api/v1/tax-returns/{id}/calculate</code>", code_font), Paragraph("POST", body), Paragraph("Runs deterministic Swiss tax calculation for federal, canton & city", body_secondary)],
        [Paragraph("<code>/api/v1/tax-returns/{id}/confirm</code>", code_font), Paragraph("POST", body), Paragraph("Finalizes the tax declaration with 2FA verification", body_secondary)],
        [Paragraph("<code>/api/v1/tax-returns/{id}/export/pdf</code>", code_font), Paragraph("POST", body), Paragraph("Generates official tax declaration summary PDF for download", body_secondary)],
    ]
    t_api = Table(api_data, colWidths=[185, 55, 275])
    t_api.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 5),
        ('RIGHTPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_CARD]),
    ]))
    story.append(t_api)
    story.append(Spacer(1, 5))

    # SECTION 6: STORAGE & HOSTING RECOMMENDATIONS
    story.append(Paragraph("6. Production Hosting & Storage Recommendations", section_heading))

    story.append(Paragraph(
        "Swiss tax declarations contain sensitive personal and financial information. When moving to production, "
        "infrastructure choices should comply with the <b>Swiss Federal Act on Data Protection (FADP / nDSG)</b> "
        "and ensure data stays within Switzerland.",
        body
    ))
    story.append(Spacer(1, 3))

    # Document Storage
    story.append(Paragraph("A. Document Storage (Tax Certificates & PDFs)", sub_heading))
    storage_points = [
        "<b>Top Recommendation — Infomaniak Swiss S3 (Geneva / Winterthur):</b> 100% Swiss company and infrastructure, ISO 27001 certified, and immune to foreign laws like the US Cloud Act. Costs around CHF 0.012 / GB / month with no egress fees.",
        "<b>Alternative — Exoscale Object Storage (Zürich / Geneva):</b> Enterprise Swiss cloud provider built for financial institutions. Fully S3-compatible with high speed and zero bandwidth fees inside the Swiss zone.",
        "<b>Enterprise Standard — AWS S3 Zürich (eu-central-2):</b> A reliable option if your team already operates on AWS. Guarantees Swiss data residency and supports customer-managed encryption keys (KMS)."
    ]
    for p in storage_points:
        story.append(Paragraph(f"• {p}", body_secondary))
        story.append(Spacer(1, 1.5))

    story.append(Spacer(1, 3))

    # App & Database Hosting
    story.append(Paragraph("B. Application & Database Hosting", sub_heading))
    hosting_points = [
        "<b>Frontend Web App — Vercel Pro (~$20 / mo):</b> Provides global edge delivery, automatic HTTPS, preview builds for PRs, and fast load times for Swiss users with zero server maintenance.",
        "<b>Backend API & OCR Worker — Exoscale Cloud VPS or SKS (Zürich, ~CHF 38 / mo):</b> Runs the FastAPI backend and document OCR processes directly on servers in Zürich, keeping all data processing in Switzerland.",
        "<b>Database — Exoscale Managed PostgreSQL 16 (Zürich, ~CHF 45 / mo):</b> Managed database with automatic daily backups, point-in-time recovery, and encryption at rest."
    ]
    for p in hosting_points:
        story.append(Paragraph(f"• {p}", body_secondary))
        story.append(Spacer(1, 1.5))

    story.append(Spacer(1, 4))

    # Budget Table
    story.append(Paragraph("C. Recommended Production Stack & Estimated Monthly Cost", sub_heading))
    cost_data = [
        [Paragraph("<b>Component</b>", body_bold), Paragraph("<b>Provider & Region</b>", body_bold), Paragraph("<b>Est. Cost</b>", body_bold)],
        [Paragraph("Frontend Web App", body), Paragraph("Vercel Pro (Global Edge)", body_secondary), Paragraph("~$20 / mo", body)],
        [Paragraph("Backend API & Worker", body), Paragraph("Exoscale Cloud VPS (Zürich, Switzerland)", body_secondary), Paragraph("~CHF 38 / mo", body)],
        [Paragraph("Managed PostgreSQL", body), Paragraph("Exoscale Managed DB (Zürich, Switzerland)", body_secondary), Paragraph("~CHF 45 / mo", body)],
        [Paragraph("Secure Document Vault", body), Paragraph("Infomaniak Swiss S3 (Geneva / Winterthur)", body_secondary), Paragraph("~CHF 5–10 / mo", body)],
        [Paragraph("<b>Total Monthly Cost</b>", body_bold), Paragraph("<b>100% Swiss Data Residency Stack</b>", body_bold), Paragraph("<b>~CHF 110–120 / mo</b>", body_bold)],
    ]
    t_cost = Table(cost_data, colWidths=[150, 245, 120])
    t_cost.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_CARD),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ROWBACKGROUNDS', (0, 1), (-1, -2), [colors.white, BG_CARD]),
        ('BACKGROUND', (0, -1), (-1, -1), BG_CALLOUT),
    ]))
    story.append(t_cost)

    # Build document
    doc.build(story, canvasmaker=CleanNumberedCanvas)


if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    dist_paths = [
        os.path.join(current_dir, "docs", "suntax_client_handover.pdf"),
        "/Users/osamashaikh/Desktop/suntax_client_handover.pdf",
        "/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/suntax_client_handover.pdf",
    ]

    primary_target = dist_paths[0]
    os.makedirs(os.path.dirname(primary_target), exist_ok=True)
    build_pdf(primary_target)
    print(f"Generated clean PDF: {primary_target}")

    for p in dist_paths[1:]:
        shutil.copyfile(primary_target, p)
        print(f"Copied to: {p}")
