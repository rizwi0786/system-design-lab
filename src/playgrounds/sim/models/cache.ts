import { binomial, mean, mulberry32 } from './prng';

export interface CacheParams {
  /** Share of requests for data that is cacheable and hot (would hit if the entry is fresh). */
  hitRatio: number;
  ttlSeconds: number;
  dbLatencyMs: number;
  cacheLatencyMs: number;
  /** When on, the cache is unavailable for the middle third of the run. */
  cacheDown: boolean;
  rps: number;
  dbCapacityRps: number;
  hotKeys: number;
}

export const CACHE_DEFAULTS: CacheParams = {
  hitRatio: 0.8,
  ttlSeconds: 60,
  dbLatencyMs: 40,
  cacheLatencyMs: 2,
  cacheDown: false,
  rps: 1000,
  dbCapacityRps: 600,
  hotKeys: 2000,
};

export const CACHE_STEPS = 60;
export const CACHE_OUTAGE = { from: 20, to: 40 };

export interface CacheResult {
  hitRate: number[];
  avgMs: number[];
  p50Ms: number[];
  p99Ms: number[];
  dbRps: number[];
  dbUtil: number[];
  down: boolean[];
  summary: { avgHitRate: number; avgLatencyMs: number; peakDbRps: number; overloadedSeconds: number };
}

/** Effective hit probability once TTL expiries are included (each hot key misses once per TTL). */
export function effectiveHitRate(p: Pick<CacheParams, 'hitRatio' | 'ttlSeconds' | 'rps' | 'hotKeys'>): number {
  const hotRps = p.rps * p.hitRatio;
  if (hotRps <= 0 || p.ttlSeconds <= 0) return 0;
  const expiryMissShare = Math.min(1, p.hotKeys / (hotRps * p.ttlSeconds));
  return p.hitRatio * (1 - expiryMissShare);
}

/** Database latency grows as it gets busy (simple queueing curve 1/(1-utilisation), capped at 20×). */
export function loadedDbLatency(baseMs: number, util: number): number {
  return baseMs * Math.min(20, 1 / Math.max(0.05, 1 - util));
}

export function simulateCache(p: CacheParams, seed = 7): CacheResult {
  const rand = mulberry32(seed);
  const r: CacheResult = { hitRate: [], avgMs: [], p50Ms: [], p99Ms: [], dbRps: [], dbUtil: [], down: [], summary: { avgHitRate: 0, avgLatencyMs: 0, peakDbRps: 0, overloadedSeconds: 0 } };
  const pHitUp = effectiveHitRate(p);
  const rps = Math.max(0, Math.round(p.rps));
  for (let t = 0; t < CACHE_STEPS; t++) {
    const down = p.cacheDown && t >= CACHE_OUTAGE.from && t < CACHE_OUTAGE.to;
    const hits = down ? 0 : binomial(rand, rps, pHitUp);
    const misses = rps - hits;
    const util = misses / Math.max(1, p.dbCapacityRps);
    const dbMs = loadedDbLatency(p.dbLatencyMs, util);
    // When the cache is down the app detects it and goes straight to the database.
    const missMs = (down ? 0 : p.cacheLatencyMs) + dbMs;
    const hitShare = rps ? hits / rps : 0;
    r.hitRate.push(hitShare);
    r.avgMs.push(rps ? (hits * p.cacheLatencyMs + misses * missMs) / rps : 0);
    r.p50Ms.push(hitShare >= 0.5 ? p.cacheLatencyMs : missMs);
    r.p99Ms.push(1 - hitShare > 0.01 ? missMs : p.cacheLatencyMs);
    r.dbRps.push(misses);
    r.dbUtil.push(util);
    r.down.push(down);
  }
  r.summary = {
    avgHitRate: mean(r.hitRate),
    avgLatencyMs: mean(r.avgMs),
    peakDbRps: Math.max(...r.dbRps),
    overloadedSeconds: r.dbUtil.filter((u) => u >= 1).length,
  };
  return r;
}
