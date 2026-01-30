import type { ImageInput } from './decode';

// PDF detection
const PDF_MIME_TYPE = 'application/pdf';
const PDF_HEADER = '%PDF-';

/**
 * Check if input is a PDF by MIME type or byte header.
 */
export async function isPdfInput(input: ImageInput): Promise<boolean> {
  // Check MIME type for Blob/File
  if (input instanceof Blob || input instanceof File) {
    if (input.type === PDF_MIME_TYPE) {
      return true;
    }
    // Also check first bytes if type is missing or ambiguous
    const firstBytes = await readFirstBytes(input, PDF_HEADER.length);
    return checkPdfHeader(firstBytes);
  }

  // Check byte header for ArrayBuffer/Uint8Array
  // Handle both ArrayBuffer and Uint8Array
  let bytes: Uint8Array | null = null;
  
  // Check for ArrayBuffer first (including SharedArrayBuffer)
  // Use multiple checks for compatibility with different environments
  const inputObj = input as any;
  const isArrayBuffer = 
    input instanceof ArrayBuffer ||
    (typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer) ||
    (typeof input === 'object' && input !== null && 
     (inputObj.constructor === ArrayBuffer || 
      inputObj.constructor?.name === 'ArrayBuffer' ||
      (typeof SharedArrayBuffer !== 'undefined' && inputObj.constructor === SharedArrayBuffer)));
  
  if (isArrayBuffer) {
    // Convert to regular ArrayBuffer if needed (SharedArrayBuffer -> ArrayBuffer)
    const buffer = inputObj instanceof ArrayBuffer ? inputObj : new ArrayBuffer(inputObj.byteLength);
    if (!(inputObj instanceof ArrayBuffer)) {
      new Uint8Array(buffer).set(new Uint8Array(inputObj));
    }
    bytes = new Uint8Array(buffer);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else if (typeof input === 'object' && input !== null && 'buffer' in input && 'byteLength' in input) {
    // Fallback for typed arrays in test environments
    bytes = new Uint8Array((input as any).buffer, (input as any).byteOffset || 0, (input as any).byteLength || (input as any).length);
  }
  
  if (bytes) {
    return checkPdfHeader(bytes.slice(0, PDF_HEADER.length));
  }

  return false;
}

async function readFirstBytes(blob: Blob, length: number): Promise<Uint8Array> {
  const slice = blob.slice(0, length);
  // Handle both browser and test environments
  let arrayBuffer: ArrayBuffer;
  if (typeof slice.arrayBuffer === 'function') {
    arrayBuffer = await slice.arrayBuffer();
  } else {
    // Fallback for test environments
    const reader = new FileReader();
    arrayBuffer = await new Promise<ArrayBuffer>((resolve, reject) => {
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(slice);
    });
  }
  return new Uint8Array(arrayBuffer);
}

function checkPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < PDF_HEADER.length) {
    return false;
  }
  // Ensure we have a proper array for String.fromCharCode spread
  const headerBytes = Array.from(bytes.slice(0, PDF_HEADER.length));
  const header = String.fromCharCode(...headerBytes);
  return header === PDF_HEADER;
}

// PDF page selection types (exported for use in types.ts)
export type PageSelection =
  | 'all'
  | 'first'
  | number[]
  | { from: number; to: number };

/**
 * Resolve page selection to array of 0-based page indices.
 */
