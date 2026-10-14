// Seeded random numbers (Park-Miller). Gameplay randomness (CPU choices, air-shot spread) uses
// this so a match can be replayed / verified by a server from the same seed and inputs.
export class Rng {
  constructor(seed = 20261013) { this.seed(seed); }
  seed(s) { this.s = (Math.floor(Math.abs(s)) % 2147483646) + 1; }
  next() { this.s = (this.s * 16807) % 2147483647; return (this.s - 1) / 2147483646; }
  range(a, b) { return a + this.next() * (b - a); }
}
