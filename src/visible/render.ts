import type { VisibleWatermarkOptions } from '../types';
import { computeLayoutConfig, computeTextPosition, type LayoutConfig } from './layout';

type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Result of text sizing calculation.
 */
export type TextSizingResult = {
  fontSize: number;
  lines: string[];
  totalHeight: number;
  lineHeight: number;
  fits: boolean;
};

/**
 * Metadata returned when visible watermark cannot fit within bounds.
 */
export type VisibleWatermarkMetadata = {
  textTruncated: boolean;
  finalFontSize: number;
  lineCount: number;
};

/**
 * Calculate optimal font size and line splitting for text within bounds.
 */
export function calculateTextSizing(
  ctx: Canvas2DContext,
  text: string,
  config: LayoutConfig
): TextSizingResult {
  const { maxWidth, maxHeight, minFontSize, maxFontSize, fontFamily, fontWeight, lineLimit } = config;

  // Binary search for optimal font size
  let low = minFontSize;
  let high = maxFontSize;
  let bestResult: TextSizingResult | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const result = tryFontSize(ctx, text, mid, fontFamily, fontWeight, maxWidth, maxHeight, lineLimit);

    if (result.fits) {
      bestResult = result;
      low = mid + 1; // Try larger font
    } else {
      high = mid - 1; // Try smaller font
    }
  }

  // If no size fits, use minimum font size
  if (!bestResult) {
    bestResult = tryFontSize(ctx, text, minFontSize, fontFamily, fontWeight, maxWidth, maxHeight, lineLimit);
  }

  return bestResult;
}

/**
 * Try a specific font size and return sizing result.
 */
function tryFontSize(
  ctx: Canvas2DContext,
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: string,
  maxWidth: number,
  maxHeight: number,
  lineLimit: 1 | 2
): TextSizingResult {
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
  const lineHeight = fontSize * 1.2;

  // Try single line first
  const singleLineWidth = ctx.measureText(text).width;
  if (singleLineWidth <= maxWidth && lineHeight <= maxHeight) {
    return {
      fontSize,
      lines: [text],
      totalHeight: lineHeight,
      lineHeight,
      fits: true,
    };
  }

  // If single line doesn't fit and we allow 2 lines, try splitting
  if (lineLimit === 2 && lineHeight * 2 <= maxHeight) {
    const lines = splitTextIntoLines(ctx, text, maxWidth);
    if (lines.length <= 2) {
      const allLinesFit = lines.every((line) => ctx.measureText(line).width <= maxWidth);
      if (allLinesFit) {
        return {
          fontSize,
          lines,
          totalHeight: lineHeight * lines.length,
          lineHeight,
          fits: true,
        };
      }
    }
  }

  // Doesn't fit at this size
  return {
    fontSize,
    lines: lineLimit === 2 ? splitTextIntoLines(ctx, text, maxWidth).slice(0, 2) : [text],
    totalHeight: lineHeight * (lineLimit === 2 ? 2 : 1),
    lineHeight,
    fits: false,
  };
}

/**
 * Split text into lines that fit within maxWidth.
 */
function splitTextIntoLines(ctx: Canvas2DContext, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  if (words.length === 0) return [text];
  if (words.length === 1) return [text];

  const lines: string[] = [];
  let currentLine = words[0];

  for (let i = 1; i < words.length; i++) {
    const testLine = currentLine + ' ' + words[i];
    const testWidth = ctx.measureText(testLine).width;

    if (testWidth <= maxWidth) {
      currentLine = testLine;
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);

  return lines;
}

/**
 * Render visible watermark text onto an ImageData.
 * Returns a new ImageData with the visible watermark applied.
 */
export function renderVisibleWatermark(
  imageData: ImageData,
  payload: string,
  options: VisibleWatermarkOptions = {}
): { imageData: ImageData; metadata: VisibleWatermarkMetadata } {
  const { width, height } = imageData;

  // Create canvas for rendering
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d') as Canvas2DContext | null;
  if (!ctx) {
    throw new Error('Failed to get 2d context for visible watermark');
  }

  // Draw the original image
  ctx.putImageData(imageData, 0, 0);

  // Compute layout configuration
  const config = computeLayoutConfig(width, height, options);

  // Calculate text sizing
  const sizing = calculateTextSizing(ctx, payload, config);

  // Get text position
  const position = computeTextPosition(width, height, config);

  // Set up text rendering
  ctx.font = `${config.fontWeight} ${sizing.fontSize}px ${config.fontFamily}`;
  ctx.textAlign = position.textAlign;
  ctx.textBaseline = position.textBaseline;
  ctx.globalAlpha = config.opacity;
  ctx.fillStyle = 'white';
  ctx.strokeStyle = 'black';
  ctx.lineWidth = Math.max(1, sizing.fontSize / 12);

  // Calculate starting Y position based on baseline and number of lines
  let startY = position.y;
  if (position.textBaseline === 'bottom') {
    // Adjust for multi-line: move up by (lines - 1) * lineHeight
    startY -= (sizing.lines.length - 1) * sizing.lineHeight;
  }

  // Render each line
  for (let i = 0; i < sizing.lines.length; i++) {
    const lineY = startY + i * sizing.lineHeight;
    const line = sizing.lines[i];

    // Draw stroke for better visibility on varied backgrounds
    ctx.strokeText(line, position.x, lineY);
    ctx.fillText(line, position.x, lineY);
  }

  // Reset alpha
  ctx.globalAlpha = 1;

  // Get the resulting image data
  const resultImageData = ctx.getImageData(0, 0, width, height);

  return {
    imageData: resultImageData,
    metadata: {
      textTruncated: !sizing.fits,
      finalFontSize: sizing.fontSize,
      lineCount: sizing.lines.length,
    },
  };
}
