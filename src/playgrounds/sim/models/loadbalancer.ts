import { mean, mulberry32, percentile, poisson } from './prng';

export type LbAlgorithm = 'rr' | 'lc' | 'random';

export interface LoadBalancerParams {
  algorithm: LbAlgorithm;
  servers: number;
  slowServers: number;
  /** Speed of each slow server relative to a normal one (1 = same). */
  slowFactor: number;
  /** Offered load as a share of the fleet's total capacity. */
  loadPct: number;
}

export const LB_DEFAULTS: LoadBalancerParams = { algorithm: 'rr', servers: 4, slowServers: 1, slowFactor: 0.4, loadPct: 0.8 };
export const LB_TICKS = 600; // 100 ms ticks → 60 s
export const LB_SECONDS = 60;
/** A normal server completes 10 requests per second (one per 100 ms tick). */
export const BASE_RATE = 10;

export interface ServerStats {
  speed: number;
  handled: number;
  assigned: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  finalQueue: number;
}

export interface LoadBalancerResult {
  servers: ServerStats[];
  /** Mean queue length per server per second: queue[server][second]. */
  queue: number[][];
  summary: { avgLatencyMs: number; p95LatencyMs: number; maxQueue: number; arrivals: number };
}

export function serverSpeeds(p: LoadBalancerParams): number[] {
  const n = Math.max(1, Math.round(p.servers));
  const slow = Math.min(n, Math.max(0, Math.round(p.slowServers)));
  return Array.from({ length: n }, (_, i) => (i >= n - slow ? p.slowFactor : 1));
}

export function simulateLoadBalancer(p: LoadBalancerParams, seed = 29): LoadBalancerResult {
  const rand = mulberry32(seed);
  const speeds = serverSpeeds(p);
  const n = speeds.length;
  const capacityPerTick = speeds.reduce((a, b) => a + b, 0) * (BASE_RATE / 10);
  const lambda = capacityPerTick * p.loadPct;
  const queues: number[][] = speeds.map(() => []); // arrival ticks
  const credits = speeds.map(() => 0);
  const lat: number[][] = speeds.map(() => []);
  const assigned = speeds.map(() => 0);
  const queueSec: number[][] = speeds.map(() => new Array(LB_SECONDS).fill(0));
  let rr = 0;
  let arrivals = 0;

  for (let t = 0; t < LB_TICKS; t++) {
    const k = poisson(rand, lambda);
    arrivals += k;
    for (let j = 0; j < k; j++) {
      let s: number;
      if (p.algorithm === 'rr') s = rr++ % n;
      else if (p.algorithm === 'random') s = Math.floor(rand() * n);
      else {
        s = 0;
        for (let i = 1; i < n; i++) if (queues[i].length < queues[s].length) s = i;
      }
      queues[s].push(t);
      assigned[s]++;
    }
    for (let i = 0; i < n; i++) {
      credits[i] += speeds[i] * (BASE_RATE / 10);
      while (credits[i] >= 1 && queues[i].length) {
        const at = queues[i].shift()!;
        credits[i] -= 1;
        lat[i].push((t + 1 - at) * 100);
      }
      if (!queues[i].length) credits[i] = Math.min(credits[i], 1);
      queueSec[i][Math.floor(t / 10)] += queues[i].length / 10;
    }
  }
  const all = lat.flat();
  return {
    servers: speeds.map((speed, i) => ({
      speed,
      handled: lat[i].length,
      assigned: assigned[i],
      avgLatencyMs: mean(lat[i]),
      p95LatencyMs: percentile(lat[i], 0.95),
      finalQueue: queues[i].length,
    })),
    queue: queueSec,
    summary: { avgLatencyMs: mean(all), p95LatencyMs: percentile(all, 0.95), maxQueue: Math.max(...queueSec.flat()), arrivals },
  };
}
