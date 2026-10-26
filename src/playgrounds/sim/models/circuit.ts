import { binomial, mulberry32, sum } from './prng';

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitParams {
  /** Failure share in the rolling window that trips the breaker. */
  failureThreshold: number;
  windowSec: number;
  minRequests: number;
  /** How long the breaker stays open before letting probe requests through. */
  openSec: number;
  halfOpenProbes: number;
  rps: number;
  /** Dependency failure rate during the outage. */
  outageFailure: number;
  timeoutMs: number;
  breaker: boolean;
}

export const CIRCUIT_DEFAULTS: CircuitParams = {
  failureThreshold: 0.5,
  windowSec: 10,
  minRequests: 20,
  openSec: 10,
  halfOpenProbes: 5,
  rps: 20,
  outageFailure: 0.9,
  timeoutMs: 2000,
  breaker: true,
};
export const CIRCUIT_STEPS = 120;
export const CIRCUIT_OUTAGE = { from: 30, to: 75 };
export const HEALTHY_FAILURE = 0.02;

export const dependencyFailureRate = (t: number, outage: number) => (t >= CIRCUIT_OUTAGE.from && t < CIRCUIT_OUTAGE.to ? outage : HEALTHY_FAILURE);

export interface CircuitResult {
  state: CircuitState[];
  failureRate: number[];
  sent: number[];
  failed: number[];
  shortCircuited: number[];
  summary: { savedCalls: number; failedCalls: number; failedWithoutBreaker: number; waitSavedSec: number; trips: number; recoveredAt: number | null };
}

export function simulateCircuit(p: CircuitParams, seed = 17): CircuitResult {
  const rand = mulberry32(seed);
  const rps = Math.max(0, Math.round(p.rps));
  const probes = Math.max(1, Math.round(p.halfOpenProbes));
  const r: CircuitResult = { state: [], failureRate: [], sent: [], failed: [], shortCircuited: [], summary: { savedCalls: 0, failedCalls: 0, failedWithoutBreaker: 0, waitSavedSec: 0, trips: 0, recoveredAt: null } };
  let state: CircuitState = 'closed';
  let openedAt = 0;
  let window: { n: number; f: number }[] = [];
  let failedWithout = 0;
  let wasted = 0;

  for (let t = 0; t < CIRCUIT_STEPS; t++) {
    const pf = dependencyFailureRate(t, p.outageFailure);
    failedWithout += rps * pf;
    if (p.breaker && state === 'open' && t - openedAt >= p.openSec) state = 'half-open';
    const stateNow: CircuitState = p.breaker ? state : 'closed';
    let sent = 0;
    let failed = 0;
    let short = 0;

    if (stateNow === 'closed') {
      sent = rps;
      failed = binomial(rand, sent, pf);
      if (p.breaker) {
        window.push({ n: sent, f: failed });
        if (window.length > p.windowSec) window.shift();
        const n = sum(window.map((w) => w.n));
        const f = sum(window.map((w) => w.f));
        if (n >= p.minRequests && f / n >= p.failureThreshold) {
          state = 'open';
          openedAt = t;
          window = [];
          r.summary.trips++;
        }
      }
    } else if (stateNow === 'half-open') {
      sent = Math.min(rps, probes);
      short = rps - sent;
      failed = binomial(rand, sent, pf);
      if (failed === 0) {
        state = 'closed';
        window = [];
        if (r.summary.recoveredAt === null && t >= CIRCUIT_OUTAGE.from) r.summary.recoveredAt = t;
      } else {
        state = 'open';
        openedAt = t;
      }
    } else {
      short = rps;
      // Calls we did not make would have failed at rate pf, each holding a thread until timeout.
      wasted += short * pf * (p.timeoutMs / 1000);
    }
    r.state.push(stateNow);
    r.failureRate.push(pf);
    r.sent.push(sent);
    r.failed.push(failed);
    r.shortCircuited.push(short);
  }
  r.summary.savedCalls = sum(r.shortCircuited);
  r.summary.failedCalls = sum(r.failed);
  r.summary.failedWithoutBreaker = Math.round(failedWithout);
  r.summary.waitSavedSec = Math.round(wasted);
  return r;
}
