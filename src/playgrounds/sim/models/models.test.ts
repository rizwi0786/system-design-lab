import { describe, expect, it } from 'vitest';
import { binomial, mulberry32, percentile, poisson } from './prng';
import { CACHE_DEFAULTS, CACHE_OUTAGE, effectiveHitRate, simulateCache } from './cache';
import { QUEUE_CRASH, QUEUE_DEFAULTS, simulateQueue } from './queue';
import { RETRY_DEFAULTS, RETRY_INCIDENT, simulateRetry } from './retry';
import { RATELIMIT_DEFAULTS, simulateRateLimit } from './ratelimit';
import { expectedStaleShare, REPLICATION_DEFAULTS, simulateReplication } from './replication';
import { CIRCUIT_DEFAULTS, CIRCUIT_OUTAGE, simulateCircuit } from './circuit';
import { SCALING_DEFAULTS, simulateScaling } from './scaling';
import { PARTITION_DEFAULTS, simulatePartition } from './partition';
import { LB_DEFAULTS, simulateLoadBalancer } from './loadbalancer';
import { CH_DEFAULTS, CH_DEFAULT_OPS, hash32, HashRing, simulateConsistentHash } from './consistentHash';

describe('prng', () => {
  it('is reproducible per seed and differs across seeds', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    const c = mulberry32(2);
    const xs = [a(), a(), a()];
    expect([b(), b(), b()]).toEqual(xs);
    expect(c()).not.toBe(xs[0]);
    for (const x of xs) expect(x >= 0 && x < 1).toBe(true);
  });
  it('poisson and binomial have roughly the right mean', () => {
    const r = mulberry32(9);
    let s = 0;
    for (let i = 0; i < 2000; i++) s += poisson(r, 4);
    expect(s / 2000).toBeGreaterThan(3.8);
    expect(s / 2000).toBeLessThan(4.2);
    let b = 0;
    for (let i = 0; i < 200; i++) b += binomial(r, 1000, 0.3);
    expect(b / 200).toBeGreaterThan(290);
    expect(b / 200).toBeLessThan(310);
  });
  it('percentile uses nearest rank', () => {
    expect(percentile([5, 1, 3, 2, 4], 0.5)).toBe(3);
    expect(percentile([5, 1, 3, 2, 4], 0.95)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
  });
});

describe('cache', () => {
  it('is deterministic', () => {
    expect(simulateCache(CACHE_DEFAULTS)).toEqual(simulateCache(CACHE_DEFAULTS));
  });
  it('shorter TTL lowers the effective hit rate', () => {
    expect(effectiveHitRate({ ...CACHE_DEFAULTS, ttlSeconds: 5 })).toBeLessThan(effectiveHitRate({ ...CACHE_DEFAULTS, ttlSeconds: 300 }));
    expect(effectiveHitRate({ ...CACHE_DEFAULTS, ttlSeconds: 1e9 })).toBeCloseTo(CACHE_DEFAULTS.hitRatio, 3);
  });
  it('higher hit ratio means lower latency and DB load', () => {
    const lo = simulateCache({ ...CACHE_DEFAULTS, hitRatio: 0.3 });
    const hi = simulateCache({ ...CACHE_DEFAULTS, hitRatio: 0.95 });
    expect(hi.summary.avgLatencyMs).toBeLessThan(lo.summary.avgLatencyMs);
    expect(hi.summary.peakDbRps).toBeLessThan(lo.summary.peakDbRps);
  });
  it('cache outage sends all traffic to the DB and overloads it', () => {
    const r = simulateCache({ ...CACHE_DEFAULTS, cacheDown: true });
    expect(r.hitRate[CACHE_OUTAGE.from]).toBe(0);
    expect(r.dbRps[CACHE_OUTAGE.from]).toBe(CACHE_DEFAULTS.rps);
    expect(r.summary.overloadedSeconds).toBe(CACHE_OUTAGE.to - CACHE_OUTAGE.from);
    expect(r.hitRate[CACHE_OUTAGE.to]).toBeGreaterThan(0.5);
    expect(r.p50Ms[0]).toBe(CACHE_DEFAULTS.cacheLatencyMs);
  });
});

