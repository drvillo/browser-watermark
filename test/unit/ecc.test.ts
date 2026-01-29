import { describe, it, expect } from 'vitest';
import { encodeWithRepetition, decodeWithMajorityVote } from '../../src/core/ecc';

describe('ECC', () => {
  it('should encode with repetition', () => {
    const bits = new Uint8Array([1, 0, 1, 0]);
    const encoded = encodeWithRepetition(bits);
    
    expect(encoded.length).toBe(bits.length * 3);
    expect(encoded[0]).toBe(1);
    expect(encoded[1]).toBe(1);
    expect(encoded[2]).toBe(1);
    expect(encoded[3]).toBe(0);
    expect(encoded[4]).toBe(0);
    expect(encoded[5]).toBe(0);
  });

  it('should decode with majority vote', () => {
    const noisyBits = new Float32Array([0.9, 0.8, 0.95, 0.1, 0.2, 0.05]);
    const { bits, confidence } = decodeWithMajorityVote(noisyBits, 2);
    
    expect(bits.length).toBe(2);
    expect(bits[0]).toBe(1);
    expect(bits[1]).toBe(0);
    expect(confidence).toBeGreaterThan(0.5);
  });

  it('should handle noisy data', () => {
    const noisyBits = new Float32Array([
      0.6, 0.7, 0.65,
      0.4, 0.3, 0.35,
    ]);
    const { bits, confidence } = decodeWithMajorityVote(noisyBits, 2);
    
    expect(bits[0]).toBe(1);
    expect(bits[1]).toBe(0);
    expect(confidence).toBeGreaterThan(0);
  });

  it('should return low confidence for ambiguous data', () => {
    const noisyBits = new Float32Array([
      0.5, 0.5, 0.5,
      0.5, 0.5, 0.5,
    ]);
    const { bits, confidence } = decodeWithMajorityVote(noisyBits, 2);
    
    expect(confidence).toBeLessThan(0.1);
  });
});
