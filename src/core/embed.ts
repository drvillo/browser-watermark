import { dct2d, idct2d } from './dct';
import { SeededPRNG } from './prng';
import { encodeWithRepetition } from './ecc';
import { createBlockAssignments } from './block-selection';
import { BLOCK_SIZE, PAYLOAD_BITS, EMBEDDING_STRENGTH } from './constants';

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

function reconstructRGB(
  y: Float32Array,
  originalRgba: Uint8ClampedArray,
  width: number,
  height: number
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(originalRgba.length);
  for (let i = 0; i < width * height; i++) {
    const originalY = 0.299 * originalRgba[i * 4] +
                      0.587 * originalRgba[i * 4 + 1] +
                      0.114 * originalRgba[i * 4 + 2];
    const deltaY = y[i] - originalY;
    rgba[i * 4] = Math.max(0, Math.min(255, originalRgba[i * 4] + deltaY));
    rgba[i * 4 + 1] = Math.max(0, Math.min(255, originalRgba[i * 4 + 1] + deltaY));
    rgba[i * 4 + 2] = Math.max(0, Math.min(255, originalRgba[i * 4 + 2] + deltaY));
    rgba[i * 4 + 3] = originalRgba[i * 4 + 3];
  }
  return rgba;
}

export function embedWatermark(
  imageData: ImageData,
  payloadBits: Uint8Array
): ImageData {
  const { width, height, data } = imageData;
  const y = extractLuminance(data, width, height);

  const blocksX = Math.floor(width / BLOCK_SIZE);
  const blocksY = Math.floor(height / BLOCK_SIZE);
  const totalBlocks = blocksX * blocksY;

  const encodedBits = encodeWithRepetition(payloadBits);
  const prng = new SeededPRNG(payloadBits);
  const { blocksPerBit, assignments } = createBlockAssignments(
    prng,
    totalBlocks,
    encodedBits.length
  );
  let assignmentIndex = 0;

  const blockVotes = new Map<number, Array<{ coeff: [number, number]; bit: number }>>();

  for (let bitIdx = 0; bitIdx < encodedBits.length; bitIdx++) {
    const bit = encodedBits[bitIdx];
    for (let b = 0; b < blocksPerBit; b++) {
      const blockIdx = assignments
        ? assignments[assignmentIndex++]
        : prng.nextInt(totalBlocks);
      const coeffIdx = prng.nextInt(MID_FREQ_COEFFS.length);
      const coeff = MID_FREQ_COEFFS[coeffIdx];

      if (!blockVotes.has(blockIdx)) {
        blockVotes.set(blockIdx, []);
      }
      blockVotes.get(blockIdx)!.push({ coeff, bit });
    }
  }

  const processedY = new Float32Array(y);

  for (let by = 0; by < blocksY; by++) {
    for (let bx = 0; bx < blocksX; bx++) {
      const blockIdx = by * blocksX + bx;
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
      const votes = blockVotes.get(blockIdx);

      if (votes && votes.length > 0) {
        const coeffVotes = new Map<string, number[]>();
        for (const { coeff, bit } of votes) {
          const key = `${coeff[0]},${coeff[1]}`;
          if (!coeffVotes.has(key)) {
            coeffVotes.set(key, []);
          }
          coeffVotes.get(key)!.push(bit);
        }

        for (const [key, bits] of coeffVotes) {
          const [u, v] = key.split(',').map(Number);
          const majorityBit = bits.reduce((a, b) => a + b, 0) > bits.length / 2 ? 1 : 0;
          const coeffIdx = u * BLOCK_SIZE + v;
          const currentValue = dctBlock[coeffIdx];
          
          if (majorityBit === 1) {
            dctBlock[coeffIdx] = Math.abs(currentValue) + EMBEDDING_STRENGTH;
          } else {
            dctBlock[coeffIdx] = -(Math.abs(currentValue) + EMBEDDING_STRENGTH);
          }
        }
      }

      const idctBlock = idct2d(dctBlock);

      for (let blockY = 0; blockY < BLOCK_SIZE; blockY++) {
        for (let blockX = 0; blockX < BLOCK_SIZE; blockX++) {
          const dstX = bx * BLOCK_SIZE + blockX;
          const dstY = by * BLOCK_SIZE + blockY;
          if (dstX < width && dstY < height) {
            processedY[dstY * width + dstX] = idctBlock[blockY * BLOCK_SIZE + blockX];
          }
        }
      }
    }
  }

  const watermarkedRgba = reconstructRGB(processedY, data, width, height);
  // Ensure ArrayBuffer-backed Uint8ClampedArray for ImageData compatibility
  const clampedArray = new Uint8ClampedArray(watermarkedRgba.length);
  clampedArray.set(watermarkedRgba);
  return new ImageData(clampedArray, width, height);
}