describe('queue', () => {
  it('stays near-empty when consumers keep up', () => {
    const r = simulateQueue(QUEUE_DEFAULTS); // 80 msg/s vs 100 msg/s capacity
    expect(r.summary.capacityPerSec).toBe(100);
    expect(r.summary.stable).toBe(true);
    expect(r.summary.maxBacklog).toBeLessThan(80);
  });
  it('grows without bound when producers outpace consumers', () => {
    const r = simulateQueue({ ...QUEUE_DEFAULTS, producerRate: 150 });
    expect(r.summary.stable).toBe(false);
    expect(r.backlog[119]).toBeGreaterThan(r.backlog[60]);
    expect(r.summary.finalBacklog).toBeGreaterThan(4000);
  });
  it('a consumer crash builds a backlog that drains after recovery', () => {
    const r = simulateQueue({ ...QUEUE_DEFAULTS, crash: true });
    expect(r.alive[QUEUE_CRASH.from]).toBe(0);
    const atRecovery = r.backlog[QUEUE_CRASH.to - 1];
    expect(atRecovery).toBeGreaterThan(2000);
    expect(r.backlog[119]).toBeLessThan(atRecovery);
    expect(r.latencyMs[QUEUE_CRASH.to - 1]).toBeGreaterThan(20_000);
  });
});

describe('retry', () => {
  it('is deterministic and amplifies load during incidents', () => {
    const r = simulateRetry(RETRY_DEFAULTS);
    expect(r).toEqual(simulateRetry(RETRY_DEFAULTS));
    expect(r.summary.amplification).toBeGreaterThan(1.1);
  });
  it('zero retries means no amplification', () => {
    expect(simulateRetry({ ...RETRY_DEFAULTS, maxRetries: 0 }).summary.amplification).toBeCloseTo(1, 5);
  });
  it('many clients and retries cause a storm that outlives the incident', () => {
    const storm = simulateRetry({ ...RETRY_DEFAULTS, clients: 900, maxRetries: 3 });
    expect(storm.summary.stormAfterIncident).toBe(true);
    const calm = simulateRetry({ ...RETRY_DEFAULTS, clients: 500, maxRetries: 3 });
    expect(calm.summary.stormAfterIncident).toBe(false);
    expect(calm.load[RETRY_INCIDENT.to + 15]).toBeLessThan(0.6);
  });
  it('jitter flattens the retry peak compared with synchronised backoff', () => {
    const sync = simulateRetry({ ...RETRY_DEFAULTS, clients: 500, backoff: true, jitter: false });
    const jit = simulateRetry({ ...RETRY_DEFAULTS, clients: 500, backoff: true, jitter: true });
    expect(jit.summary.peakLoad).toBeLessThan(sync.summary.peakLoad);
  });
});

describe('ratelimit', () => {
  it('fixed window lets through up to 2× the limit around a boundary, sliding window does not', () => {
    const base = { ...RATELIMIT_DEFAULTS, pattern: 'edge' as const };
    const fixed = simulateRateLimit({ ...base, algorithm: 'fixed' });
    const sliding = simulateRateLimit({ ...base, algorithm: 'sliding' });
    expect(fixed.summary.maxInAnyWindow).toBeGreaterThan(1.5 * base.capacity);
    expect(sliding.summary.maxInAnyWindow).toBeLessThanOrEqual(base.capacity);
  });
  it('token bucket absorbs a burst up to its capacity', () => {
    const r = simulateRateLimit({ ...RATELIMIT_DEFAULTS, algorithm: 'token', capacity: 40 });
    const small = simulateRateLimit({ ...RATELIMIT_DEFAULTS, algorithm: 'token', capacity: 5 });
    expect(r.summary.accepted).toBeGreaterThan(small.summary.accepted);
  });
  it('accepted + rejected = offered, per second', () => {
    const r = simulateRateLimit(RATELIMIT_DEFAULTS);
    r.offered.forEach((o, i) => expect(r.accepted[i] + r.rejected[i]).toBe(o));
    expect(r.summary.offered).toBe(r.offered.reduce((a, b) => a + b, 0));
  });
});

