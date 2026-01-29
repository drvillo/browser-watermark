export type ImageInput =
  | File
  | Blob
  | HTMLImageElement
  | HTMLCanvasElement
  | ImageData
  | ArrayBuffer
  | Uint8Array;

type Canvas2DContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

async function createImageBitmapFromInput(input: ImageInput): Promise<ImageBitmap> {
  if (input instanceof ImageData) {
    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(input.width, input.height)
      : document.createElement('canvas');
    canvas.width = input.width;
    canvas.height = input.height;
    const ctx = canvas.getContext('2d') as Canvas2DContext | null;
    if (!ctx) {
      throw new Error('Failed to get 2d context');
    }
    ctx.putImageData(input, 0, 0);
    return createImageBitmap(canvas);
  }

  if (input instanceof HTMLImageElement) {
    return createImageBitmap(input);
  }

  if (input instanceof HTMLCanvasElement) {
    return createImageBitmap(input);
  }

  if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    // Normalize Uint8Array to ensure it's backed by ArrayBuffer (not SharedArrayBuffer)
    // for BlobPart compatibility
    const blobPart: BlobPart = input instanceof Uint8Array
      ? new Uint8Array(input)
      : input;
    const blob = new Blob([blobPart]);
    return createImageBitmap(blob);
  }

  if (input instanceof File || input instanceof Blob) {
    return createImageBitmap(input);
  }

  throw new Error(`Unsupported image input type: ${typeof input}`);
}

export async function decodeImage(input: ImageInput): Promise<ImageData> {
  if (input instanceof ImageData) {
    return input;
  }

  const bitmap = await createImageBitmapFromInput(input);
  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(bitmap.width, bitmap.height)
    : document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d') as Canvas2DContext | null;
  if (!ctx) {
    throw new Error('Failed to get 2d context');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
