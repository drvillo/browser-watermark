const BLOCK_SIZE = 8;

const COS_TABLE: Float32Array = (() => {
  const table = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);
  const piOver16 = Math.PI / 16;
  for (let i = 0; i < BLOCK_SIZE; i++) {
    for (let j = 0; j < BLOCK_SIZE; j++) {
      table[i * BLOCK_SIZE + j] = Math.cos((2 * i + 1) * j * piOver16);
    }
  }
  return table;
})();

const SQRT_2 = Math.sqrt(2);
const C0 = 1 / SQRT_2;

function getCos(i: number, j: number): number {
  return COS_TABLE[i * BLOCK_SIZE + j];
}

function getC(j: number): number {
  return j === 0 ? C0 : 1;
}

export function dct2d(block: Float32Array): Float32Array {
  const result = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);
  const temp = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);

  for (let u = 0; u < BLOCK_SIZE; u++) {
    for (let v = 0; v < BLOCK_SIZE; v++) {
      let sum = 0;
      for (let x = 0; x < BLOCK_SIZE; x++) {
        sum += block[x * BLOCK_SIZE + v] * getCos(x, u);
      }
      temp[u * BLOCK_SIZE + v] = sum * getC(u) * 0.5;
    }
  }

  for (let u = 0; u < BLOCK_SIZE; u++) {
    for (let v = 0; v < BLOCK_SIZE; v++) {
      let sum = 0;
      for (let y = 0; y < BLOCK_SIZE; y++) {
        sum += temp[u * BLOCK_SIZE + y] * getCos(y, v);
      }
      result[u * BLOCK_SIZE + v] = sum * getC(v) * 0.5;
    }
  }

  return result;
}

export function idct2d(block: Float32Array): Float32Array {
  const result = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);
  const temp = new Float32Array(BLOCK_SIZE * BLOCK_SIZE);

  for (let x = 0; x < BLOCK_SIZE; x++) {
    for (let y = 0; y < BLOCK_SIZE; y++) {
      let sum = 0;
      for (let u = 0; u < BLOCK_SIZE; u++) {
        sum += getC(u) * block[u * BLOCK_SIZE + y] * getCos(x, u);
      }
      temp[x * BLOCK_SIZE + y] = sum * 0.5;
    }
  }

  for (let x = 0; x < BLOCK_SIZE; x++) {
    for (let y = 0; y < BLOCK_SIZE; y++) {
      let sum = 0;
      for (let v = 0; v < BLOCK_SIZE; v++) {
        sum += getC(v) * temp[x * BLOCK_SIZE + v] * getCos(y, v);
      }
      result[x * BLOCK_SIZE + y] = sum * 0.5;
    }
  }

  return result;
}