describe('replication', () => {
  it('stale share matches the exponential-lag expectation', () => {
    const r = simulateReplication(REPLICATION_DEFAULTS);
    expect(r.summary.stalePct).toBeCloseTo(expectedStaleShare(200, 100), 1);
  });
  it('reading from the primary or with read-your-writes is never stale', () => {
    expect(simulateReplication({ ...REPLICATION_DEFAULTS, readFrom: 'primary' }).summary.stalePct).toBe(0);
    const ryw = simulateReplication({ ...REPLICATION_DEFAULTS, readFrom: 'ryw' });
    expect(ryw.summary.stalePct).toBe(0);
    expect(ryw.summary.primaryReadShare).toBe(1);
  });
  it('a lag spike increases stale reads; waiting longer reduces them', () => {
    expect(simulateReplication({ ...REPLICATION_DEFAULTS, lagSpike: true }).summary.stalePct).toBeGreaterThan(simulateReplication(REPLICATION_DEFAULTS).summary.stalePct);
    expect(simulateReplication({ ...REPLICATION_DEFAULTS, readDelayMs: 1000 }).summary.stalePct).toBeLessThan(0.02);
  });
});

describe('circuit', () => {
  it('opens during the outage, saves calls and closes after recovery', () => {
    const r = simulateCircuit(CIRCUIT_DEFAULTS);
    expect(r.state.slice(0, CIRCUIT_OUTAGE.from).every((s) => s === 'closed')).toBe(true);
    expect(r.state.slice(CIRCUIT_OUTAGE.from, CIRCUIT_OUTAGE.to)).toContain('open');
    expect(r.state.slice(CIRCUIT_OUTAGE.from, CIRCUIT_OUTAGE.to)).toContain('half-open');
    expect(r.state[r.state.length - 1]).toBe('closed');
    expect(r.summary.savedCalls).toBeGreaterThan(500);
    expect(r.summary.failedCalls).toBeLessThan(r.summary.failedWithoutBreaker / 2);
    expect(r.summary.recoveredAt).toBeGreaterThanOrEqual(CIRCUIT_OUTAGE.to);
  });
  it('without a breaker every call is sent', () => {
    const r = simulateCircuit({ ...CIRCUIT_DEFAULTS, breaker: false });
    expect(r.summary.savedCalls).toBe(0);
    expect(r.state.every((s) => s === 'closed')).toBe(true);
  });
  it('a threshold above the outage failure rate never trips', () => {
    expect(simulateCircuit({ ...CIRCUIT_DEFAULTS, outageFailure: 0.3, failureThreshold: 0.6 }).summary.trips).toBe(0);
  });
});

describe('scaling', () => {
  it('fixed fleet drops requests during the spike; autoscaling drops fewer', () => {
    const fixed = simulateScaling({ ...SCALING_DEFAULTS, autoscale: false });
    const auto = simulateScaling(SCALING_DEFAULTS);
    expect(fixed.summary.droppedPct).toBeGreaterThan(0.1);
    expect(auto.summary.droppedPct).toBeLessThan(fixed.summary.droppedPct);
    expect(auto.summary.peakInstances).toBeGreaterThan(SCALING_DEFAULTS.instances);
    expect(fixed.instances.every((n) => n === SCALING_DEFAULTS.instances)).toBe(true);
  });
  it('slower provisioning drops more', () => {
    const fast = simulateScaling({ ...SCALING_DEFAULTS, provisionSec: 5, cooldownSec: 15 });
    const slow = simulateScaling({ ...SCALING_DEFAULTS, provisionSec: 90 });
    expect(fast.summary.dropped).toBeLessThan(slow.summary.dropped);
  });
});

