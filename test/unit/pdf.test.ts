import { describe, it, expect } from 'vitest';
import {
  isPdfInput,
  resolvePageSelection,
  calculateRenderScale,
} from '../../src/io/pdf';

describe('PDF Detection', () => {
  it('should detect PDF by MIME type for File', async () => {
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    const result = await isPdfInput(file);
    expect(result).toBe(true);
  });

  it('should detect PDF by MIME type for Blob', async () => {
    const blob = new Blob([''], { type: 'application/pdf' });
    const result = await isPdfInput(blob);
    expect(result).toBe(true);
  });

  it('should detect PDF by byte header for ArrayBuffer', async () => {
    const header = '%PDF-1.4\n';
    const buffer = new TextEncoder().encode(header);
    const arrayBuffer = buffer.buffer;
    const result = await isPdfInput(arrayBuffer);
    expect(result).toBe(true);
  });

  it('should detect PDF by byte header for Uint8Array', async () => {
    const header = '%PDF-1.4\n';
    const bytes = new TextEncoder().encode(header);
    const result = await isPdfInput(bytes);
    expect(result).toBe(true);
  });

  it('should detect PDF by byte header when MIME type is missing', async () => {
    const header = '%PDF-1.4\n';
    const blob = new Blob([header], { type: '' });
    const result = await isPdfInput(blob);
    expect(result).toBe(true);
  });

  it('should not detect non-PDF images', async () => {
    const blob = new Blob([''], { type: 'image/png' });
    const result = await isPdfInput(blob);
    expect(result).toBe(false);
  });

  it('should not detect non-PDF byte arrays', async () => {
    const bytes = new TextEncoder().encode('PNG header');
    const result = await isPdfInput(bytes);
    expect(result).toBe(false);
  });

  it('should handle short byte arrays', async () => {
    const bytes = new Uint8Array([0x25]); // Just '%'
    const result = await isPdfInput(bytes);
    expect(result).toBe(false);
  });
});

describe('Page Selection', () => {
  it('should resolve "all" to all page indices', () => {
    const result = resolvePageSelection('all', 5);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it('should resolve "first" to first page only', () => {
    const result = resolvePageSelection('first', 5);
    expect(result).toEqual([0]);
  });

  it('should resolve "first" to empty array for zero pages', () => {
    const result = resolvePageSelection('first', 0);
    expect(result).toEqual([]);
  });

  it('should resolve array of indices', () => {
    const result = resolvePageSelection([0, 2, 4], 5);
    expect(result).toEqual([0, 2, 4]);
  });

  it('should filter out-of-range indices', () => {
    const result = resolvePageSelection([0, 5, 2, -1, 3], 5);
    expect(result).toEqual([0, 2, 3]);
  });

  it('should resolve range object', () => {
    const result = resolvePageSelection({ from: 1, to: 3 }, 5);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should clamp range boundaries', () => {
    const result = resolvePageSelection({ from: -1, to: 10 }, 5);
    expect(result).toEqual([0, 1, 2, 3, 4]);
  });

  it('should handle empty range', () => {
    const result = resolvePageSelection({ from: 3, to: 1 }, 5);
    expect(result).toEqual([1, 2, 3]);
  });

  it('should return empty array for empty selection', () => {
    const result = resolvePageSelection([], 5);
    expect(result).toEqual([]);
  });
});

describe('Render Scale Calculation', () => {
  it('should return requested scale when within max pixels', () => {
    const result = calculateRenderScale(1000, 1000, 2.0, 16_000_000);
    expect(result).toBe(2.0);
  });

  it('should scale down when exceeding max pixels', () => {
    const result = calculateRenderScale(5000, 5000, 2.0, 16_000_000);
    // 5000 * 2 * 5000 * 2 = 100M pixels, exceeds 16M
    // Scale factor = sqrt(16M / 25M) = sqrt(0.64) = 0.8
    // Actual scale = 2.0 * 0.8 = 1.6
    expect(result).toBeLessThan(2.0);
    expect(result).toBeGreaterThan(0);
  });

  it('should enforce minimum scale', () => {
    const result = calculateRenderScale(10000, 10000, 10.0, 1000);
    expect(result).toBeGreaterThanOrEqual(0.1);
  });

  it('should handle exact max pixels', () => {
    // 2000 * 2 * 2000 * 2 = 16M pixels exactly
    const result = calculateRenderScale(2000, 2000, 2.0, 16_000_000);
    expect(result).toBe(2.0);
  });
});
