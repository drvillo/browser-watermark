import { decodeImage } from './io/decode';
import { encodeImage, detectMimeType } from './io/encode';
import {
  isPdfInput,
  inputToUint8Array,
  createCarrierImage,
  encodeImageDataToPng,
  decodePngToImageData,
  extractCarrierFromPdf,
} from './io/pdf';
import { embedWatermark } from './core/embed';
import { extractWatermark } from './core/extract';
import { derivePayloadDigest, digestToBits } from './utils/hash';
import { renderVisibleWatermark } from './visible/render';
import { applyVisibleWatermarkToPdf } from './visible/pdf-render';
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
  VisibleWatermarkOptions,
  VisibleWatermarkPosition,
} from './types';


// Re-export types for library consumers
export type {
  ImageInput,
  WatermarkResult,
  VerifyResult,
  WatermarkOptions,
  VerifyOptions,
  VisibleWatermarkOptions,
  VisibleWatermarkPosition,
};

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
 * Embed an invisible watermark into an image or PDF.
 * Optionally applies a visible text overlay if options.visible.enabled is true.
 *
 * @param image - The source image or PDF (File, Blob, HTMLImageElement, etc.)
 * @param payload - The payload string to embed (will be hashed)
 * @param options - Optional configuration
 * @returns The watermarked image/PDF as a Blob with metadata
 */
export async function watermark(
  image: ImageInput,
  payload: string,
  options?: WatermarkOptions
): Promise<WatermarkResult> {
  // Check if input is a PDF
  const isPdf = await isPdfInput(image);

  if (isPdf) {
    return watermarkPdf(image, payload, options);
  }

  // Existing image watermarking logic
  const imageData = await decodeImage(image);
  const originalMimeType =
    image instanceof Blob || image instanceof File
      ? await detectMimeType(image)
      : undefined;

  const digest = await derivePayloadDigest(payload);
  const payloadBits = digestToBits(digest, PAYLOAD_BITS);

  // Apply invisible watermark
  let watermarkedData = embedWatermark(imageData, payloadBits);

  // Apply visible watermark if enabled
  if (options?.visible?.enabled) {
    const visibleResult = renderVisibleWatermark(watermarkedData, payload, options.visible);
    watermarkedData = visibleResult.imageData;
  }

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

async function watermarkPdf(
  image: ImageInput,
  payload: string,
  options?: WatermarkOptions
): Promise<WatermarkResult> {
  const { PDFDocument } = await import('pdf-lib');
  const inputBytes = await inputToUint8Array(image);
  
  // Load the original PDF
  const pdfDoc = await PDFDocument.load(inputBytes);
  
  // Create and watermark the carrier image
  const digest = await derivePayloadDigest(payload);
  const payloadBits = digestToBits(digest, PAYLOAD_BITS);
  const carrierImage = createCarrierImage();
  const watermarkedCarrier = embedWatermark(carrierImage, payloadBits);
  const carrierPngBytes = await encodeImageDataToPng(watermarkedCarrier);
  
  // Attach carrier as embedded file
  await pdfDoc.attach(carrierPngBytes, 'watermark-carrier.png', {
    mimeType: 'image/png',
    description: 'Watermark verification carrier',
  });
  
  // Apply visible watermark if enabled
  if (options?.visible?.enabled) {
    await applyVisibleWatermarkToPdf(pdfDoc, payload, options.visible);
  }
  
  // Save and return
  const outputBytes = await pdfDoc.save();
  const pages = pdfDoc.getPages();
  const firstPage = pages[0];
  
  // Ensure ArrayBuffer-backed Uint8Array for Blob compatibility
  const buffer = outputBytes.buffer instanceof ArrayBuffer
    ? outputBytes.buffer
    : new ArrayBuffer(outputBytes.length);
  if (!(outputBytes.buffer instanceof ArrayBuffer)) {
    new Uint8Array(buffer).set(outputBytes);
  }
  const outputPdfBytes = new Uint8Array(buffer);
  
  return {
    blob: new Blob([outputPdfBytes], { type: 'application/pdf' }),
    width: firstPage.getWidth(),
    height: firstPage.getHeight(),
    mimeType: 'application/pdf',
    pageCount: pages.length,
  };
}

/**
 * Verify if an image or PDF contains a watermark matching the given payload.
 *
 * @param image - The image or PDF to verify
 * @param payload - The expected payload string
 * @param options - Optional configuration
 * @returns Verification result with isMatch and confidence score
 */
export async function verify(
  image: ImageInput,
  payload: string,
  options?: VerifyOptions
): Promise<VerifyResult> {
  // Check if input is a PDF
  const isPdf = await isPdfInput(image);

  if (isPdf) {
    return verifyPdf(image, payload, options);
  }

  // Existing image verification logic
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

async function verifyPdf(
  image: ImageInput,
  payload: string,
  options?: VerifyOptions
): Promise<VerifyResult> {
  const threshold = options?.threshold ?? MATCH_THRESHOLD;
  const inputBytes = await inputToUint8Array(image);
  
  // Extract the carrier image
  const carrierPngBytes = await extractCarrierFromPdf(inputBytes);
  if (!carrierPngBytes) {
    return { isMatch: false, confidence: 0, error: 'No watermark carrier found' };
  }
  
  // Decode and verify
  const carrierImageData = await decodePngToImageData(carrierPngBytes);
  const expectedDigest = await derivePayloadDigest(payload);
  const expectedBits = digestToBits(expectedDigest, PAYLOAD_BITS);
  
  const { recoveredBits, confidence } = extractWatermark(carrierImageData, expectedBits);
  
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
