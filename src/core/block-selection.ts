import { SeededPRNG } from './prng';

export type BlockAssignments = {
  blocksPerBit: number;
  assignments: number[] | null;
};

export function createBlockAssignments(
  prng: SeededPRNG,
  totalBlocks: number,
  encodedLength: number
): BlockAssignments {
  const blocksPerBit = Math.max(1, Math.floor(totalBlocks / encodedLength));
  const requiredAssignments = blocksPerBit * encodedLength;

  if (requiredAssignments > totalBlocks) {
    return { blocksPerBit, assignments: null };
  }

  const indices = Array.from({ length: totalBlocks }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const swapIndex = Math.floor(prng.next() * (i + 1));
    [indices[i], indices[swapIndex]] = [indices[swapIndex], indices[i]];
  }

  return {
    blocksPerBit,
    assignments: indices.slice(0, requiredAssignments),
  };
}
