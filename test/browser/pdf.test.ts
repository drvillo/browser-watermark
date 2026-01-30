import { describe, it, expect } from 'vitest';
import { watermark, verify } from '../../src/index';
import { PDFDocument, rgb } from 'pdf-lib';

async function createTestPdf(pageCount: number = 1): Promise<Blob> {
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    page.drawText(`Page ${i + 1}`, {
      x: 50,
      y: 750,
      size: 30,
      color: rgb(0, 0, 0),
    });
    // Add some content to make it more realistic
    page.drawRectangle({
      x: 50,
      y: 50,
      width: 512,
      height: 692,
      borderColor: rgb(0.5, 0.5, 0.5),
      borderWidth: 2,
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

describe('PDF Watermarking', () => {
  it('should watermark a single-page PDF', async () => {
    const pdfBlob = await createTestPdf(1);

    const result = await watermark(pdfBlob, 'test-payload');

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.pageCount).toBe(1);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('should watermark a multi-page PDF', async () => {
    const pdfBlob = await createTestPdf(3);

    const result = await watermark(pdfBlob, 'multi-page-test');

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.pageCount).toBe(3);
  });

  it('should handle page selection "first" for visible watermark', async () => {
    const pdfBlob = await createTestPdf(3);

    const result = await watermark(pdfBlob, 'first-page-test', {
      pdf: { pageSelection: 'first' },
      visible: { enabled: true },
    });

    expect(result.pageCount).toBe(3);
  });

  it('should handle page selection array for visible watermark', async () => {
    const pdfBlob = await createTestPdf(5);

    const result = await watermark(pdfBlob, 'selective-pages-test', {
      pdf: { pageSelection: [0, 2, 4] },
      visible: { enabled: true },
    });

    expect(result.pageCount).toBe(5);
  });

  it('should handle page selection range for visible watermark', async () => {
    const pdfBlob = await createTestPdf(5);

    const result = await watermark(pdfBlob, 'range-test', {
      pdf: { pageSelection: { from: 1, to: 3 } },
      visible: { enabled: true },
    });

    expect(result.pageCount).toBe(5);
  });

  it('should verify a watermarked PDF', async () => {
    const pdfBlob = await createTestPdf(1);

    const watermarked = await watermark(pdfBlob, 'verify-test');
    const verification = await verify(watermarked.blob, 'verify-test');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.85);
  });

  it('should verify a multi-page PDF', async () => {
    const pdfBlob = await createTestPdf(3);

    const watermarked = await watermark(pdfBlob, 'multi-page-verify-test');
    const verification = await verify(watermarked.blob, 'multi-page-verify-test');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.85);
  });

  it('should reject wrong payload for PDF', async () => {
    const pdfBlob = await createTestPdf(1);

    const watermarked = await watermark(pdfBlob, 'payload1');
    const verification = await verify(watermarked.blob, 'payload2');

    expect(verification.isMatch).toBe(false);
  });

  it('should fail verification for PDF without carrier', async () => {
    const pdfBlob = await createTestPdf(1);
    const verification = await verify(pdfBlob, 'any-payload');

    expect(verification.isMatch).toBe(false);
    expect(verification.confidence).toBe(0);
    expect(verification.error).toBe('No watermark carrier found');
  });

  it('should handle round-trip PDF watermarking', async () => {
    const pdfBlob = await createTestPdf(1);

    const watermarked = await watermark(pdfBlob, 'round-trip-pdf-test');
    const verification = await verify(watermarked.blob, 'round-trip-pdf-test');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.85);
  });

});
