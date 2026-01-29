import { describe, it, expect } from 'vitest';
import { dct2d, idct2d } from '../../src/core/dct';

describe('DCT', () => {
  it('should compute DCT of a simple block', () => {
    const block = new Float32Array(64);
    block.fill(128);
    const dct = dct2d(block);
    
    expect(dct[0]).toBeCloseTo(128 * 8, 1);
    for (let i = 1; i < 64; i++) {
      expect(Math.abs(dct[i])).toBeLessThan(0.1);
    }
  });

  it('should be idempotent (DCT then IDCT)', () => {
    const original = new Float32Array(64);
    for (let i = 0; i < 64; i++) {
      original[i] = Math.random() * 255;
    }

    const dct = dct2d(original);
    const reconstructed = idct2d(dct);

    for (let i = 0; i < 64; i++) {
      expect(reconstructed[i]).toBeCloseTo(original[i], 1);
    }
  });

  it('should handle edge cases', () => {
    const zeros = new Float32Array(64);
    const dct = dct2d(zeros);
    const idct = idct2d(dct);
    
    for (let i = 0; i < 64; i++) {
      expect(dct[i]).toBeCloseTo(0, 1);
      expect(idct[i]).toBeCloseTo(0, 1);
    }
  });
});
