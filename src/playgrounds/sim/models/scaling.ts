import { mulberry32 } from './prng';

export interface ScalingParams {
  instances: number;
  capacityPerInstance: number; // requests per second one instance can serve
  autoscale: boolean;
  cooldownSec: number;
  targetUtil: number;
  maxInstances: number;
  /** Time for a new instance to boot and pass health checks. */
  provisionSec: number;
  spikeMultiplier: number;
}

export const SCALING_DEFAULTS: ScalingParams = {
  instances: 4,
  capacityPerInstance: 100,
  autoscale: true,
  cooldownSec: 60,
  targetUtil: 0.7,
  maxInstances: 20,
  provisionSec: 30,
  spikeMultiplier: 3,
};
export const SCALING_STEPS = 300;
export const SPIKE = { rampFrom: 60, peakAt: 80, holdTo: 180, endAt: 210 };

export interface ScalingResult {
  load: number[];
  capacity: number[];
  instances: number[];
  util: number[];
  dropped: number[];
  summary: { totalRequests: number; dropped: number; droppedPct: number; peakInstances: number; avgUtil: number };
}

/** Baseline is half of the starting fleet's capacity; the spike multiplies it. */
export function trafficAt(t: number, base: number, mult: number): number {
  if (t < SPIKE.rampFrom || t >= SPIKE.endAt) return base;
  if (t < SPIKE.peakAt) return base + (base * mult - base) * ((t - SPIKE.rampFrom) / (SPIKE.peakAt - SPIKE.rampFrom));
  if (t < SPIKE.holdTo) return base * mult;
  return base * mult - (base * mult - base) * ((t - SPIKE.holdTo) / (SPIKE.endAt - SPIKE.holdTo));
}

export function simulateScaling(p: ScalingParams, seed = 19): ScalingResult {
  const rand = mulberry32(seed);
  const cap = Math.max(1, p.capacityPerInstance);
  const start = Math.max(1, Math.round(p.instances));
  const base = start * cap * 0.5;
  let running = start;
  let pending: number[] = []; // ready-at times
  let lastAction = -Infinity;
  const r: ScalingResult = { load: [], capacity: [], instances: [], util: [], dropped: [], summary: { totalRequests: 0, dropped: 0, droppedPct: 0, peakInstances: start, avgUtil: 0 } };

  for (let t = 0; t < SCALING_STEPS; t++) {
    running += pending.filter((x) => x <= t).length;
    pending = pending.filter((x) => x > t);
    const load = trafficAt(t, base, p.spikeMultiplier) * (0.95 + 0.1 * rand());
    if (p.autoscale && t - lastAction >= p.cooldownSec) {
      const desired = Math.min(p.maxInstances, Math.max(1, Math.ceil(load / (cap * p.targetUtil))));
      if (desired > running + pending.length) {
        for (let i = running + pending.length; i < desired; i++) pending.push(t + p.provisionSec);
        lastAction = t;
      } else if (desired < running && pending.length === 0) {
        running -= 1; // scale in gently, one at a time
        lastAction = t;
      }
    }
    const capacity = running * cap;
    const served = Math.min(load, capacity);
    r.load.push(load);
    r.capacity.push(capacity);
    r.instances.push(running);
    r.util.push(load / capacity);
    r.dropped.push(load - served);
    r.summary.peakInstances = Math.max(r.summary.peakInstances, running);
  }
  const total = r.load.reduce((a, b) => a + b, 0);
  const dropped = r.dropped.reduce((a, b) => a + b, 0);
  r.summary.totalRequests = Math.round(total);
  r.summary.dropped = Math.round(dropped);
  r.summary.droppedPct = total ? dropped / total : 0;
  r.summary.avgUtil = r.util.reduce((a, b) => a + Math.min(1, b), 0) / SCALING_STEPS;
  return r;
}
