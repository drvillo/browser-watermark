import { describe, it, expect } from 'vitest';
import { SeededPRNG } from '../../src/core/prng';

describe('SeededPRNG', () => {
  it('should be deterministic with same seed', () => {
    const seed1 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const seed2 = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    
    const prng1 = new SeededPRNG(seed1);
    const prng2 = new SeededPRNG(seed2);
    
    for (let i = 0; i < 100; i++) {
      expect(prng1.next()).toBeCloseTo(prng2.next(), 10);
    }
  });

  it('should produce different sequences with different seeds', () => {
    const seed1 = new Uint8Array([1, 2, 3, 4]);
    const seed2 = new Uint8Array([5, 6, 7, 8]);
    
    const prng1 = new SeededPRNG(seed1);
    const prng2 = new SeededPRNG(seed2);
    
    const values1: number[] = [];
    const values2: number[] = [];
    
    for (let i = 0; i < 10; i++) {
      values1.push(prng1.next());
      values2.push(prng2.next());
    }
    
    expect(values1).not.toEqual(values2);
  });

  it('should produce values in [0, 1)', () => {
    const seed = new Uint8Array([42]);
    const prng = new SeededPRNG(seed);
    
    for (let i = 0; i < 1000; i++) {
      const value = prng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('should handle nextInt correctly', () => {
    const seed = new Uint8Array([1, 2, 3]);
    const prng = new SeededPRNG(seed);
    
    for (let i = 0; i < 100; i++) {
      const value = prng.nextInt(10);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(10);
    }
  });
});
