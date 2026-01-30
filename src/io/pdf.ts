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

// Carrier image constants
export const CARRIER_FILENAME = 'watermark-carrier.png';
export const CARRIER_SIZE = 512;

/**
 * Create a carrier image optimized for DCT watermark embedding.
 * Mid-gray with slight noise provides optimal embedding conditions.
 */
export function createCarrierImage(size: number = CARRIER_SIZE): ImageData {
  const data = new Uint8ClampedArray(size * size * 4);
  // Mid-gray (128) with deterministic pattern for consistency
  for (let i = 0; i < size * size; i++) {
    const x = i % size;
    const y = Math.floor(i / size);
    // Use deterministic pattern instead of random noise
    const pattern = ((x * 7 + y * 11) % 10) - 5;
    const gray = 128 + pattern;
    data[i * 4] = gray;
    data[i * 4 + 1] = gray;
    data[i * 4 + 2] = gray;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, size, size);
}

/**
 * Encode ImageData to PNG bytes.
 */
export async function encodeImageDataToPng(imageData: ImageData): Promise<Uint8Array> {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(imageData.width, imageData.height)
    : document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error('Failed to get 2d context for PNG encoding');
  }
  
  ctx.putImageData(imageData, 0, 0);

  if (canvas instanceof OffscreenCanvas) {
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const arrayBuffer = await blob.arrayBuffer();
    // Ensure ArrayBuffer-backed Uint8Array (not SharedArrayBuffer)
    return new Uint8Array(arrayBuffer);
  } else {
    return new Promise<Uint8Array>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Failed to convert canvas to blob'));
          return;
        }
        blob.arrayBuffer().then((arrayBuffer) => {
          // Ensure ArrayBuffer-backed Uint8Array (not SharedArrayBuffer)
          resolve(new Uint8Array(arrayBuffer));
        }, reject);
      }, 'image/png');
    });
  }
}

/**
 * Decode PNG bytes to ImageData.
 */
export async function decodePngToImageData(pngBytes: Uint8Array): Promise<ImageData> {
  // Ensure ArrayBuffer-backed Uint8Array for Blob compatibility
  let array: Uint8Array;
  if (pngBytes.buffer instanceof ArrayBuffer) {
    array = pngBytes;
  } else {
    const buffer = new ArrayBuffer(pngBytes.length);
    const temp = new Uint8Array(buffer);
    temp.set(pngBytes);
    array = temp;
  }
  const blob = new Blob([array as BlobPart], { type: 'image/png' });
  const bitmap = await createImageBitmap(blob);
  
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) {
    throw new Error('Failed to get 2d context for PNG decoding');
  }
  
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

/**
 * Attach a carrier image to a PDF document.
 */
export async function attachCarrierToPdf(
  pdfBytes: Uint8Array,
  carrierPngBytes: Uint8Array
): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  // Ensure ArrayBuffer-backed Uint8Array for pdf-lib
  let carrierArray: Uint8Array;
  if (carrierPngBytes.buffer instanceof ArrayBuffer) {
    carrierArray = carrierPngBytes;
  } else {
    const buffer = new ArrayBuffer(carrierPngBytes.length);
    new Uint8Array(buffer).set(carrierPngBytes);
    carrierArray = new Uint8Array(buffer);
  }
  
  await pdfDoc.attach(carrierArray, CARRIER_FILENAME, {
    mimeType: 'image/png',
    description: 'Watermark verification carrier',
  });
  
  const outputBytes = await pdfDoc.save();
  // Ensure ArrayBuffer-backed Uint8Array for return
  const buffer = outputBytes.buffer instanceof ArrayBuffer
    ? outputBytes.buffer
    : new ArrayBuffer(outputBytes.length);
  if (!(outputBytes.buffer instanceof ArrayBuffer)) {
    new Uint8Array(buffer).set(outputBytes);
  }
  return new Uint8Array(buffer);
}

/**
 * Extract the carrier image from a PDF document.
 * Returns null if no carrier is found.
 * 
 * Note: pdf-lib doesn't have a high-level API for extracting attachments,
 * so we use the low-level context API to access embedded files.
 */