export function resolvePageSelection(
  selection: PageSelection,
  totalPages: number
): number[] {
  if (selection === 'all') {
    return Array.from({ length: totalPages }, (_, i) => i);
  }
  if (selection === 'first') {
    return totalPages > 0 ? [0] : [];
  }
  if (Array.isArray(selection)) {
    return selection.filter((idx) => idx >= 0 && idx < totalPages);
  }
  if (typeof selection === 'object' && 'from' in selection && 'to' in selection) {
    const { from, to } = selection;
    const start = Math.max(0, Math.min(Math.min(from, to), totalPages - 1));
    const end = Math.max(start, Math.min(Math.max(from, to), totalPages - 1));
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
  return [];
}

/**
 * Calculate render scale with max pixels constraint.
 */
export function calculateRenderScale(
  pageWidth: number,
  pageHeight: number,
  requestedScale: number,
  maxPixels: number
): number {
  const requestedPixels = pageWidth * requestedScale * pageHeight * requestedScale;
  if (requestedPixels <= maxPixels) {
    return requestedScale;
  }
  // Scale down to fit within max pixels
  const scaleFactor = Math.sqrt(maxPixels / (pageWidth * pageHeight));
  return Math.max(0.1, scaleFactor); // Minimum scale 0.1
}

/**
 * Render PDF pages to ImageData array.
 * Lazy-loads pdfjs-dist only when called.
 */
export async function renderPdfPages(
  pdfBytes: Uint8Array,
  pageIndices: number[],
  renderScale: number,
  maxPixels: number
): Promise<Array<{ imageData: ImageData; index: number; width: number; height: number }>> {
  // Dynamic import for lazy loading
  const pdfjsLib = await import('pdfjs-dist');
  
  // Initialize PDF.js worker
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }

  // Ensure we have a copy of the buffer to avoid detachment issues
  // PDF.js may transfer the buffer to a worker, so we need a fresh copy
  let bufferCopy: ArrayBuffer;
  if (pdfBytes.buffer instanceof ArrayBuffer) {
    bufferCopy = pdfBytes.buffer.slice(0);
  } else {
    bufferCopy = new ArrayBuffer(pdfBytes.length);
    new Uint8Array(bufferCopy).set(pdfBytes);
  }
  const pdfBytesCopy = new Uint8Array(bufferCopy);

  const loadingTask = pdfjsLib.getDocument({ data: pdfBytesCopy });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages;

  const results: Array<{ imageData: ImageData; index: number; width: number; height: number }> = [];

  for (const pageIndex of pageIndices) {
    if (pageIndex < 0 || pageIndex >= totalPages) {
      continue;
    }

    const page = await pdf.getPage(pageIndex + 1); // pdfjs uses 1-based indexing
    const viewport = page.getViewport({ scale: 1.0 });
    
    // Calculate actual render scale with max pixels constraint
    const actualScale = calculateRenderScale(
      viewport.width,
      viewport.height,
      renderScale,
      maxPixels
    );
    
    const scaledViewport = page.getViewport({ scale: actualScale });
    const { width, height } = scaledViewport;

    // Create canvas for rendering
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
      throw new Error('Failed to get 2d context for PDF rendering');
    }

    // Render PDF page to canvas
    // Type assertion needed because pdfjs-dist expects CanvasRenderingContext2D
    // but we support both regular and OffscreenCanvas contexts
    const renderContext = {
      canvasContext: ctx as CanvasRenderingContext2D,
      viewport: scaledViewport,
    };
    await page.render(renderContext).promise;

    // Extract ImageData
    const imageData = ctx.getImageData(0, 0, width, height);

    results.push({
      imageData,
      index: pageIndex,
      width,
      height,
    });
  }

  return results;
}

/**
 * Create a PDF from rendered page images.
 * Lazy-loads pdf-lib only when called.
 */
export async function createPdfFromImages(
  pages: Array<{ imageData: ImageData; index: number; width: number; height: number }>
): Promise<Uint8Array> {
  // Dynamic import for lazy loading
  const { PDFDocument } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();

  for (const { imageData, width, height } of pages) {
    // Convert ImageData to PNG blob
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(imageData.width, imageData.height)
      : document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
    if (!ctx) {
      throw new Error('Failed to get 2d context for PDF creation');
    }
    
    ctx.putImageData(imageData, 0, 0);

    // Convert canvas to PNG blob
    let pngBytes: Uint8Array;
    if (canvas instanceof OffscreenCanvas) {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      const arrayBuffer = await blob.arrayBuffer();
      pngBytes = new Uint8Array(arrayBuffer);
    } else {
      pngBytes = await new Promise<Uint8Array>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Failed to convert canvas to blob'));
            return;
          }
          blob.arrayBuffer().then((buffer) => {
            resolve(new Uint8Array(buffer));
          }, reject);
        }, 'image/png');
      });
    }

    // Embed PNG as page in PDF
    const pdfImage = await pdfDoc.embedPng(pngBytes);
    const page = pdfDoc.addPage([width, height]);
    page.drawImage(pdfImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
  }

  const pdfBytes = await pdfDoc.save();
  // Ensure we return a Uint8Array backed by ArrayBuffer (not SharedArrayBuffer)
  // for Blob compatibility
  return new Uint8Array(pdfBytes);
}

/**
 * Convert ImageInput to Uint8Array for PDF processing.
 * Returns a copy to avoid ArrayBuffer detachment issues.
 */
export async function inputToUint8Array(input: ImageInput): Promise<Uint8Array> {
  let bytes: Uint8Array;
  
  if (input instanceof Uint8Array) {
    // Create a copy to avoid detachment issues
    bytes = new Uint8Array(input);
  } else if (input instanceof ArrayBuffer || (typeof SharedArrayBuffer !== 'undefined' && input instanceof SharedArrayBuffer)) {
    // Create a copy from ArrayBuffer
    const source = new Uint8Array(input);
    bytes = new Uint8Array(source);
  } else if (input instanceof Blob || input instanceof File) {
    const arrayBuffer = await input.arrayBuffer();
    bytes = new Uint8Array(arrayBuffer);
  } else {
    throw new Error('Cannot convert input to Uint8Array for PDF processing');
  }
  
  // Ensure we return a copy backed by a regular ArrayBuffer (not SharedArrayBuffer)
  if (bytes.buffer instanceof ArrayBuffer) {
    return bytes;
  }
  // Copy to new ArrayBuffer if it's a SharedArrayBuffer
  return new Uint8Array(bytes);
}
