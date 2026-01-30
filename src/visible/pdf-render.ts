import type { PDFDocument, PDFFont } from 'pdf-lib';
import type { VisibleWatermarkOptions } from '../types';
import { computeLayoutConfig, computePositionAnchor, type LayoutConfig, type PositionAnchor } from './layout';

/**
 * Apply visible text watermark to PDF pages using pdf-lib.
 * Reuses layout logic from computeLayoutConfig().
 */
export async function applyVisibleWatermarkToPdf(
  pdfDoc: PDFDocument,
  payload: string,
  options: VisibleWatermarkOptions = {}
): Promise<void> {
  const { StandardFonts, rgb } = await import('pdf-lib');
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  for (const page of pdfDoc.getPages()) {
    const { width, height } = page.getSize();
    
    // Reuse existing layout calculation
    const config = computeLayoutConfig(width, height, options);
    const anchor = computePositionAnchor(width, height, config);
    const fontSize = calculatePdfFontSize(font, payload, config);
    const { x, y } = anchorToPdfCoords(anchor, width, height, fontSize, font, payload);
    
    page.drawText(payload, {
      x, y,
      size: fontSize,
      font,
      color: rgb(0.5, 0.5, 0.5),
      opacity: config.opacity,
    });
  }
}

function calculatePdfFontSize(font: PDFFont, text: string, config: LayoutConfig): number {
  // Binary search similar to calculateTextSizing, using font.widthOfTextAtSize()
  for (let size = config.maxFontSize; size >= config.minFontSize; size--) {
    if (font.widthOfTextAtSize(text, size) <= config.maxWidth) return size;
  }
  return config.minFontSize;
}

function anchorToPdfCoords(
  anchor: PositionAnchor, pageWidth: number, pageHeight: number,
  fontSize: number, font: PDFFont, text: string
): { x: number; y: number } {
  const textWidth = font.widthOfTextAtSize(text, fontSize);
  let x = anchor.xAnchor === 'left' ? anchor.xOffset
        : anchor.xAnchor === 'right' ? pageWidth - anchor.xOffset - textWidth
        : (pageWidth - textWidth) / 2;
  // PDF Y: 0 at bottom, so 'bottom' means small Y, 'top' means large Y
  let y = anchor.yAnchor === 'bottom' ? anchor.yOffset
        : pageHeight - anchor.yOffset - fontSize;
  return { x, y };
}
