import { decodeImage } from './io/decode';
import { encodeImage, detectMimeType } from './io/encode';
import { embedWatermark } from './core/embed';
import { extractWatermark } from './core/extract';
import { derivePayloadDigest, digestToBits } from './utils/hash';
import {
  MATCH_THRESHOLD,
  PAYLOAD_BITS,
  JPEG_QUALITY,
  BLOCK_SIZE,
} from './core/constants';
import type {
  ImageInput,
  WatermarkResult,
  VerifyResult,
  WatermarkOptions,
  VerifyOptions,
} from './types';

// Re-export types for library consumers
export type { ImageInput, WatermarkResult, VerifyResult, WatermarkOptions, VerifyOptions };

// Export default constants so users can reference them
export const defaults = {
  /** Minimum confidence for isMatch to be true */
  MATCH_THRESHOLD,
  /** Quality setting for JPEG/WebP output (0-1) */
  JPEG_QUALITY,
  /** Number of bits used from payload hash */
  PAYLOAD_BITS,
  /** DCT block size in pixels */
  BLOCK_SIZE,
} as const;

function arrayBufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Embed an invisible watermark into an image.
 *
 * @param image - The source image (File, Blob, HTMLImageElement, etc.)
 * @param payload - The payload string to embed (will be hashed)
 * @param options - Optional configuration
 * @returns The watermarked image as a Blob with metadata
 */
export async function watermark(
  image: ImageInput,
  payload: string,
  options?: WatermarkOptions
): Promise<WatermarkResult> {
  const imageData = await decodeImage(image);
  const originalMimeType =
    image instanceof Blob || image instanceof File
      ? await detectMimeType(image)
      : undefined;

  const digest = await derivePayloadDigest(payload);
  const payloadBits = digestToBits(digest, PAYLOAD_BITS);

  const watermarkedData = embedWatermark(imageData, payloadBits);
  const { blob, mimeType } = await encodeImage(
    watermarkedData,
    originalMimeType,
    options?.jpegQuality
  );

  return {
    blob,
    width: imageData.width,
    height: imageData.height,
    mimeType,
  };
}

/**
 * Verify if an image contains a watermark matching the given payload.
 *
 * @param image - The image to verify
 * @param payload - The expected payload string
 * @param options - Optional configuration
 * @returns Verification result with isMatch and confidence score
 */
export async function verify(
  image: ImageInput,
  payload: string,
  options?: VerifyOptions
): Promise<VerifyResult> {
  const threshold = options?.threshold ?? MATCH_THRESHOLD;

  const imageData = await decodeImage(image);
  const expectedDigest = await derivePayloadDigest(payload);
  const expectedBits = digestToBits(expectedDigest, PAYLOAD_BITS);

  const { recoveredBits, confidence } = extractWatermark(imageData, expectedBits);

  const recoveredDigest = new Uint8Array(Math.ceil(PAYLOAD_BITS / 8));
  for (let i = 0; i < PAYLOAD_BITS; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    if (recoveredBits[i]) {
      recoveredDigest[byteIndex] |= 1 << bitIndex;
    }
  }

  const expectedDigestPrefix = expectedDigest.slice(0, Math.ceil(PAYLOAD_BITS / 8));
  const expectedDigestHex = arrayBufferToHex(expectedDigestPrefix);
  const recoveredDigestHex = arrayBufferToHex(recoveredDigest);

  const isMatch = confidence >= threshold && expectedDigestHex === recoveredDigestHex;

  return {
    isMatch,
    confidence,
  };
}
