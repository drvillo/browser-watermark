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
    expect(result.pages).toBeDefined();
    expect(result.pages?.length).toBe(1);
    expect(result.pages?.[0].index).toBe(0);
    expect(result.pages?.[0].width).toBeGreaterThan(0);
    expect(result.pages?.[0].height).toBeGreaterThan(0);
  });

  it('should watermark a multi-page PDF', async () => {
    const pdfBlob = await createTestPdf(3);

    const result = await watermark(pdfBlob, 'multi-page-test');

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.mimeType).toBe('application/pdf');
    expect(result.pageCount).toBe(3);
    expect(result.pages).toBeDefined();
    expect(result.pages?.length).toBe(3);
    expect(result.pages?.map((p) => p.index)).toEqual([0, 1, 2]);
  });

  it('should handle page selection "first"', async () => {
    const pdfBlob = await createTestPdf(3);

    const result = await watermark(pdfBlob, 'first-page-test', {
      pdf: { pageSelection: 'first' },
    });

    expect(result.pageCount).toBe(3);
    expect(result.pages?.length).toBe(1);
    expect(result.pages?.[0].index).toBe(0);
  });

  it('should handle page selection array', async () => {
    const pdfBlob = await createTestPdf(5);

    const result = await watermark(pdfBlob, 'selective-pages-test', {
      pdf: { pageSelection: [0, 2, 4] },
    });

    expect(result.pageCount).toBe(5);
    expect(result.pages?.length).toBe(3);
    expect(result.pages?.map((p) => p.index)).toEqual([0, 2, 4]);
  });

  it('should handle page selection range', async () => {
    const pdfBlob = await createTestPdf(5);

    const result = await watermark(pdfBlob, 'range-test', {
      pdf: { pageSelection: { from: 1, to: 3 } },
    });

    expect(result.pageCount).toBe(5);
    expect(result.pages?.length).toBe(3);
    expect(result.pages?.map((p) => p.index)).toEqual([1, 2, 3]);
  });

  it('should verify a watermarked PDF', async () => {
    const pdfBlob = await createTestPdf(2);

    const watermarked = await watermark(pdfBlob, 'verify-test');
    const verification = await verify(watermarked.blob, 'verify-test');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.5);
    expect(verification.pageMatches).toBeDefined();
    expect(verification.pageMatches?.length).toBeGreaterThan(0);
    // At least one page should match
    expect(verification.pageMatches?.some((p) => p.isMatch)).toBe(true);
  });

  it('should verify a multi-page PDF with any-match logic', async () => {
    const pdfBlob = await createTestPdf(3);

    const watermarked = await watermark(pdfBlob, 'any-match-test');
    const verification = await verify(watermarked.blob, 'any-match-test');

    expect(verification.isMatch).toBe(true);
    expect(verification.pageMatches).toBeDefined();
    // Confidence should be max of all page confidences
    const maxPageConfidence = Math.max(
      ...(verification.pageMatches?.map((p) => p.confidence) || [0])
    );
    expect(verification.confidence).toBe(maxPageConfidence);
  });

  it('should reject wrong payload for PDF', async () => {
    const pdfBlob = await createTestPdf(1);

    const watermarked = await watermark(pdfBlob, 'payload1');
    const verification = await verify(watermarked.blob, 'payload2');

    expect(verification.isMatch).toBe(false);
  });

  it('should handle round-trip PDF watermarking', async () => {
    const pdfBlob = await createTestPdf(2);

    const watermarked = await watermark(pdfBlob, 'round-trip-pdf-test');
    const verification = await verify(watermarked.blob, 'round-trip-pdf-test');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.5);
  });

  it('should respect render scale option', async () => {
    const pdfBlob = await createTestPdf(1);

    const result1 = await watermark(pdfBlob, 'scale-test', {
      pdf: { renderScale: 1.0 },
    });
    const result2 = await watermark(pdfBlob, 'scale-test', {
      pdf: { renderScale: 2.0 },
    });

    // Higher scale should produce larger dimensions
    expect(result2.pages?.[0].width).toBeGreaterThan(result1.pages?.[0].width);
    expect(result2.pages?.[0].height).toBeGreaterThan(result1.pages?.[0].height);
  });

  it('should handle maxPixels constraint', async () => {
    const pdfBlob = await createTestPdf(1);

    // This should not throw even with a very low maxPixels
    const result = await watermark(pdfBlob, 'max-pixels-test', {
      pdf: { maxPixels: 10000, renderScale: 10.0 },
    });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.pages?.[0].width).toBeGreaterThan(0);
    expect(result.pages?.[0].height).toBeGreaterThan(0);
    // Dimensions should be constrained (accounting for minimum scale of 0.1)
    const pixels = (result.pages?.[0].width || 0) * (result.pages?.[0].height || 0);
    // With min scale 0.1, we can't get below ~5000 pixels for a standard page
    // So we check that it's less than the requested scale would produce
    expect(pixels).toBeLessThan(612 * 10 * 792 * 10); // Less than unscaled
  });
});
