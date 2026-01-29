import { decodeImage } from './io/decode';
import { extractWatermark } from './core/extract';
import { derivePayloadDigest, digestToBits } from './utils/hash';
import { PAYLOAD_BITS } from './core/constants';
import type { ImageInput, ExtractResult } from './types';

function arrayBufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function extract(image: ImageInput): Promise<ExtractResult> {
  const imageData = await decodeImage(image);
  
  const dummyDigest = await derivePayloadDigest('dummy');
  const dummyBits = digestToBits(dummyDigest, PAYLOAD_BITS);

  const { recoveredBits, confidence } = extractWatermark(imageData, dummyBits);

  const recoveredDigest = new Uint8Array(Math.ceil(PAYLOAD_BITS / 8));
  for (let i = 0; i < PAYLOAD_BITS; i++) {
    const byteIndex = Math.floor(i / 8);
    const bitIndex = 7 - (i % 8);
    if (recoveredBits[i]) {
      recoveredDigest[byteIndex] |= 1 << bitIndex;
    }
  }

  return {
    digestHex: arrayBufferToHex(recoveredDigest),
    confidence,
  };
}
