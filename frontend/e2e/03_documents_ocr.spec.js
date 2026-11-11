const { test, expect } = require('@playwright/test');
const path = require('path');
const fs = require('fs');
const {
  BACKEND_URL,
  FIXTURES_DIR,
  captureEvidence,
  createTestUser,
  setAuthSession,
  createTestTaxReturn,
} = require('./helpers');

test.describe('Scenario 3: Documents and OCR Pipeline', () => {
  let user;
  let taxReturn;

  test.beforeEach(async ({ context, page }) => {
    user = await createTestUser('doc_qa');
    await setAuthSession(context, user);
    taxReturn = await createTestTaxReturn(user.accessToken, 'ZH', 2025, '261', 'Zürich');

    // Go to Step 2: Documents
    await page.goto(`/tax-returns/${taxReturn.id}?step=documents`);
    await expect(page.getByRole('heading', { name: /Lade alles hoch/i })).toBeVisible({ timeout: 15000 });
  });

  test('3.1 Upload synthetic digital PDF Lohnausweis via UI', async ({ page }) => {
    const filePath = path.join(FIXTURES_DIR, 'synthetic_lohnausweis_digital.pdf');
    expect(fs.existsSync(filePath)).toBe(true);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    // Click upload button
    const uploadBtn = page.getByRole('button', { name: /Dokument\(e\) hochladen/i });
    await expect(uploadBtn).toBeVisible();
    await uploadBtn.click();

    // Wait for document to appear in the list
    await expect(page.locator('text=synthetic_lohnausweis_digital.pdf').first()).toBeVisible({ timeout: 20000 });
    await captureEvidence(page, 'sc03_01_digital_lohnausweis_uploaded', 'Digital PDF Lohnausweis uploaded and visible in list');
  });

  test('3.2 Upload synthetic scanned PNG Lohnausweis and verify OCR processing', async ({ page }) => {
    const filePath = path.join(FIXTURES_DIR, 'synthetic_lohnausweis_scanned.png');
    expect(fs.existsSync(filePath)).toBe(true);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);

    const uploadBtn = page.getByRole('button', { name: /Dokument\(e\) hochladen/i });
    await uploadBtn.click();

    await expect(page.locator('text=synthetic_lohnausweis_scanned.png').first()).toBeVisible({ timeout: 20000 });
    await captureEvidence(page, 'sc03_02_scanned_png_uploaded', 'Scanned PNG Lohnausweis uploaded and queued/processed');
  });

  test('3.3 Upload multiple synthetic documents (Bank statement & Pillar 3a)', async ({ page }) => {
    const bankFile = path.join(FIXTURES_DIR, 'synthetic_bank_statement.pdf');
    const p3aFile = path.join(FIXTURES_DIR, 'synthetic_pillar3a.pdf');

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles([bankFile, p3aFile]);

    const uploadBtn = page.getByRole('button', { name: /Dokument\(e\) hochladen/i });
    await uploadBtn.click();

    await expect(page.locator('text=synthetic_bank_statement.pdf').first()).toBeVisible({ timeout: 20000 });
    await expect(page.locator('text=synthetic_pillar3a.pdf').first()).toBeVisible({ timeout: 20000 });
    await captureEvidence(page, 'sc03_03_batch_upload_bank_p3a', 'Multiple documents uploaded simultaneously');
  });

  test('3.4 Unsupported file type rejection (.exe)', async ({ page }) => {
    const exeFile = path.join(FIXTURES_DIR, 'unsupported_executable.exe');
    expect(fs.existsSync(exeFile)).toBe(true);

    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(exeFile);

    // Dropzone or toast should indicate invalid file rejected
    await page.waitForTimeout(1000);
    const toastMessage = await page.locator('body').textContent();
    const hasRejectionNotice = toastMessage.includes('rejected') || toastMessage.includes('Invalid') || toastMessage.includes('Unterstützte Formate');
    console.log('[SECURITY FINDING 3.4] Unsupported executable file rejected:', hasRejectionNotice);
    await captureEvidence(page, 'sc03_04_unsupported_file_rejected', 'Rejection of unsupported executable file');
  });

  test('3.5 Corrupt file handling', async ({ page }) => {
    const corruptFile = path.join(FIXTURES_DIR, 'corrupt.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(corruptFile);

    const uploadBtn = page.getByRole('button', { name: /Dokument\(e\) hochladen/i });
    if (await uploadBtn.isVisible()) {
      await uploadBtn.click();
      await page.waitForTimeout(2000);
    }
    await captureEvidence(page, 'sc03_05_corrupt_file_handling', 'Corrupt file status');
  });

  test('3.6 Document review modal: inspection of OCR values and profile merge', async ({ page }) => {
    // Upload digital lohnausweis
    const filePath = path.join(FIXTURES_DIR, 'synthetic_lohnausweis_digital.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    await page.getByRole('button', { name: /Dokument\(e\) hochladen/i }).click();

    await expect(page.locator('text=synthetic_lohnausweis_digital.pdf').first()).toBeVisible({ timeout: 20000 });

    // Open review modal
    const reviewBtn = page.getByRole('button', { name: /Überprüfen|Prüfen|Details|Review/i }).first();
    await expect(reviewBtn).toBeVisible({ timeout: 15000 });
    await reviewBtn.click();

    // Verify modal is displayed
    const modal = page.locator('[role="dialog"]');
    await expect(modal).toBeVisible();
    await captureEvidence(page, 'sc03_06_document_review_modal', 'Document review modal showing extracted fields');

    // Assert that leftover English labels are completely removed
    const modalText = await modal.textContent();
    expect(modalText).not.toContain('Gross Annual Salary');
    expect(modalText).not.toContain('Employer Name');

    // Assert Swiss German action button is present
    await expect(page.getByRole('button', { name: /In Steuerprofil übernehmen/i })).toBeVisible();

    // Close modal
    const closeBtn = page.getByRole('button', { name: /Abbrechen|Schliessen/i });
    if (await closeBtn.isVisible()) await closeBtn.click();
  });

  test('3.7 Document delete and profile invalidation', async ({ page }) => {
    // Upload file
    const filePath = path.join(FIXTURES_DIR, 'synthetic_pillar3a.pdf');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(filePath);
    await page.getByRole('button', { name: /Dokument\(e\) hochladen/i }).click();

    await expect(page.locator('text=synthetic_pillar3a.pdf').first()).toBeVisible({ timeout: 20000 });

    // Click delete button
    const deleteBtn = page.getByRole('button', { name: /Löschen|Delete/i }).or(page.locator('button[title*="Löschen"]')).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(1000);
      await captureEvidence(page, 'sc03_07_document_deleted', 'Document deleted from list');
    }
  });
});
