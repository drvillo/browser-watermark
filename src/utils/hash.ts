import { MODULE_SALT, PAYLOAD_BITS } from '../core/constants';

export async function derivePayloadDigest(payload: string): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const data = encoder.encode(payload + MODULE_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = new Uint8Array(hashBuffer);
  
  const bitsNeeded = PAYLOAD_BITS;
  const bytesNeeded = Math.ceil(bitsNeeded / 8);
  return hashArray.slice(0, bytesNeeded);
}

export function digestToBits(digest: Uint8Array, bitCount: number): Uint8Array {
  const bits = new Uint8Array(bitCount);
  for (let i = 0; i < bitCount; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    bits[i] = (digest[byteIndex] >> bitIndex) & 1;
  }
  return bits;
}
