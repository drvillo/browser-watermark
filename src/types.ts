import type { ImageInput } from './io/decode';

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
};

export type VerifyResult = {
  isMatch: boolean;
  confidence: number;
  recoveredDigestHex?: string;
  transformHints?: {
    likelyResized?: boolean;
    likelyRecompressed?: boolean;
  };
};

export type ExtractResult = {
  digestHex: string;
  confidence: number;
};

export type { ImageInput };