describe('partition', () => {
  it('CP loses availability on the minority side but never serves stale data', () => {
    const r = simulatePartition(PARTITION_DEFAULTS);
    expect(r.summary.staleReads).toBe(0);
    expect(r.summary.lostWrites).toBe(0);
    expect(r.summary.availability).toBeLessThan(1);
    expect(r.availB[25]).toBe(0);
    expect(r.availA[25]).toBe(1);
  });
  it('AP stays available but serves stale reads and loses conflicting writes', () => {
    const r = simulatePartition({ ...PARTITION_DEFAULTS, mode: 'AP' });
    expect(r.summary.availability).toBe(1);
    expect(r.summary.staleReads).toBeGreaterThan(0);
    expect(r.summary.conflictingKeys).toBeGreaterThan(0);
    expect(r.summary.lostWrites).toBeGreaterThan(0);
  });
});

describe('loadbalancer', () => {
  it('round robin overloads the slow server; least connections does not', () => {
    const rr = simulateLoadBalancer(LB_DEFAULTS);
    const lc = simulateLoadBalancer({ ...LB_DEFAULTS, algorithm: 'lc' });
    const slowRR = rr.servers[rr.servers.length - 1];
    const slowLC = lc.servers[lc.servers.length - 1];
    expect(slowRR.finalQueue).toBeGreaterThan(50);
    expect(slowLC.finalQueue).toBeLessThan(10);
    expect(lc.summary.p95LatencyMs).toBeLessThan(rr.summary.p95LatencyMs);
    expect(slowLC.assigned).toBeLessThan(slowRR.assigned);
  });
  it('round robin with identical servers is fine', () => {
    const r = simulateLoadBalancer({ ...LB_DEFAULTS, slowServers: 0 });
    expect(r.summary.maxQueue).toBeLessThan(20);
  });
});

describe('consistent hashing', () => {
  it('hash is stable', () => {
    expect(hash32('abc')).toBe(hash32('abc'));
    expect(hash32('abc')).not.toBe(hash32('abd'));
  });
  it('ring lookup returns a member node', () => {
    const ring = new HashRing(['a', 'b', 'c'], 10);
    expect(['a', 'b', 'c']).toContain(ring.lookup('x'));
  });
  it('moves about 1/N keys with consistent hashing vs most keys with modulo', () => {
    const steps = simulateConsistentHash(CH_DEFAULTS, ['add']);
    const s = steps[1];
    expect(s.nodes.length).toBe(6);
    expect(s.movedConsistent).toBeGreaterThan(0.1);
    expect(s.movedConsistent).toBeLessThan(0.25);
    expect(s.movedModulo).toBeGreaterThan(0.7);
  });
  it('more virtual nodes spread keys more evenly', () => {
    const few = simulateConsistentHash({ ...CH_DEFAULTS, vnodes: 1 }, [])[0];
    const many = simulateConsistentHash({ ...CH_DEFAULTS, vnodes: 200 }, [])[0];
    expect(many.maxOverAvg).toBeLessThan(few.maxOverAvg);
    expect(many.maxOverAvg).toBeLessThan(1.3);
  });
  it('runs a full op script and never removes the last node', () => {
    const steps = simulateConsistentHash({ ...CH_DEFAULTS, nodes: 1 }, ['remove', ...CH_DEFAULT_OPS]);
    expect(steps[0].nodes.length).toBe(1);
    expect(steps.every((s) => s.nodes.length >= 1)).toBe(true);
    const total = steps[steps.length - 1].distribution.reduce((a, d) => a + d.keys, 0);
    expect(total).toBe(CH_DEFAULTS.keys);
  });
});
