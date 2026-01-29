import { PAYLOAD_BITS } from './constants';

const REPETITION_FACTOR = 3;

export function encodeWithRepetition(bits: Uint8Array): Uint8Array {
  const encoded = new Uint8Array(bits.length * REPETITION_FACTOR);
  for (let i = 0; i < bits.length; i++) {
    for (let j = 0; j < REPETITION_FACTOR; j++) {
      encoded[i * REPETITION_FACTOR + j] = bits[i];
    }
  }
  return encoded;
}

export function decodeWithMajorityVote(
  noisyBits: Float32Array,
  bitCount: number
): { bits: Uint8Array; confidence: number } {
  const decoded = new Uint8Array(bitCount);
  const votes = new Float32Array(bitCount);
  let totalConfidence = 0;

  for (let i = 0; i < bitCount; i++) {
    let sum = 0;
    for (let j = 0; j < REPETITION_FACTOR; j++) {
      const idx = i * REPETITION_FACTOR + j;
      if (idx < noisyBits.length) {
        sum += noisyBits[idx];
      }
    }
    const avg = sum / REPETITION_FACTOR;
    const bit = avg > 0.5 ? 1 : 0;
    decoded[i] = bit;
    
    const confidence = Math.abs(avg - 0.5) * 2;
    votes[i] = confidence;
    totalConfidence += confidence;
  }

  const overallConfidence = totalConfidence / bitCount;
  return { bits: decoded, confidence: overallConfidence };
}
