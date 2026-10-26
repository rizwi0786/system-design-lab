import { COMPARISONS, instancesFor, type Workload } from '../decision';

const w: Workload = { rps: 2000, readRatio: 0.9, teamSize: 12, strongConsistency: false, monthlyBudgetUsd: 5000, dataGb: 200 };
const metric = (cmp: string, opt: 0 | 1, label: string, wl = w) => COMPARISONS.find(c => c.id === cmp)!.evaluate(wl)[opt].metrics.find(m => m.label === label)!;

describe('decision simulator formulas', () => {
  it('cache: read latency is hit×1ms + miss×9ms', () => {
    const hit = metric('cache', 1, 'Cache hit ratio').numeric!;
    expect(metric('cache', 1, 'Avg read latency').numeric).toBeCloseTo(hit * 1 + (1 - hit) * 9, 6);
    expect(metric('cache', 1, 'DB reads/s').numeric).toBeCloseTo(2000 * 0.9 * (1 - hit), 6);
  });
  it('sync chain availability is the product of dependencies', () => {
    expect(metric('sync-async', 0, 'Availability').numeric).toBeCloseTo(Math.pow(0.999, 4), 10);
  });
  it('instances include 30% headroom and a minimum of two', () => {
    expect(instancesFor(100, 500)).toBe(2);
    expect(instancesFor(2000, 500)).toBe(6);
  });
  it('every metric is labelled with its provenance and formula', () => {
    for (const c of COMPARISONS) for (const o of c.evaluate(w)) for (const m of o.metrics) {
      expect(['calculated estimate', 'illustrative assumption']).toContain(m.provenance);
      expect(m.formula.length).toBeGreaterThan(0);
    }
  });
  it('postgres flags the need to shard at very high write rates', () => {
    expect(metric('sql-doc', 0, 'Fits one primary?', { ...w, rps: 100000, readRatio: 0.5 }).value).toMatch(/No/);
  });
});
