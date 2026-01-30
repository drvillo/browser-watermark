import type { ImageInput } from './io/decode';
import type { PageSelection } from './io/pdf';

/**
 * Position for visible watermark placement.
 */
export type VisibleWatermarkPosition =
  | 'bottom-right'
  | 'bottom-left'
  | 'top-right'
  | 'top-left'
  | 'bottom-center';

/**
 * Options for the visible watermark overlay.
 */
export type VisibleWatermarkOptions = {
  /**
   * Enable visible watermark rendering.
   * @default false
   */
  enabled?: boolean;

  /**
   * Position of the visible watermark.
   * @default 'bottom-right'
   */
  position?: VisibleWatermarkPosition;

  /**
   * Opacity of the visible watermark (0-1).
   * @default 0.15
   */
  opacity?: number;

  /**
   * Maximum width of the text box as a ratio of image width.
   * @default 0.35
   */
  maxWidthRatio?: number;

  /**
   * Maximum height of the text box as a ratio of image height.
   * @default 0.08
   */
  maxHeightRatio?: number;

  /**
   * Margin from edges as a ratio of image dimensions.
   * @default 0.03
   */
  marginRatio?: number;

  /**
   * Minimum font size in pixels.
   * @default 10
   */
  minFontSize?: number;

  /**
   * Maximum font size in pixels.
   * @default 36
   */
  maxFontSize?: number;

  /**
   * Font family for the visible text.
   * @default 'sans-serif'
   */
  fontFamily?: string;

  /**
   * Font weight for the visible text.
   * @default '600'
   */
  fontWeight?: string;

  /**
   * Maximum number of lines (1 or 2).
   * @default 1
   */
  lineLimit?: 1 | 2;
};

/**
 * PDF-specific options for watermarking and verification.
 */
export type PdfOptions = {
  /**
   * Page selection for visible watermark placement (not used for invisible watermark).
   * - 'all': Apply visible watermark to all pages (default)
   * - 'first': Apply visible watermark only to the first page
   * - number[]: Apply visible watermark to specific 0-based page indices
   * - { from: number; to: number }: Apply visible watermark to a range of pages (inclusive)
   * @default 'all'
   */
  pageSelection?: PageSelection;
};

/**
 * Options for the watermark() function.
 */
export type WatermarkOptions = {
  /**
   * Quality setting for JPEG/WebP output (0-1).
   * Higher values preserve more detail but result in larger files.
   * @default 0.92
   */
  jpegQuality?: number;

  /**
   * Optional visible watermark configuration.
   * The visible watermark renders the payload as text overlay.
   * Verification still relies only on the invisible watermark.
   */
  visible?: VisibleWatermarkOptions;

  /**
   * Optional PDF-specific options.
   * Only used when input is detected as a PDF.
   */
  pdf?: PdfOptions;
};

/**
 * Options for the verify() function.
 */
export type VerifyOptions = {
  /**
   * Minimum confidence threshold for isMatch to be true (0-1).
   * Lower values are more permissive but may increase false positives.
   * @default 0.85
   */
  threshold?: number;

  /**
   * Optional PDF-specific options.
   * Only used when input is detected as a PDF.
   */
  pdf?: PdfOptions;
};

export type WatermarkResult = {
  blob: Blob;
  width: number;
  height: number;
  mimeType: string;
  diagnostics?: {
    embedScore: number;
    payloadDigestHex: string;
  };
  /**
   * PDF-specific metadata (only present when input was a PDF).
   */
  pageCount?: number;
};

export type VerifyResult = {
  isMatch: boolean;
  confidence: number;
  recoveredDigestHex?: string;
  transformHints?: {
    likelyResized?: boolean;
    likelyRecompressed?: boolean;
  };
  error?: string;
};

export type ExtractResult = {
  digestHex: string;
  confidence: number;
};

export type { ImageInput };
