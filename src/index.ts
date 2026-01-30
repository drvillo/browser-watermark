import { decodeImage } from './io/decode';
import { encodeImage, detectMimeType } from './io/encode';
import {
  isPdfInput,
  renderPdfPages,
  createPdfFromImages,
  inputToUint8Array,
  resolvePageSelection,
  type PageSelection,
} from './io/pdf';
import { embedWatermark } from './core/embed';
import { extractWatermark } from './core/extract';
import { derivePayloadDigest, digestToBits } from './utils/hash';
import { renderVisibleWatermark } from './visible/render';
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

const DEFAULT_RENDER_SCALE = 2.0;
const DEFAULT_MAX_PIXELS = 16_000_000;

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
  const pdfBytes = await inputToUint8Array(image);
  
  // Get PDF options with defaults
  const pdfOptions = options?.pdf;
  const pageSelection: PageSelection = pdfOptions?.pageSelection ?? 'all';
  const renderScale = pdfOptions?.renderScale ?? DEFAULT_RENDER_SCALE;
  const maxPixels = pdfOptions?.maxPixels ?? DEFAULT_MAX_PIXELS;
  const outputFormat = pdfOptions?.output ?? 'pdf';

  // Get total page count first (need to load PDF for this)
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
  // Ensure we have a copy of the buffer to avoid detachment issues
  const bufferCopy = pdfBytes.buffer instanceof ArrayBuffer
    ? pdfBytes.buffer.slice(0)
    : new ArrayBuffer(pdfBytes.length);
  if (!(pdfBytes.buffer instanceof ArrayBuffer)) {
    new Uint8Array(bufferCopy).set(pdfBytes);
  }
  const pdfBytesCopy = new Uint8Array(bufferCopy);
  
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytesCopy });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  // Resolve page selection
  const pageIndices = resolvePageSelection(pageSelection, totalPages);
  if (pageIndices.length === 0) {
    throw new Error('No valid pages selected for watermarking');
  }

  // Render PDF pages
  const renderedPages = await renderPdfPages(pdfBytes, pageIndices, renderScale, maxPixels);

  // Prepare payload bits
  const digest = await derivePayloadDigest(payload);
  const payloadBits = digestToBits(digest, PAYLOAD_BITS);

  // Watermark each page
  const watermarkedPages = renderedPages.map(({ imageData, index, width, height }) => {
    let watermarkedData = embedWatermark(imageData, payloadBits);

    // Apply visible watermark if enabled
    if (options?.visible?.enabled) {
      const visibleResult = renderVisibleWatermark(watermarkedData, payload, options.visible);
      watermarkedData = visibleResult.imageData;
    }

    return {
      imageData: watermarkedData,
      index,
      width,
      height,
    };
  });

  // Build result
  if (outputFormat === 'images') {
    // Return first page as image (for now - PRD says array but we return single result)
    // TODO: Consider returning array of results or zip
    const firstPage = watermarkedPages[0];
    const { blob, mimeType } = await encodeImage(
      firstPage.imageData,
      'image/png', // Use PNG for lossless encoding
      undefined // Use default quality
    );

    return {
      blob,
      width: firstPage.width,
      height: firstPage.height,
      mimeType,
      pageCount: totalPages,
      pages: watermarkedPages.map((p) => ({ index: p.index, width: p.width, height: p.height })),
    };
  }

  // Create PDF from watermarked pages
  const outputPdfBytes = await createPdfFromImages(watermarkedPages);
  // Ensure ArrayBuffer-backed Uint8Array for Blob compatibility
  const buffer = outputPdfBytes.buffer instanceof ArrayBuffer
    ? outputPdfBytes.buffer
    : new ArrayBuffer(outputPdfBytes.length);
  if (!(outputPdfBytes.buffer instanceof ArrayBuffer)) {
    new Uint8Array(buffer).set(outputPdfBytes);
  }
  const pdfBlob = new Blob([buffer], { type: 'application/pdf' });

  // Use dimensions from first page for compatibility
  const firstPage = watermarkedPages[0];

  return {
    blob: pdfBlob,
    width: firstPage.width,
    height: firstPage.height,
    mimeType: 'application/pdf',
    pageCount: totalPages,
    pages: watermarkedPages.map((p) => ({ index: p.index, width: p.width, height: p.height })),
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
  const pdfBytes = await inputToUint8Array(image);

  // Get PDF options with defaults
  const pdfOptions = options?.pdf;
  const pageSelection: PageSelection = pdfOptions?.pageSelection ?? 'all';
  const renderScale = pdfOptions?.renderScale ?? DEFAULT_RENDER_SCALE;
  const maxPixels = pdfOptions?.maxPixels ?? DEFAULT_MAX_PIXELS;

  // Get total page count first
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
  // Ensure we have a copy of the buffer to avoid detachment issues
  const bufferCopy = pdfBytes.buffer instanceof ArrayBuffer
    ? pdfBytes.buffer.slice(0)
    : new ArrayBuffer(pdfBytes.length);
  if (!(pdfBytes.buffer instanceof ArrayBuffer)) {
    new Uint8Array(bufferCopy).set(pdfBytes);
  }
  const pdfBytesCopy = new Uint8Array(bufferCopy);
  
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytesCopy });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  // Resolve page selection
  const pageIndices = resolvePageSelection(pageSelection, totalPages);
  if (pageIndices.length === 0) {
    throw new Error('No valid pages selected for verification');
  }

  // Render PDF pages
  const renderedPages = await renderPdfPages(pdfBytes, pageIndices, renderScale, maxPixels);

  // Prepare expected bits
  const expectedDigest = await derivePayloadDigest(payload);
  const expectedBits = digestToBits(expectedDigest, PAYLOAD_BITS);

  // Verify each page
  const pageMatches = renderedPages.map(({ imageData, index }) => {
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
      index,
      confidence,
      isMatch,
    };
  });

  // Aggregate results: any-match with max confidence
  const maxConfidence = Math.max(...pageMatches.map((p) => p.confidence));
  const anyMatch = pageMatches.some((p) => p.isMatch);

  return {
    isMatch: anyMatch,
    confidence: maxConfidence,
    pageMatches,
  };
}
