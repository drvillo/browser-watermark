import { dct2d } from './dct';
import { SeededPRNG } from './prng';
import { decodeWithMajorityVote } from './ecc';
import { createBlockAssignments } from './block-selection';
import { BLOCK_SIZE, PAYLOAD_BITS } from './constants';

const MID_FREQ_COEFFS: Array<[number, number]> = [
  [1, 2], [2, 1], [2, 2], [3, 1], [1, 3], [3, 2], [2, 3], [3, 3],
  [4, 1], [1, 4], [4, 2], [2, 4], [4, 3], [3, 4], [4, 4],
];

function extractLuminance(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const y = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = rgba[i * 4];
    const g = rgba[i * 4 + 1];
    const b = rgba[i * 4 + 2];
    y[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return y;
}

export function extractWatermark(
  imageData: ImageData,
  expectedPayloadBits: Uint8Array
): { recoveredBits: Uint8Array; confidence: number } {
  const { width, height, data } = imageData;
  const y = extractLuminance(data, width, height);

  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;

  const encodedLength = expectedPayloadBits.length * 3;
  const noisyBits = new Float32Array(encodedLength);
  const prng = new SeededPRNG(expectedPayloadBits);
  const { blocksPerBit, assignments } = createBlockAssignments(
    prng,
    totalBlocks,
    encodedLength
  );
  let assignmentIndex = 0;

  for (let bitIdx = 0; bitIdx < encodedLength; bitIdx++) {
    const votes: number[] = [];

    for (let b = 0; b < blocksPerBit; b++) {
      const blockIdx = assignments
        ? assignments[assignmentIndex++]
        : prng.nextInt(totalBlocks);
      const coeffIdx = prng.nextInt(MID_FREQ_COEFFS.length);
      const coeff = MID_FREQ_COEFFS[coeffIdx];

      const bx = blockIdx % blocksX;
      const by = Math.floor(blockIdx / blocksX);

      const block = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);
      for (let blockY = 0; blockY < BLOCK_SIZE; blockY++) {
        for (let blockX = 0; blockX < BLOCK_SIZE; blockX++) {
          const srcX = bx * BLOCK_SIZE + blockX;
          const srcY = by * BLOCK_SIZE + blockY;
          if (srcX < width && srcY < height) {
            block[blockY * BLOCK_SIZE + blockX] = y[srcY * width + srcX];
          }
        }
      }

      const dctBlock = dct2d(block);
      const [u, v] = coeff;
      const coeffValue = dctBlock[u * BLOCK_SIZE + v];
      
      // Simple sign-based voting: +1 for positive (bit 1), -1 for negative (bit 0)
      // This avoids magnitude outliers dominating the result
      votes.push(coeffValue > 0 ? 1 : -1);
    }

    // Average votes will be in [-1, +1], map to [0, 1]
    const avgVote = votes.reduce((a, b) => a + b, 0) / votes.length;
    const normalized = (avgVote + 1) / 2;
    noisyBits[bitIdx] = normalized;
  }

  const { bits: recoveredBits, confidence } = decodeWithMajorityVote(
    noisyBits,
    expectedPayloadBits.length
  );

  return { recoveredBits, confidence };
}
