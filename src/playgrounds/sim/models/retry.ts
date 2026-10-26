import { mulberry32, sum } from './prng';

export interface RetryParams {
  /** Failure rate of the dependency during the incident window. */
  failureRate: number;
  maxRetries: number;
  backoff: boolean;
  jitter: boolean;
  /** Each client sends one new request per second. */
  clients: number;
  capacityRps: number;
}

export const RETRY_DEFAULTS: RetryParams = { failureRate: 0.4, maxRetries: 3, backoff: false, jitter: false, clients: 500, capacityRps: 1000 };
export const RETRY_STEPS = 60;
export const RETRY_INCIDENT = { from: 10, to: 25 };
export const BASE_FAILURE = 0.01;

export interface RetryResult {
  fresh: number[];
  attempts: number[];
  succeeded: number[];
  gaveUp: number[];
  load: number[]; // attempts / capacity
  summary: { amplification: number; peakLoad: number; stormAfterIncident: boolean; successRate: number };
}

/** Seconds until retry number k (1-based), before jitter. */
export const backoffDelay = (k: number, backoff: boolean) => (backoff ? 2 ** (k - 1) : 1);

/**
 * When the dependency is pushed past capacity, useful throughput collapses (timeouts, thrashing),
 * so the share of requests it can complete falls faster than linearly.
 */
export function goodputCapacity(attempts: number, capacity: number): number {
  const load = attempts / Math.max(1, capacity);
  return load <= 1 ? capacity : capacity * Math.max(0.2, 1 - 0.8 * (load - 1));
}

export function simulateRetry(p: RetryParams, seed = 3): RetryResult {
  const rand = mulberry32(seed);
  const maxR = Math.max(0, Math.round(p.maxRetries));
  const horizon = RETRY_STEPS + 2 ** (maxR + 1) + 2;
  // due[t][k] = number of attempts with attempt index k (0 = first try) arriving at second t. Fluid counts.
  const due: number[][] = Array.from({ length: horizon }, () => new Array(maxR + 1).fill(0));
  const r: RetryResult = { fresh: [], attempts: [], succeeded: [], gaveUp: [], load: [], summary: { amplification: 1, peakLoad: 0, stormAfterIncident: false, successRate: 1 } };

  for (let t = 0; t < RETRY_STEPS; t++) {
    due[t][0] += p.clients;
    const total = sum(due[t]);
    const incident = t >= RETRY_INCIDENT.from && t < RETRY_INCIDENT.to;
    const baseFail = (incident ? p.failureRate : BASE_FAILURE) * (0.9 + 0.2 * rand());
    const overloadFail = total > 0 ? 1 - Math.min(1, goodputCapacity(total, p.capacityRps) / total) : 0;
    const pFail = Math.min(1, 1 - (1 - baseFail) * (1 - overloadFail));
    let gaveUp = 0;
    for (let k = 0; k <= maxR; k++) {
      const failed = due[t][k] * pFail;
      if (k === maxR) {
        gaveUp += failed;
        continue;
      }
      const d = backoffDelay(k + 1, p.backoff);
      if (p.jitter) {
        // "Full jitter": wait a random time between 1 s and 2×delay; spread the fluid evenly over that window.
        const hi = Math.max(1, 2 * d);
        for (let s = 1; s <= hi; s++) due[t + s][k + 1] += failed / hi;
      } else {
        due[t + d][k + 1] += failed;
      }
    }
    r.fresh.push(p.clients);
    r.attempts.push(total);
    r.succeeded.push(total * (1 - pFail));
    r.gaveUp.push(gaveUp);
    r.load.push(total / Math.max(1, p.capacityRps));
  }
  const fresh = sum(r.fresh);
  r.summary = {
    amplification: fresh ? sum(r.attempts) / fresh : 1,
    peakLoad: Math.max(...r.load),
    stormAfterIncident: r.load.slice(RETRY_INCIDENT.to + 10).some((l) => l > 1),
    successRate: fresh ? 1 - sum(r.gaveUp) / fresh : 1,
  };
  return r;
}
