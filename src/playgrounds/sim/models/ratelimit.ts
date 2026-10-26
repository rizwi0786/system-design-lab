import { mulberry32, poisson } from './prng';

export type RateAlgorithm = 'token' | 'fixed' | 'sliding';
export type TrafficPattern = 'steady' | 'bursty' | 'edge';

export interface RateLimitParams {
  algorithm: RateAlgorithm;
  /** Token bucket size, or max requests per window for the window algorithms. */
  capacity: number;
  /** Token bucket refill, tokens per second. */
  refillRate: number;
  windowSec: number;
  pattern: TrafficPattern;
}

export const RATELIMIT_DEFAULTS: RateLimitParams = { algorithm: 'token', capacity: 20, refillRate: 5, windowSec: 4, pattern: 'bursty' };
export const RATELIMIT_SECONDS = 32;
const TICK = 0.1; // seconds
const TICKS = RATELIMIT_SECONDS / TICK;

export interface RateLimitResult {
  offered: number[]; // per second
  accepted: number[];
  rejected: number[];
  summary: { offered: number; accepted: number; acceptedPct: number; maxInAnyWindow: number };
}

/** Request arrival times (seconds) for a traffic pattern. Deterministic for a given seed. */
export function trafficTimes(pattern: TrafficPattern, windowSec: number, capacity: number, seed = 5): number[] {
  const rand = mulberry32(seed);
  const times: number[] = [];
  const at = (t: number, n: number) => {
    for (let i = 0; i < n; i++) times.push(t + (i / Math.max(1, n)) * TICK);
  };
  for (let i = 0; i < TICKS; i++) {
    const t = i * TICK;
    if (pattern === 'steady') at(t, poisson(rand, 0.6)); // ≈ 6 req/s
    else if (pattern === 'bursty') {
      at(t, poisson(rand, 0.2)); // ≈ 2 req/s background
      if (t % 8 >= 3 && t % 8 < 3.5) at(t, 6); // 30 requests in 0.5 s every 8 s
    } else {
      // Edge: a full window's worth just before and just after a fixed-window boundary.
      at(t, poisson(rand, 0.05));
    }
  }
  if (pattern === 'edge') {
    const w = Math.max(0.5, windowSec);
    for (let b = 2 * w; b < RATELIMIT_SECONDS - 0.5; b += 3 * w) {
      for (let i = 0; i < capacity; i++) times.push(b - 0.3 + (i / capacity) * 0.29);
      for (let i = 0; i < capacity; i++) times.push(b + (i / capacity) * 0.29);
    }
  }
  return times.sort((a, b) => a - b);
}

export function simulateRateLimit(p: RateLimitParams, seed = 5): RateLimitResult {
  const cap = Math.max(1, Math.round(p.capacity));
  const win = Math.max(0.1, p.windowSec);
  const times = trafficTimes(p.pattern, win, cap, seed);
  const offered = new Array(RATELIMIT_SECONDS).fill(0);
  const accepted = new Array(RATELIMIT_SECONDS).fill(0);
  const acceptedTimes: number[] = [];

  let tokens = cap;
  let lastT = 0;
  let windowIdx = -1;
  let windowCount = 0;
  const log: number[] = []; // sliding log of accepted timestamps
  let head = 0;

  for (const t of times) {
    const sec = Math.min(RATELIMIT_SECONDS - 1, Math.floor(t));
    offered[sec]++;
    let ok = false;
    if (p.algorithm === 'token') {
      tokens = Math.min(cap, tokens + (t - lastT) * p.refillRate);
      lastT = t;
      if (tokens >= 1) {
        tokens -= 1;
        ok = true;
      }
    } else if (p.algorithm === 'fixed') {
      const w = Math.floor(t / win);
      if (w !== windowIdx) {
        windowIdx = w;
        windowCount = 0;
      }
      if (windowCount < cap) {
        windowCount++;
        ok = true;
      }
    } else {
      while (head < log.length && log[head] <= t - win) head++;
      if (log.length - head < cap) {
        log.push(t);
        ok = true;
      }
    }
    if (ok) {
      accepted[sec]++;
      acceptedTimes.push(t);
    }
  }

  // Largest number of accepted requests inside any window of length `win` (two pointers).
  let maxInAnyWindow = 0;
  for (let i = 0, j = 0; i < acceptedTimes.length; i++) {
    while (acceptedTimes[i] - acceptedTimes[j] >= win) j++;
    maxInAnyWindow = Math.max(maxInAnyWindow, i - j + 1);
  }
  const totalOffered = times.length;
  const totalAccepted = acceptedTimes.length;
  return {
    offered,
    accepted,
    rejected: offered.map((o, i) => o - accepted[i]),
    summary: { offered: totalOffered, accepted: totalAccepted, acceptedPct: totalOffered ? totalAccepted / totalOffered : 1, maxInAnyWindow },
  };
}
