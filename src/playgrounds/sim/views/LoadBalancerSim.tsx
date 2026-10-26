import { useMemo } from 'react';
import { BarChart, C, LineChart } from '../charts';
import { LB_DEFAULTS, LB_SECONDS, simulateLoadBalancer, type LbAlgorithm } from '../models/loadbalancer';
import { ms, pct, PlaybackBar, Segmented, SimShell, Slider, Stat, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

const SERIES_COLORS = [C.accent, C.warn, C.ok, C.muted, C.ink2, C.bad];

export default function LoadBalancerSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(LB_DEFAULTS, attrs, { algorithm: ['rr', 'lc', 'random'] });
  const r = useMemo(() => simulateLoadBalancer(p), [p]);
  const pb = usePlayback(LB_SECONDS);
  const last = Math.max(0, pb.t - 1);
  const name = (i: number) => `Server ${i + 1}${r.servers[i].speed < 1 ? ' (slow)' : ''}`;
  return (
    <SimShell
      title="Load balancing"
      description="Servers with different speeds share traffic. Which algorithm keeps queues short?"
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Segmented<LbAlgorithm>
            label="Algorithm"
            value={p.algorithm}
            onChange={(v) => set('algorithm', v)}
            options={[
              { value: 'rr', label: 'Round robin' },
              { value: 'lc', label: 'Least connections' },
              { value: 'random', label: 'Random' },
            ]}
          />
          <Slider label="Servers" value={p.servers} min={2} max={6} onChange={(v) => set('servers', v)} />
          <Slider label="Slow servers" value={p.slowServers} min={0} max={p.servers} onChange={(v) => set('slowServers', v)} />
          <Slider label="Slow server speed" value={p.slowFactor} min={0.1} max={1} step={0.05} onChange={(v) => set('slowFactor', v)} format={(v) => pct(v)} hint="Relative to a normal server (10 req/s)" />
          <Slider label="Traffic" value={p.loadPct} min={0.1} max={1.1} step={0.05} onChange={(v) => set('loadPct', v)} format={(v) => `${pct(v)} of capacity`} />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Avg latency" value={ms(r.summary.avgLatencyMs)} />
          <Stat label="p95 latency" value={ms(r.summary.p95LatencyMs)} tone={r.summary.p95LatencyMs > 2000 ? 'bad' : r.summary.p95LatencyMs > 500 ? 'warn' : 'ok'} />
          <Stat label="Longest queue now" value={String(Math.round(Math.max(...r.queue.map((q) => q[last]))))} />
          <Stat label="Requests" value={String(r.summary.arrivals)} sub="over 60 s" />
        </>
      }
      charts={
        <>
          <LineChart
            title="Queue length per server"
            t={pb.t}
            series={r.queue.map((q, i) => ({ label: name(i), values: q, color: SERIES_COLORS[i % SERIES_COLORS.length], dashed: r.servers[i].speed < 1 }))}
          />
          <div className="grid gap-2 md:grid-cols-2">
            <BarChart title="Requests assigned (whole run)" bars={r.servers.map((s, i) => ({ label: name(i), value: s.assigned, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} />
            <BarChart title="p95 latency per server (whole run)" format={ms} bars={r.servers.map((s, i) => ({ label: name(i), value: s.p95LatencyMs, color: SERIES_COLORS[i % SERIES_COLORS.length] }))} />
          </div>
        </>
      }
      assumptions={[
        'A normal server completes 10 requests per second; slow servers complete a fraction of that. Every request costs the same.',
        'Requests arrive randomly (Poisson) in 100 ms ticks; each server works through its own FIFO queue.',
        'Least connections sees each server’s exact queue length instantly; real balancers see slightly stale counts.',
        'No timeouts, retries or health checks — a slow server is never removed.',
      ]}
      tryThis={[
        { text: 'Keep round robin with one server at 40% speed. It receives the same share as the fast ones, its queue grows without limit and p95 latency is in seconds.', apply: () => patch({ algorithm: 'rr', slowServers: 1, slowFactor: 0.4, loadPct: 0.8 }) },
        { text: 'Switch to least connections. The slow server automatically gets fewer requests and every queue stays short.', apply: () => patch({ algorithm: 'lc' }) },
        { text: 'Set slow servers to 0 and try all three. With identical servers, round robin is fine — and random is noticeably worse at high load.', apply: () => patch({ slowServers: 0, loadPct: 0.9 }) },
      ]}
    />
  );
}
