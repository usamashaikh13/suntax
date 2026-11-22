const fs = require('fs');
const path = require('path');
const { chromium } = require(path.resolve('/Users/osamashaikh/.gemini/antigravity/scratch/suntax/frontend/node_modules/@playwright/test'));

const MD_PATH = '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/docs/SunTax_Milestone_2_Document_Processing_Handover.md';
const DOCS_DIR = '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/docs';
const PDF_OUTPUT_DOCS = '/Users/osamashaikh/.gemini/antigravity/scratch/suntax/docs/SunTax_Milestone_2_Document_Processing_Handover.pdf';
const PDF_OUTPUT_BRAIN = '/Users/osamashaikh/.gemini/antigravity/brain/b9c7cd63-97a4-416c-af83-0fa8d84d8782/SunTax_Milestone_2_Document_Processing_Handover.pdf';

function convertMarkdownToHtml(md) {
  let html = md;

  // Replace images with Base64 embedded images
  html = html.replace(/!\[([^\]]*)\]\((([^\)]+)\.(?:png|jpg|jpeg|svg))\)/gi, (match, alt, relPath) => {
    let imgPath = path.resolve(DOCS_DIR, relPath);
    if (!fs.existsSync(imgPath)) {
      imgPath = path.resolve('/Users/osamashaikh/.gemini/antigravity/scratch/suntax', relPath);
    }
    if (fs.existsSync(imgPath)) {
      const b64 = fs.readFileSync(imgPath).toString('base64');
      const ext = path.extname(imgPath).toLowerCase().replace('.', '') || 'png';
      const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext}`;
      return `<div class="screenshot-container">
        <div class="screenshot-title">📷 ${alt || path.basename(relPath)}</div>
        <img src="data:${mime};base64,${b64}" alt="${alt}" class="screenshot-img" />
      </div>`;
    }
    return `<div class="screenshot-container">[Image: ${alt}]</div>`;
  });

  // Callouts
  html = html.replace(/> \[!IMPORTANT\]\n> ([\s\S]*?)(?=\n\n|\n[#>-]|$)/g, (m, content) => {
    return `<div class="callout callout-important">
      <div class="callout-header">⚠️ IMPORTANT</div>
      <div class="callout-body">${content.replace(/^> /gm, '')}</div>
    </div>`;
  });

  html = html.replace(/> \[!NOTE\]\n> ([\s\S]*?)(?=\n\n|\n[#>-]|$)/g, (m, content) => {
    return `<div class="callout callout-note">
      <div class="callout-header">ℹ️ NOTE</div>
      <div class="callout-body">${content.replace(/^> /gm, '')}</div>
    </div>`;
  });

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, (m, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Headers
  html = html.replace(/^# (.*$)/gim, '<h1 class="doc-h1">$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2 class="doc-h2">$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3 class="doc-h3">$1</h3>');

  // Tables
  html = html.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
    const lines = match.trim().split('\n').filter(l => !l.includes('---'));
    if (lines.length === 0) return '';
    const headers = lines[0].split('|').slice(1, -1).map(c => `<th>${c.trim()}</th>`).join('');
    const rows = lines.slice(1).map(line => {
      const cells = line.split('|').slice(1, -1).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table class="doc-table"><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Lists
  html = html.replace(/^\- (.*$)/gim, '<li>$1</li>');
  html = html.replace(/(<li>[\s\S]*?<\/li>)/gim, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/gim, '');

  // Bold & Italic
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // Paragraphs
  html = html.split('\n\n').map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<h') || p.startsWith('<table') || p.startsWith('<pre') || p.startsWith('<div') || p.startsWith('<ul') || p.startsWith('---')) {
      return p;
    }
    return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
  }).join('\n\n');

  return html;
}

async function generatePdf() {
  console.log('Reading Markdown manual...');
  const mdContent = fs.readFileSync(MD_PATH, 'utf-8');
  const bodyHtml = convertMarkdownToHtml(mdContent);

  const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>SunTax Milestone 2 Client Handover</title>
<style>
  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
    @top-right {
      content: "SunTax — Client Handover Package";
      font-size: 8pt;
      color: #64748B;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    @bottom-center {
      content: "Page " counter(page) " of " counter(pages);
      font-size: 8pt;
      color: #64748B;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
  }

  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #0F172A;
    line-height: 1.5;
    font-size: 9.5pt;
    background-color: #FFFFFF;
    margin: 0;
    padding: 0;
  }

  .doc-h1 {
    color: #1E7B52;
    font-size: 19pt;
    font-weight: 800;
    margin-top: 0;
    margin-bottom: 4px;
    letter-spacing: -0.5px;
  }

  .doc-h2 {
    color: #0F172A;
    font-size: 12.5pt;
    font-weight: 700;
    border-bottom: 1.5px solid #1E7B52;
    padding-bottom: 4px;
    margin-top: 22px;
    margin-bottom: 10px;
    page-break-after: avoid;
  }

  .doc-h3 {
    color: #1E7B52;
    font-size: 10.5pt;
    font-weight: 700;
    margin-top: 16px;
    margin-bottom: 6px;
    page-break-after: avoid;
  }

  p {
    margin-top: 0;
    margin-bottom: 9px;
  }

  ul {
    margin-top: 0;
    margin-bottom: 11px;
    padding-left: 20px;
  }

  li {
    margin-bottom: 4px;
  }

  .doc-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 10px;
    margin-bottom: 16px;
    font-size: 8.5pt;
    page-break-inside: avoid;
  }

  .doc-table th {
    background-color: #F1F5F9;
    color: #0F172A;
    font-weight: 700;
    text-align: left;
    padding: 6px 10px;
    border: 1px solid #CBD5E1;
  }

  .doc-table td {
    padding: 6px 10px;
    border: 1px solid #E2E8F0;
    vertical-align: top;
  }

  .doc-table tr:nth-child(even) td {
    background-color: #F8FAFC;
  }

  .callout {
    border-radius: 6px;
    padding: 10px 14px;
    margin: 14px 0;
    page-break-inside: avoid;
  }

  .callout-important {
    background-color: #FEF2F2;
    border-left: 4px solid #EF4444;
  }

  .callout-important .callout-header {
    color: #B91C1C;
    font-weight: 700;
    font-size: 9pt;
    margin-bottom: 4px;
  }

  .callout-note {
    background-color: #F0FDF4;
    border-left: 4px solid #1E7B52;
  }

  .callout-note .callout-header {
    color: #1E7B52;
    font-weight: 700;
    font-size: 9pt;
    margin-bottom: 4px;
  }

  pre {
    background-color: #0F172A;
    color: #F8FAFC;
    padding: 10px 14px;
    border-radius: 6px;
    font-family: "SF Mono", Monaco, Consolas, monospace;
    font-size: 7.5pt;
    line-height: 1.4;
    overflow-x: auto;
    page-break-inside: avoid;
    margin: 12px 0;
  }

  .inline-code {
    background-color: #F1F5F9;
    color: #0F172A;
    padding: 2px 5px;
    border-radius: 4px;
    font-family: "SF Mono", Monaco, Consolas, monospace;
    font-size: 8pt;
    border: 1px solid #E2E8F0;
  }

  .screenshot-container {
    margin: 14px 0;
    padding: 10px;
    background-color: #F8FAFC;
    border: 1px solid #E2E8F0;
    border-radius: 8px;
    text-align: center;
    page-break-inside: avoid;
  }

  .screenshot-title {
    font-size: 8pt;
    font-weight: 600;
    color: #475569;
    margin-bottom: 6px;
    text-align: left;
  }

  .screenshot-img {
    max-width: 100%;
    max-height: 155mm;
    border: 1px solid #CBD5E1;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  }

  hr {
    border: 0;
    height: 1px;
    background: #E2E8F0;
    margin: 18px 0;
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  console.log('Launching browser to render PDF...');
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setContent(fullHtml, { waitUntil: 'load' });
  await page.waitForTimeout(1000);

  console.log('Printing PDF...');
  await page.pdf({
    path: PDF_OUTPUT_DOCS,
    format: 'A4',
    margin: {
      top: '18mm',
      bottom: '18mm',
      left: '15mm',
      right: '15mm'
    },
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: `<div style="width: 100%; font-size: 8pt; color: #64748b; padding: 0 15mm; display: flex; justify-content: space-between; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
      <span>SunTax — Client Handover Package</span>
      <span>Confidential · Staging Demo Only</span>
    </div>`,
    footerTemplate: `<div style="width: 100%; font-size: 8pt; color: #64748b; padding: 0 15mm; display: flex; justify-content: space-between; font-family: -apple-system, BlinkMacSystemFont, sans-serif;">
      <span>Milestone 2 & System Delivery</span>
      <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
    </div>`
  });

  fs.copyFileSync(PDF_OUTPUT_DOCS, PDF_OUTPUT_BRAIN);
  await browser.close();

  const stats = fs.statSync(PDF_OUTPUT_DOCS);
  console.log(`[OK] PDF Generated successfully: ${PDF_OUTPUT_DOCS} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
}

generatePdf().catch(console.error);
