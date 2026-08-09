/**
 * Small seeded PRNG (mulberry32).
 *
 * Deck generation is seeded so that a game can be replayed or reproduced
 * from its seed alone, and so tests are deterministic.
 */
export interface Rng {
  (): number;
  seed: number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  const rng = (() => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }) as Rng;
  rng.seed = seed >>> 0;
  return rng;
}

/** Uniform integer in `[0, max)`. */
export function randomInt(rng: Rng, max: number): number {
  return Math.floor(rng() * max);
}

export function pick<T>(rng: Rng, items: readonly T[]): T {
  return items[randomInt(rng, items.length)];
}

/** Fisher–Yates. Returns a new array; the input is untouched. */
export function shuffle<T>(rng: Rng, items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** A seed suitable for a fresh game. */
export function randomSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
