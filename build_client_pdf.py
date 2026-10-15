#!/usr/bin/env python3
"""
SunTax Platform — Executive Client Handover & Demo Dossier PDF
Generates an executive, Swiss-themed PDF document detailing live URLs, GitHub repository,
APIs, database specifications, credentials, and step-by-step testing instructions.
"""

import os
import shutil
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether, HRFlowable
)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

SWISS_RED = colors.HexColor("#D52B1E")
DARK_SLATE = colors.HexColor("#0F172A")
TEXT_MUTED = colors.HexColor("#64748B")
BG_LIGHT = colors.HexColor("#F8FAFC")
BORDER_COLOR = colors.HexColor("#E2E8F0")
EMERALD_GREEN = colors.HexColor("#15803D")
BLUE_ACCENT = colors.HexColor("#1D4ED8")


class NumberedCanvas(canvas.Canvas):
    """Adds running headers and footers with total page counts."""
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
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(TEXT_MUTED)

        # Top Running Header (page 2+)
        if self._pageNumber > 1:
            self.drawString(36, 810, "SunTax CH — Client Handover & Testing Guide")
            self.drawRightString(559, 810, "CONFIDENTIAL")
            self.setStrokeColor(BORDER_COLOR)
            self.setLineWidth(0.5)
            self.line(36, 804, 559, 804)

        # Bottom Running Footer
        self.setStrokeColor(BORDER_COLOR)
        self.setLineWidth(0.5)
        self.line(36, 35, 559, 35)
        self.drawString(36, 24, "SunTax CH • Swiss Digital Tax Compliance Platform")
        self.drawRightString(559, 24, f"Page {self._pageNumber} of {total_pages}")
        self.restoreState()


