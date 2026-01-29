import { JPEG_QUALITY } from '../core/constants';

type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export async function encodeImage(
  imageData: ImageData,
  originalMimeType?: string,
  jpegQuality?: number
): Promise<{ blob: Blob; mimeType: string }> {
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(imageData.width, imageData.height)
    : document.createElement('canvas');
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext('2d') as Canvas2DContext | null;
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }
  ctx.putImageData(imageData, 0, 0);

  let mimeType = 'image/png';
  let quality: number | undefined;
  const effectiveJpegQuality = jpegQuality ?? JPEG_QUALITY;

  if (originalMimeType) {
    if (originalMimeType === 'image/jpeg' || originalMimeType === 'image/jpg') {
      mimeType = 'image/jpeg';
      quality = effectiveJpegQuality;
    } else if (originalMimeType === 'image/webp') {
      mimeType = 'image/webp';
      quality = effectiveJpegQuality;
    } else if (originalMimeType === 'image/png') {
      mimeType = 'image/png';
    }
  }

  return new Promise((resolve, reject) => {
    if (canvas instanceof OffscreenCanvas) {
      canvas.convertToBlob({ type: mimeType, quality }).then(
        (blob) => resolve({ blob, mimeType }),
        reject
      );
    } else {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, mimeType });
          } else {
            reject(new Error('Failed to encode image'));
          }
        },
        mimeType,
        quality
      );
    }
  });
}

export async function detectMimeType(input: Blob | File): Promise<string | undefined> {
  if (input instanceof File) {
    return input.type || undefined;
  }
  return input.type || undefined;
}
