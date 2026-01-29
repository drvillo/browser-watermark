import { describe, it, expect } from 'vitest';
import { watermark, verify } from '../../src/index';

function createTestImage(width: number, height: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 128;
    data[i * 4 + 1] = 128;
    data[i * 4 + 2] = 128;
    data[i * 4 + 3] = 255;
  }
  return new ImageData(data, width, height);
}

async function imageDataToBlob(imageData: ImageData): Promise<Blob> {
  const canvas = new OffscreenCanvas(imageData.width, imageData.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No context');
  ctx.putImageData(imageData, 0, 0);
  return await canvas.convertToBlob();
}

describe('watermark', () => {
  it('should watermark an image', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const result = await watermark(blob, 'test-payload');

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
  });

  it('should accept ImageData directly', async () => {
    const imageData = createTestImage(256, 256);

    const result = await watermark(imageData, 'test-payload');

    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
  });
});

describe('verify', () => {
  it('should verify a watermarked image', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const watermarked = await watermark(blob, 'test-payload');
    const verification = await verify(watermarked.blob, 'test-payload');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.5);
  });

  it('should reject wrong payload', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const watermarked = await watermark(blob, 'payload1');
    const verification = await verify(watermarked.blob, 'payload2');

    expect(verification.isMatch).toBe(false);
  });

  it('should handle round-trip watermarking', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const watermarked = await watermark(blob, 'round-trip-test');
    const verification = await verify(watermarked.blob, 'round-trip-test');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.5);
  });
});
