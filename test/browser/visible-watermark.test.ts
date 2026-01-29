import { describe, it, expect } from 'vitest';
import { watermark, verify } from '../../src/index';
import { renderVisibleWatermark, calculateTextSizing } from '../../src/visible/render';
import { computeLayoutConfig } from '../../src/visible/layout';

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

function createTestContext(width: number, height: number): OffscreenCanvasRenderingContext2D {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No context');
  return ctx;
}

describe('calculateTextSizing', () => {
  it('should fit short text in single line', () => {
    const ctx = createTestContext(1000, 800);
    const config = computeLayoutConfig(1000, 800);
    const result = calculateTextSizing(ctx, 'Hello', config);

    expect(result.fits).toBe(true);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]).toBe('Hello');
    expect(result.fontSize).toBeGreaterThanOrEqual(config.minFontSize);
    expect(result.fontSize).toBeLessThanOrEqual(config.maxFontSize);
  });

  it('should clamp font size to maximum', () => {
    const ctx = createTestContext(1000, 800);
    const config = computeLayoutConfig(1000, 800, { maxFontSize: 20 });
    const result = calculateTextSizing(ctx, 'Hi', config);

    expect(result.fontSize).toBeLessThanOrEqual(20);
  });

  it('should clamp font size to minimum for long text', () => {
    const ctx = createTestContext(200, 100);
    const config = computeLayoutConfig(200, 100, { minFontSize: 10 });
    const longText = 'This is a very long text that will not fit in a small image';
    const result = calculateTextSizing(ctx, longText, config);

    expect(result.fontSize).toBe(10);
  });

  it('should split text into two lines when lineLimit is 2', () => {
    const ctx = createTestContext(300, 200);
    const config = computeLayoutConfig(300, 200, { lineLimit: 2 });
    const text = 'Hello World Test';
    const result = calculateTextSizing(ctx, text, config);

    // With small width, text should split into lines if needed
    expect(result.lines.length).toBeLessThanOrEqual(2);
  });

  it('should report fits=false when text cannot fit within bounds', () => {
    const ctx = createTestContext(50, 50);
    const config = computeLayoutConfig(50, 50, { lineLimit: 1 });
    const longText = 'This text is way too long for this tiny image';
    const result = calculateTextSizing(ctx, longText, config);

    expect(result.fits).toBe(false);
  });
});

describe('renderVisibleWatermark', () => {
  it('should render visible watermark on image', () => {
    const imageData = createTestImage(256, 256);
    const result = renderVisibleWatermark(imageData, 'Test Watermark', { enabled: true });

    expect(result.imageData.width).toBe(256);
    expect(result.imageData.height).toBe(256);
    expect(result.metadata.finalFontSize).toBeGreaterThanOrEqual(10);
  });

  it('should return metadata about truncation', () => {
    const imageData = createTestImage(100, 100);
    const result = renderVisibleWatermark(
      imageData,
      'Very long watermark text that will not fit in the small image bounds',
      { enabled: true }
    );

    expect(result.metadata).toBeDefined();
    expect(typeof result.metadata.textTruncated).toBe('boolean');
    expect(typeof result.metadata.finalFontSize).toBe('number');
    expect(typeof result.metadata.lineCount).toBe('number');
  });

  it('should respect position option', () => {
    const imageData = createTestImage(256, 256);

    // Should not throw for any position
    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center'] as const;
    for (const position of positions) {
      const result = renderVisibleWatermark(imageData, 'Test', { enabled: true, position });
      expect(result.imageData.width).toBe(256);
    }
  });

  it('should respect opacity option', () => {
    const imageData = createTestImage(256, 256);
    const result = renderVisibleWatermark(imageData, 'Test', { enabled: true, opacity: 0.5 });

    expect(result.imageData.width).toBe(256);
    // Can't easily test opacity directly, but we verify no error
  });
});

describe('visible watermark integration', () => {
  it('should apply visible watermark with invisible watermark', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const result = await watermark(blob, 'test-payload', {
      visible: { enabled: true },
    });

    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.width).toBe(256);
    expect(result.height).toBe(256);
  });

  it('should verify invisible watermark when visible is enabled', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const watermarked = await watermark(blob, 'test-payload', {
      visible: { enabled: true },
    });
    const verification = await verify(watermarked.blob, 'test-payload');

    expect(verification.isMatch).toBe(true);
    expect(verification.confidence).toBeGreaterThan(0.5);
  });

  it('should reject wrong payload even with visible watermark', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const watermarked = await watermark(blob, 'payload1', {
      visible: { enabled: true },
    });
    const verification = await verify(watermarked.blob, 'payload2');

    expect(verification.isMatch).toBe(false);
  });

  it('should work without visible option (disabled by default)', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const result = await watermark(blob, 'test-payload');
    const verification = await verify(result.blob, 'test-payload');

    expect(verification.isMatch).toBe(true);
  });

  it('should work with visible explicitly disabled', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);

    const result = await watermark(blob, 'test-payload', {
      visible: { enabled: false },
    });
    const verification = await verify(result.blob, 'test-payload');

    expect(verification.isMatch).toBe(true);
  });

  it('should handle long payload text', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);
    const longPayload = 'This is a very long payload text that needs to be wrapped or truncated';

    const result = await watermark(blob, longPayload, {
      visible: { enabled: true, lineLimit: 2 },
    });
    const verification = await verify(result.blob, longPayload);

    expect(verification.isMatch).toBe(true);
  });

  it('should handle different positions', async () => {
    const imageData = createTestImage(256, 256);
    const blob = await imageDataToBlob(imageData);
    const positions = ['bottom-right', 'bottom-left', 'top-right', 'top-left', 'bottom-center'] as const;

    for (const position of positions) {
      const result = await watermark(blob, 'test', {
        visible: { enabled: true, position },
      });
      expect(result.blob).toBeInstanceOf(Blob);
    }
  });
});