export async function extractCarrierFromPdf(
  pdfBytes: Uint8Array
): Promise<Uint8Array | null> {
  const { PDFDocument, PDFName } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.load(pdfBytes);
  
  // Helper to get and dereference a dictionary entry
  // Handles both direct values and PDFRef references
  const lookupDict = (dict: any, key: string): any => {
    if (!dict) return null;
    // Try using PDFDict.lookup() first (handles refs automatically)
    if (typeof dict.lookup === 'function') {
      try {
        return dict.lookup(PDFName.of(key));
      } catch {
        // Fall through to manual approach
      }
    }
    // Fall back to get() + context.lookup()
    const val = dict.get?.(PDFName.of(key));
    if (!val) return null;
    // If it's a PDFRef, look it up; otherwise return as-is
    if (val.tag === 'Ref' || (val.objectNumber !== undefined && val.generationNumber !== undefined)) {
      return pdfDoc.context.lookup(val);
    }
    return val;
  };
  
  try {
    // Access the PDF catalog to find embedded files
    const catalog = pdfDoc.catalog;
    if (!catalog) {
      return null;
    }
    
    // Check if Names dictionary exists
    const names = lookupDict(catalog, 'Names');
    if (!names) {
      return null;
    }
    
    const embeddedFiles = lookupDict(names, 'EmbeddedFiles');
    if (!embeddedFiles) {
      return null;
    }
    
    const namesArray = lookupDict(embeddedFiles, 'Names');
    if (!namesArray) {
      return null;
    }
    
    const array = (namesArray as any).asArray?.();
    if (!array) {
      return null;
    }
    
    // Find the carrier file by name (names array alternates between name and file spec)
    const arrayLength = array.length;
    for (let i = 0; i < arrayLength; i += 2) {
      const nameObjOrRef = array[i];
      if (!nameObjOrRef) continue;
      
      // Array elements might be PDFRefs that need lookup, or direct PDFString/PDFHexString objects
      let nameObj = nameObjOrRef;
      if (typeof (nameObj as any).decodeText !== 'function') {
        const lookedUp = pdfDoc.context.lookup(nameObjOrRef);
        if (lookedUp && typeof (lookedUp as any).decodeText === 'function') {
          nameObj = lookedUp;
        } else {
          continue;
        }
      }
      
      const name = (nameObj as any).decodeText?.();
      // Handle potential encoding/whitespace issues
      if (name && name.trim() === CARRIER_FILENAME) {
        const fileSpecRefOrObj = array[i + 1];
        if (!fileSpecRefOrObj) continue;
        
        // fileSpecRef might be a PDFRef that needs lookup, or already a PDFDict
        let fileSpec = typeof (fileSpecRefOrObj as any).get === 'function' 
          ? fileSpecRefOrObj 
          : pdfDoc.context.lookup(fileSpecRefOrObj);
        if (!fileSpec) continue;
        
        // Use PDFName for dictionary key lookup
        const efRef = (fileSpec as any).get?.(PDFName.of('EF'));
        if (!efRef) continue;
        
        const ef = pdfDoc.context.lookup(efRef);
        if (!ef) continue;
        
        const fileRef = (ef as any).get?.(PDFName.of('F'));
        if (!fileRef) continue;
        
        const fileStream = pdfDoc.context.lookup(fileRef);
        if (!fileStream) continue;
        
        const contents = (fileStream as any).getContents?.();
        if (!contents) continue;
        
        // Check if this is zlib-compressed (starts with 78 9c or similar)
        const isZlib = contents[0] === 0x78 && (contents[1] === 0x9c || contents[1] === 0x01 || contents[1] === 0xda);
        
        let pngBytes: Uint8Array;
        if (isZlib) {
          // Decompress using browser's DecompressionStream
          const blob = new Blob([contents]);
          const ds = new DecompressionStream('deflate');
          const decompressedStream = blob.stream().pipeThrough(ds);
          const decompressedBlob = await new Response(decompressedStream).blob();
          const decompressedBuffer = await decompressedBlob.arrayBuffer();
          pngBytes = new Uint8Array(decompressedBuffer);
        } else {
          // Not compressed - copy directly
          pngBytes = new Uint8Array(contents.length);
          pngBytes.set(contents);
        }
        
        return pngBytes;
      }
    }
  } catch (error) {
    // If any error occurs during extraction, return null
    // This handles cases where the PDF structure is unexpected
    return null;
  }
  
  return null;
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
