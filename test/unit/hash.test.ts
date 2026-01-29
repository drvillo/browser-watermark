import { describe, it, expect } from 'vitest';
import { derivePayloadDigest, digestToBits } from '../../src/utils/hash';
import { MODULE_SALT, PAYLOAD_BITS } from '../../src/core/constants';

describe('hash', () => {
  it('should derive consistent digest for same payload', async () => {
    const digest1 = await derivePayloadDigest('test-payload');
    const digest2 = await derivePayloadDigest('test-payload');
    
    expect(digest1).toEqual(digest2);
  });

  it('should derive different digests for different payloads', async () => {
    const digest1 = await derivePayloadDigest('payload1');
    const digest2 = await derivePayloadDigest('payload2');
    
    expect(digest1).not.toEqual(digest2);
  });

  it('should include module salt', async () => {
    const digest1 = await derivePayloadDigest('test');
    const digest2 = await derivePayloadDigest('test' + MODULE_SALT);
    
    expect(digest1).not.toEqual(digest2);
  });

  it('should return correct number of bytes', async () => {
    const digest = await derivePayloadDigest('test');
    const expectedBytes = Math.ceil(PAYLOAD_BITS / 8);
    expect(digest.length).toBe(expectedBytes);
  });

  it('should convert digest to bits correctly', async () => {
    const digest = new Uint8Array([0b10101010, 0b11001100]);
    const bits = digestToBits(digest, 16);
    
    expect(bits.length).toBe(16);
    expect(bits[0]).toBe(1);
    expect(bits[1]).toBe(0);
    expect(bits[2]).toBe(1);
    expect(bits[7]).toBe(0);
    expect(bits[8]).toBe(1);
    expect(bits[9]).toBe(1);
  });
});
