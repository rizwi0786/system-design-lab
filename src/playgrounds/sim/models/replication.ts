import { exponential, mean, mulberry32 } from './prng';

export type ReadStrategy = 'replica' | 'primary' | 'ryw';

export interface ReplicationParams {
  /** Average replication lag (exponentially distributed). */
  lagMs: number;
  /** How long after their own write the user reads it back. */
  readDelayMs: number;
  readFrom: ReadStrategy;
  writesPerSec: number;
  /** When on, lag is 10× higher for 15 s (e.g. a long-running migration on the primary). */
  lagSpike: boolean;
}

export const REPLICATION_DEFAULTS: ReplicationParams = { lagMs: 200, readDelayMs: 100, readFrom: 'replica', writesPerSec: 50, lagSpike: false };
export const REPLICATION_STEPS = 60;
export const REPLICATION_SPIKE = { from: 20, to: 35 };
/** Read-your-writes: route a user's reads to the primary for this long after they write. */
export const RYW_PIN_MS = 1000;

export interface ReplicationResult {
  staleRate: number[];
  avgLagMs: number[];
  primaryReadShare: number[];
  summary: { stalePct: number; staleReads: number; reads: number; primaryReadShare: number };
}

/** Expected stale share for exponential lag: P(lag > delay) = e^(−delay/lag). */
export const expectedStaleShare = (lagMs: number, readDelayMs: number) => (lagMs <= 0 ? 0 : Math.exp(-readDelayMs / lagMs));

export function simulateReplication(p: ReplicationParams, seed = 13): ReplicationResult {
  const rand = mulberry32(seed);
  const r: ReplicationResult = { staleRate: [], avgLagMs: [], primaryReadShare: [], summary: { stalePct: 0, staleReads: 0, reads: 0, primaryReadShare: 0 } };
  const n = Math.max(0, Math.round(p.writesPerSec));
  let stale = 0;
  let primary = 0;
  for (let t = 0; t < REPLICATION_STEPS; t++) {
    const spike = p.lagSpike && t >= REPLICATION_SPIKE.from && t < REPLICATION_SPIKE.to;
    const lagMean = p.lagMs * (spike ? 10 : 1);
    let s = 0;
    let prim = 0;
    const lags: number[] = [];
    for (let i = 0; i < n; i++) {
      const lag = exponential(rand, lagMean);
      lags.push(lag);
      const toPrimary = p.readFrom === 'primary' || (p.readFrom === 'ryw' && p.readDelayMs < RYW_PIN_MS);
      if (toPrimary) prim++;
      else if (lag > p.readDelayMs) s++;
    }
    stale += s;
    primary += prim;
    r.staleRate.push(n ? s / n : 0);
    r.avgLagMs.push(mean(lags));
    r.primaryReadShare.push(n ? prim / n : 0);
  }
  const reads = n * REPLICATION_STEPS;
  r.summary = { stalePct: reads ? stale / reads : 0, staleReads: stale, reads, primaryReadShare: reads ? primary / reads : 0 };
  return r;
}