def build_pdf(target_path: str):
    doc = SimpleDocTemplate(
        target_path,
        pagesize=A4,
        leftMargin=36,
        rightMargin=36,
        topMargin=40,
        bottomMargin=45,
    )

    styles = getSampleStyleSheet()

    # Custom typography styles
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=20,
        leading=24,
        textColor=DARK_SLATE,
    )

    tagline_style = ParagraphStyle(
        'Tagline',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=13,
        textColor=TEXT_MUTED,
    )

    section_heading = ParagraphStyle(
        'SectionHeading',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=16,
        textColor=DARK_SLATE,
        spaceBefore=10,
        spaceAfter=6,
    )

    body_style = ParagraphStyle(
        'BodyDark',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8.5,
        leading=12,
        textColor=DARK_SLATE,
    )

    body_bold = ParagraphStyle(
        'BodyBold',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=DARK_SLATE,
    )

    code_style = ParagraphStyle(
        'CodeText',
        parent=styles['Normal'],
        fontName='Courier',
        fontSize=8,
        leading=11,
        textColor=DARK_SLATE,
    )

    link_style = ParagraphStyle(
        'LinkText',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=8.5,
        leading=12,
        textColor=SWISS_RED,
    )

    callout_style = ParagraphStyle(
        'CalloutText',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        leading=12,
        textColor=colors.HexColor("#1E40AF"),
    )

    story = []

    # ── HEADER BANNER ──────────────────────────────────────────────────────────
    header_data = [
        [
            Paragraph("<b>SunTax</b> <font color='#D52B1E'><b>CH</b></font>", title_style),
            Paragraph("<b>Client Evaluation Release</b><br/><font color='#64748B'>Date: October 2026</font>", ParagraphStyle('HMeta', parent=body_style, alignment=2))
        ],
        [
            Paragraph("Next-Generation AI Swiss Tax Platform • System Architecture & Client Demo Handover", tagline_style),
            Paragraph("<font color='#15803D'><b>● Production Deployed</b></font>", ParagraphStyle('HMeta2', parent=body_style, alignment=2))
        ]
    ]
    header_table = Table(header_data, colWidths=[360, 163])
    header_table.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(header_table)
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=1.5, color=SWISS_RED, spaceBefore=4, spaceAfter=12))

    # ── SECTION 1: LIVE DEPLOYED URLS ──────────────────────────────────────────
    story.append(Paragraph("1. Live Cloud Endpoints", section_heading))

    endpoints_data = [
        [
            Paragraph("<b>Component / Service</b>", body_bold),
            Paragraph("<b>Live URL</b>", body_bold),
            Paragraph("<b>Technical Details & Description</b>", body_bold),
        ],
        [
            Paragraph("<b>Frontend Web Application</b><br/><font color='#15803D'>Vercel Production</font>", body_style),
            Paragraph("<font color='#D52B1E'><b>https://frontend-ruby-gamma-46.vercel.app/</b></font>", link_style),
            Paragraph("Next.js 14 App Router, TypeScript, responsive Swiss UI, live WebSocket updates.", body_style)
        ],
        [
            Paragraph("<b>Backend API Engine</b><br/><font color='#15803D'>Render Cloud Service</font>", body_style),
            Paragraph("<font color='#D52B1E'><b>https://suntax-api.onrender.com</b></font>", link_style),
            Paragraph("FastAPI core with deterministic Swiss tax calculator, PyMuPDF OCR, PyOTP.", body_style)
        ],
        [
            Paragraph("<b>Interactive Swagger UI</b><br/><font color='#64748B'>OpenAPI Documentation</font>", body_style),
            Paragraph("<font color='#D52B1E'><b>https://suntax-api.onrender.com/api/docs</b></font>", link_style),
            Paragraph("Interactive API testing sandbox for all authentication, document, and tax endpoints.", body_style)
        ],
        [
            Paragraph("<b>Technical Specification</b><br/><font color='#64748B'>ReDoc Specification</font>", body_style),
            Paragraph("<font color='#D52B1E'><b>https://suntax-api.onrender.com/api/redoc</b></font>", link_style),
            Paragraph("Comprehensive OpenAPI 3.0 schema definitions, payloads, and error codes.", body_style)
        ],
        [
            Paragraph("<b>System Health Check</b>", body_style),
            Paragraph("<font color='#D52B1E'><b>https://suntax-api.onrender.com/health</b></font>", link_style),
            Paragraph("Returns <code>{'status': 'ok', 'environment': 'production'}</code>.", code_style)
        ],
    ]

    t_endpoints = Table(endpoints_data, colWidths=[120, 210, 193])
    t_endpoints.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_LIGHT),
        ('TEXTCOLOR', (0, 0), (-1, 0), DARK_SLATE),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_endpoints)
    story.append(Spacer(1, 4))

    callout_data = [[
        Paragraph("<b>NOTE — Cloud Performance on Render Free Tier:</b> The backend operates on Render free instance. If the service has been idle, the initial request awakens the container in ~45-60 seconds. All subsequent operations execute at sub-150ms latency.", callout_style)
    ]]
    t_callout = Table(callout_data, colWidths=[523])
    t_callout.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor("#EFF6FF")),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor("#BFDBFE")),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(t_callout)
    story.append(Spacer(1, 8))

    # ── SECTION 2: GITHUB REPOSITORY ───────────────────────────────────────────
    story.append(Paragraph("2. GitHub Repository & Codebase Structure", section_heading))

    repo_data = [
        [
            Paragraph("<b>Repository Detail</b>", body_bold),
            Paragraph("<b>Configuration & URL</b>", body_bold),
            Paragraph("<b>Architecture Notes</b>", body_bold),
        ],
        [
            Paragraph("<b>GitHub Repository</b>", body_style),
            Paragraph("<font color='#D52B1E'><b>https://github.com/usamashaikh13/suntax</b></font>", link_style),
            Paragraph("Monorepo with dedicated <code>frontend/</code>, <code>backend/</code>, and <code>tax-rules/</code>.", body_style)
        ],
        [
            Paragraph("<b>Production Branch</b>", body_style),
            Paragraph("<code>main</code> (Synced & Fully Tested)", code_style),
            Paragraph("Continuous deployment triggered automatically on push to <code>main</code>.", body_style)
        ],
        [
            Paragraph("<b>Local Setup Helper</b>", body_style),
            Paragraph("<code>./backend/start_dev.sh</code>", code_style),
            Paragraph("Automates venv creation, dependency installation, and server startup.", body_style)
        ],
    ]
    t_repo = Table(repo_data, colWidths=[120, 210, 193])
    t_repo.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_LIGHT),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_repo)
    story.append(Spacer(1, 8))

    # ── SECTION 3: DATABASE ARCHITECTURE & FILES ──────────────────────────────
    story.append(Paragraph("3. Database Architecture & Database File", section_heading))

    db_data = [
        [
            Paragraph("<b>Database Layer</b>", body_bold),
            Paragraph("<b>File / Connection Target</b>", body_bold),
            Paragraph("<b>Description & Security Policy</b>", body_bold),
        ],
        [
            Paragraph("<b>Development DB File</b>", body_style),
            Paragraph("<code>backend/suntax_dev.db</code>", code_style),
            Paragraph("SQLite ACID database containing initialized user tables, tax returns, and profiles.", body_style)
        ],
        [
            Paragraph("<b>Production DB Engine</b>", body_style),
            Paragraph("PostgreSQL 16 (asyncpg)", code_style),
            Paragraph("Asynchronous connection pool with Alembic schema migration management.", body_style)
        ],
        [
            Paragraph("<b>Data Isolation</b>", body_style),
            Paragraph("Row Level Security (RLS)", code_style),
            Paragraph("User data strictly isolated; unauthorized cross-tenant queries blocked at DB layer.", body_style)
        ],
        [
            Paragraph("<b>Local Object Vault</b>", body_style),
            Paragraph("<code>backend/dev_storage/</code>", code_style),
            Paragraph("Local encrypted file vault mirroring S3/MinIO bucket layout with user-prefixed keys.", body_style)
        ],
    ]
    t_db = Table(db_data, colWidths=[120, 210, 193])
    t_db.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_LIGHT),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_db)

    # ── PAGE BREAK ─────────────────────────────────────────────────────────────
    story.append(PageBreak())

    # ── PAGE 2: DEMO ACCOUNTS & TESTING GUIDE ──────────────────────────────────
    story.append(Paragraph("4. Pre-Configured Demo Accounts", section_heading))

    accounts_data = [
        [
            Paragraph("<b>Account</b>", body_bold),
            Paragraph("<b>Email & Password</b>", body_bold),
            Paragraph("<b>2FA Security Status</b>", body_bold),
            Paragraph("<b>Authenticator Setup / Code Access</b>", body_bold),
        ],
        [
            Paragraph("<b>Primary Demo</b><br/>(Full 2FA Active)", body_style),
            Paragraph("<b>client@suntax.ch</b><br/><code>TestPassword123!</code>", body_style),
            Paragraph("<font color='#15803D'><b>● 2FA Active</b></font><br/>Required at Login &amp; Final Submission", body_style),
            Paragraph("<b>Key:</b> <code>OWZDANSQXHFBZXANGHT3ZKUYM2XW2AAV</code><br/>Or CLI: <code>.venv/bin/python get_2fa.py client@suntax.ch</code>", body_style)
        ],
        [
            Paragraph("<b>Secondary Demo</b><br/>(Standard Access)", body_style),
            Paragraph("<b>demo@suntax.ch</b><br/><code>TestPassword123!</code>", body_style),
            Paragraph("<font color='#1D4ED8'><b>○ Direct Login</b></font><br/>Ready for live 2FA setup demo", body_style),
            Paragraph("Can be used to demonstrate live 2FA QR code pairing in <em>My Account &rarr; Security</em>.", body_style)
        ],
    ]
    t_accounts = Table(accounts_data, colWidths=[100, 130, 120, 173])
    t_accounts.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_LIGHT),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_accounts)
    story.append(Spacer(1, 8))

    # ── SECTION 5: STEP-BY-STEP TESTING GUIDE ──────────────────────────────────
    story.append(Paragraph("5. Step-by-Step Client Testing Guide (5-Minute Verification)", section_heading))

    steps_data = [
        [
            Paragraph("<b>Step 1: Authenticate</b>", body_bold),
            Paragraph("Navigate to <code>/login</code> on Vercel or localhost. Log in with <b>client@suntax.ch</b>. Enter the 6-digit TOTP code from your mobile authenticator app (Google Authenticator / Apple Passwords).", body_style)
        ],
        [
            Paragraph("<b>Step 2: Create Declaration</b>", body_bold),
            Paragraph("Click <b>'+ New Tax Return'</b>. Select Canton <b>ZH (Zürich)</b>, Municipality <b>Zürich (BFS #261)</b>, and Tax Year <b>2025</b>. Click Confirm.", body_style)
        ],
        [
            Paragraph("<b>Step 3: Upload Documents</b>", body_bold),
            Paragraph("In the <b>Documents</b> tab, drag &amp; drop the test documents (Salary Certificate, UBS Bank Statement, Pillar 3a Certificate, Donation Receipt).", body_style)
        ],
        [
            Paragraph("<b>Step 4: Review OCR Data</b>", body_bold),
            Paragraph("Click <b>'Review Fields'</b> on any document marked Needs Review. Review the extracted figures and click <b>'Apply to Tax Profile'</b>.", body_style)
        ],
        [
            Paragraph("<b>Step 5: Compute Taxes</b>", body_bold),
            Paragraph("Switch to the <b>Calculation</b> tab and click <b>'Calculate Tax'</b>. Deterministic calculation resolves: Federal CHF 637, Canton CHF 1'852.40, Municipal CHF 2'204.35 (Total: CHF 4'693.75).", body_style)
        ],
        [
            Paragraph("<b>Step 6: Step-Up 2FA Submit</b>", body_bold),
            Paragraph("Under <b>Review &amp; Submit</b>, check the Art. 110 DBG declaration box. Click <b>'Confirm Tax Return Draft'</b>. Enter your 6-digit 2FA security code to seal and lock the filing.", body_style)
        ],
    ]
    t_steps = Table(steps_data, colWidths=[130, 393])
    t_steps.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_steps)
    story.append(Spacer(1, 8))

    # ── SECTION 6: CORE API ENDPOINTS REFERENCE ────────────────────────────────
    story.append(Paragraph("6. Key API Endpoints Reference", section_heading))

    api_data = [
        [
            Paragraph("<b>Method &amp; Path</b>", body_bold),
            Paragraph("<b>Endpoint Category</b>", body_bold),
            Paragraph("<b>Operational Description</b>", body_bold),
        ],
        [
            Paragraph("<code>POST /api/v1/auth/login</code>", code_style),
            Paragraph("Authentication", body_style),
            Paragraph("Validates email &amp; password. If 2FA enabled, issues temporary token for TOTP challenge.", body_style)
        ],
        [
            Paragraph("<code>POST /api/v1/auth/login/2fa</code>", code_style),
            Paragraph("2FA Challenge", body_style),
            Paragraph("Exchanges temporary token + 6-digit TOTP code for full-scope JWT access token.", body_style)
        ],
        [
            Paragraph("<code>GET  /api/v1/tax-returns</code>", code_style),
            Paragraph("Tax Filings", body_style),
            Paragraph("Retrieves paginated list of tax declarations owned by authenticated user.", body_style)
        ],
        [
            Paragraph("<code>POST /api/v1/tax-returns/{id}/calculate</code>", code_style),
            Paragraph("Deterministic Engine", body_style),
            Paragraph("Applies verified cantonal and federal tax brackets to user's TaxProfile.", body_style)
        ],
        [
            Paragraph("<code>POST /api/v1/tax-returns/{id}/confirm</code>", code_style),
            Paragraph("Legal Confirmation", body_style),
            Paragraph("Seals declaration under Art. 110 DBG; validates 6-digit 2FA code if TOTP enabled.", body_style)
        ],
        [
            Paragraph("<code>POST /api/v1/tax-returns/{id}/export/pdf</code>", code_style),
            Paragraph("Official Export", body_style),
            Paragraph("Generates complete official Swiss tax declaration summary PDF.", body_style)
        ],
    ]
    t_api = Table(api_data, colWidths=[180, 110, 233])
    t_api.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), BG_LIGHT),
        ('GRID', (0, 0), (-1, -1), 0.5, BORDER_COLOR),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, BG_LIGHT]),
    ]))
    story.append(t_api)

    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"Generated PDF: {target_path}")


if __name__ == "__main__":
    desktop_pdf = os.path.expanduser("~/Desktop/suntax_client_handover.pdf")
    docs_pdf = "/Users/osamashaikh/.gemini/antigravity/scratch/suntax/docs/suntax_client_handover.pdf"
    brain_pdf = "/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/suntax_client_handover.pdf"

    build_pdf(desktop_pdf)
    shutil.copyfile(desktop_pdf, docs_pdf)
    shutil.copyfile(desktop_pdf, brain_pdf)
    print("All copies generated and placed successfully!")
