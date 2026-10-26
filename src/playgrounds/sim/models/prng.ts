// Seeded pseudo-random numbers so every simulation run is reproducible.

export type Rand = () => number;

/** mulberry32: tiny, fast, good-enough PRNG for teaching simulations. Returns values in [0, 1). */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample (Box–Muller). */
export function gauss(rand: Rand): number {
  const u = Math.max(rand(), 1e-12);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Poisson-distributed count with mean `lambda` (normal approximation for large means). */
export function poisson(rand: Rand, lambda: number): number {
  if (lambda <= 0) return 0;
  if (lambda > 40) return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * gauss(rand)));
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rand();
  } while (p > l);
  return k - 1;
}

/** Binomial count of successes in n trials with probability p (normal approximation for large n). */
export function binomial(rand: Rand, n: number, p: number): number {
  if (n <= 0 || p <= 0) return 0;
  if (p >= 1) return n;
  if (n > 60) {
    const mean = n * p;
    const sd = Math.sqrt(n * p * (1 - p));
    return Math.min(n, Math.max(0, Math.round(mean + sd * gauss(rand))));
  }
  let k = 0;
  for (let i = 0; i < n; i++) if (rand() < p) k++;
  return k;
}

/** Exponentially distributed sample with the given mean. */
export function exponential(rand: Rand, mean: number): number {
  return -Math.log(1 - rand()) * mean;
}

export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
export const mean = (xs: readonly number[]) => (xs.length ? sum(xs) / xs.length : 0);

/** Nearest-rank percentile of an unsorted list (q in 0..1). */
export function percentile(xs: readonly number[], q: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}
