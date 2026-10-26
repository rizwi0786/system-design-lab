import { mulberry32, poisson } from './prng';

export interface QueueParams {
  producerRate: number; // messages per second
  consumers: number;
  processingMs: number; // per message, per consumer
  /** When on, every consumer crashes for 30 s in the middle of the run. */
  crash: boolean;
}

export const QUEUE_DEFAULTS: QueueParams = { producerRate: 80, consumers: 4, processingMs: 40, crash: false };
export const QUEUE_STEPS = 120;
export const QUEUE_CRASH = { from: 30, to: 60 };

export interface QueueResult {
  arrivals: number[];
  processed: number[];
  backlog: number[];
  latencyMs: number[];
  alive: number[];
  summary: { capacityPerSec: number; utilisation: number; maxBacklog: number; finalBacklog: number; maxLatencyMs: number; stable: boolean };
}

export function simulateQueue(p: QueueParams, seed = 11): QueueResult {
  const rand = mulberry32(seed);
  const perConsumer = 1000 / Math.max(1, p.processingMs);
  const nominal = Math.max(0, p.consumers) * perConsumer;
  const r: QueueResult = { arrivals: [], processed: [], backlog: [], latencyMs: [], alive: [], summary: { capacityPerSec: nominal, utilisation: 0, maxBacklog: 0, finalBacklog: 0, maxLatencyMs: 0, stable: true } };
  let backlog = 0;
  let carry = 0; // fractional processing capacity carried between seconds
  for (let t = 0; t < QUEUE_STEPS; t++) {
    const crashed = p.crash && t >= QUEUE_CRASH.from && t < QUEUE_CRASH.to;
    const alive = crashed ? 0 : p.consumers;
    const arrivals = poisson(rand, p.producerRate);
    backlog += arrivals;
    const cap = alive * perConsumer + carry;
    const processed = Math.min(backlog, Math.floor(cap));
    carry = backlog > processed ? cap - Math.floor(cap) : 0;
    backlog -= processed;
    // Little's law estimate: a new message waits for everything ahead of it at full consumer speed.
    const waitMs = nominal > 0 ? (backlog / nominal) * 1000 : Infinity;
    r.arrivals.push(arrivals);
    r.processed.push(processed);
    r.backlog.push(backlog);
    r.latencyMs.push(Math.min(waitMs + p.processingMs, 3_600_000));
    r.alive.push(alive);
  }
  r.summary.utilisation = nominal > 0 ? p.producerRate / nominal : Infinity;
  r.summary.maxBacklog = Math.max(...r.backlog);
  r.summary.finalBacklog = r.backlog[r.backlog.length - 1];
  r.summary.maxLatencyMs = Math.max(...r.latencyMs);
  r.summary.stable = r.summary.utilisation < 1;
  return r;
}
