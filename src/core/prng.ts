export class SeededPRNG {
  private state0: number;
  private state1: number;
  private state2: number;
  private state3: number;

  constructor(seed: Uint8Array) {
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;

    for (let i = 0; i < seed.length; i += 4) {
      s0 ^= (seed[i] ?? 0) << (i % 32);
      s1 ^= (seed[i + 1] ?? 0) << ((i + 1) % 32);
      s2 ^= (seed[i + 2] ?? 0) << ((i + 2) % 32);
      s3 ^= (seed[i + 3] ?? 0) << ((i + 3) % 32);
    }

    if (s0 === 0 && s1 === 0 && s2 === 0 && s3 === 0) {
      s0 = 0x12345678;
      s1 = 0x9abcdef0;
      s2 = 0xfedcba98;
      s3 = 0x76543210;
    }

    this.state0 = s0;
    this.state1 = s1;
    this.state2 = s2;
    this.state3 = s3;
  }

  next(): number {
    const t = this.state1 << 11;
    this.state0 ^= this.state1;
    this.state1 ^= this.state2;
    this.state2 ^= this.state3;
    this.state3 ^= (this.state3 >>> 19) ^ this.state0 ^ t;
    this.state0 ^= (this.state0 << 11);

    const temp = this.state0;
    this.state0 = this.state1;
    this.state1 = this.state2;
    this.state2 = this.state3;
    this.state3 = temp;

    return (this.state3 >>> 0) / 0xffffffff;
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }

  nextIntRange(min: number, max: number): number {
    return min + this.nextInt(max - min);
  }
}
