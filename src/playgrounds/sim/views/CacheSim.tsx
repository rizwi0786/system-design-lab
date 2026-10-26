import { useMemo } from 'react';
import { C, LineChart } from '../charts';
import { CACHE_DEFAULTS, CACHE_OUTAGE, CACHE_STEPS, effectiveHitRate, simulateCache } from '../models/cache';
import { mean } from '../models/prng';
import { ms, num, pct, PlaybackBar, SimShell, Slider, Stat, Toggle, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

export default function CacheSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(CACHE_DEFAULTS, attrs);
  const r = useMemo(() => simulateCache(p), [p]);
  const pb = usePlayback(CACHE_STEPS);
  const upto = <T,>(xs: T[]) => xs.slice(0, Math.max(1, pb.t));
  const last = Math.max(0, pb.t - 1);
  const dbUtil = r.dbUtil[last];
  return (
    <SimShell
      title="Cache"
      description="Cache-aside in front of a database: how hit ratio, TTL and a cache outage change latency and database load."
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Slider label="Cacheable hit ratio" value={p.hitRatio} min={0} max={1} step={0.01} format={(v) => pct(v)} onChange={(v) => set('hitRatio', v)} hint="Share of requests for hot data that would hit if the entry were fresh" />
          <Slider label="TTL" value={p.ttlSeconds} min={1} max={600} onChange={(v) => set('ttlSeconds', v)} format={(v) => `${v} s`} />
          <Slider label="Requests / s" value={p.rps} min={100} max={5000} step={100} onChange={(v) => set('rps', v)} />
          <Slider label="DB latency (unloaded)" value={p.dbLatencyMs} min={5} max={200} onChange={(v) => set('dbLatencyMs', v)} format={ms} />
          <Slider label="Cache latency" value={p.cacheLatencyMs} min={0.5} max={20} step={0.5} onChange={(v) => set('cacheLatencyMs', v)} format={(v) => `${v} ms`} />
          <Slider label="DB capacity" value={p.dbCapacityRps} min={100} max={3000} step={50} onChange={(v) => set('dbCapacityRps', v)} format={(v) => `${v} rps`} />
          <Toggle label="Cache goes down" checked={p.cacheDown} onChange={(v) => set('cacheDown', v)} hint={`Unavailable from ${CACHE_OUTAGE.from}s to ${CACHE_OUTAGE.to}s`} />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Hit rate (so far)" value={pct(mean(upto(r.hitRate)))} sub={`effective ${pct(effectiveHitRate(p))} after TTL expiry`} />
          <Stat label="Avg latency" value={ms(mean(upto(r.avgMs)))} />
          <Stat label="p50 / p99 now" value={`${ms(r.p50Ms[last])} / ${ms(r.p99Ms[last])}`} />
          <Stat label="DB load now" value={`${num(r.dbRps[last])} rps`} sub={`${pct(dbUtil)} of capacity`} tone={dbUtil >= 1 ? 'bad' : dbUtil > 0.7 ? 'warn' : 'ok'} />
        </>
      }
      charts={
        <>
          <LineChart
            title="Latency per request (ms)"
            t={pb.t}
            series={[
              { label: 'Average', values: r.avgMs, color: C.accent },
              { label: 'p99', values: r.p99Ms, color: C.warn, dashed: true },
            ]}
            yFormat={(v) => `${Math.round(v)}`}
            bands={p.cacheDown ? [{ ...CACHE_OUTAGE, label: 'Cache down' }] : undefined}
          />
          <LineChart
            title="Database load (requests/s)"
            t={pb.t}
            series={[{ label: 'DB requests/s', values: r.dbRps, color: C.accent, area: true }]}
            refLine={{ y: p.dbCapacityRps, label: 'DB capacity' }}
            bands={p.cacheDown ? [{ ...CACHE_OUTAGE, label: 'Cache down' }] : undefined}
          />
        </>
      }
      assumptions={[
        'Cache-aside: the app checks the cache, and on a miss reads the database and fills the cache.',
        'Each hot key misses once per TTL (when it expires), so short TTLs with many keys lower the hit rate.',
        'Database latency rises with load as 1/(1 − utilisation), capped at 20× — a simple queueing curve.',
        'When the cache is down the app detects it instantly and sends every request to the database.',
        'p50/p99 are taken from the hit/miss mix, ignoring network jitter.',
      ]}
      tryThis={[
        { text: 'Turn on “Cache goes down”. The database suddenly receives every request and latency explodes — a cache that hides a too-small database is a hidden dependency.', apply: () => patch({ cacheDown: true }) },
        { text: 'Lower TTL to 5 s with 1000 rps. The hit rate falls even though the hit ratio is unchanged: keys expire faster than they are reused.', apply: () => patch({ ttlSeconds: 5, rps: 1000, cacheDown: false }) },
        { text: 'Drop the hit ratio from 95% to 80%. Misses go from 5% to 20% — 4× the database load. Small hit-ratio changes matter a lot.', apply: () => patch({ hitRatio: 0.8, ttlSeconds: 600 }) },
      ]}
    />
  );
}
