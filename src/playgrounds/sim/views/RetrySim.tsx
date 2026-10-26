import { useMemo } from 'react';
import { C, LineChart } from '../charts';
import { RETRY_DEFAULTS, RETRY_INCIDENT, RETRY_STEPS, simulateRetry } from '../models/retry';
import { sum } from '../models/prng';
import { pct, PlaybackBar, SimShell, Slider, Stat, Toggle, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

export default function RetrySim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(RETRY_DEFAULTS, attrs);
  const r = useMemo(() => simulateRetry(p), [p]);
  const pb = usePlayback(RETRY_STEPS);
  const n = Math.max(1, pb.t);
  const amp = sum(r.attempts.slice(0, n)) / Math.max(1, sum(r.fresh.slice(0, n)));
  const last = Math.max(0, pb.t - 1);
  const storm = r.load.slice(RETRY_INCIDENT.to + 10, n).some((l) => l > 1);
  return (
    <SimShell
      title="Retries and retry storms"
      description="A dependency has a 15-second incident. Clients retry failed calls. How much extra load do the retries create?"
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Slider label="Failure rate during incident" value={p.failureRate} min={0} max={1} step={0.05} format={(v) => pct(v)} onChange={(v) => set('failureRate', v)} />
          <Slider label="Max retries" value={p.maxRetries} min={0} max={6} onChange={(v) => set('maxRetries', v)} />
          <Slider label="Clients (1 req/s each)" value={p.clients} min={100} max={1200} step={50} onChange={(v) => set('clients', v)} />
          <Slider label="Dependency capacity" value={p.capacityRps} min={500} max={2000} step={50} onChange={(v) => set('capacityRps', v)} format={(v) => `${v} rps`} />
          <Toggle label="Exponential backoff" checked={p.backoff} onChange={(v) => set('backoff', v)} hint="Wait 1, 2, 4, 8 s between tries instead of 1 s" />
          <Toggle label="Jitter" checked={p.jitter} onChange={(v) => set('jitter', v)} hint="Randomise each wait so clients do not retry in lockstep" />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Amplification" value={`${amp.toFixed(2)}×`} sub="attempts ÷ original requests" tone={amp > 2 ? 'bad' : amp > 1.3 ? 'warn' : 'ok'} />
          <Stat label="Load now" value={pct(r.load[last])} sub="of dependency capacity" tone={r.load[last] > 1 ? 'bad' : 'neutral'} />
          <Stat label="Peak load" value={pct(Math.max(...r.load.slice(0, n)))} />
          <Stat label="After the incident" value={pb.t <= RETRY_INCIDENT.to + 10 ? '…' : storm ? 'Storm persists' : 'Recovered'} tone={storm ? 'bad' : 'ok'} />
        </>
      }
      charts={
        <>
          <LineChart
            title="Calls per second reaching the dependency"
            t={pb.t}
            series={[
              { label: 'All attempts', values: r.attempts, color: C.accent, area: true },
              { label: 'Original requests', values: r.fresh, color: C.muted, dashed: true },
            ]}
            refLine={{ y: p.capacityRps, label: 'capacity' }}
            bands={[{ ...RETRY_INCIDENT, label: 'Incident' }]}
          />
          <LineChart
            title="Requests that gave up (per second)"
            t={pb.t}
            series={[{ label: 'Gave up', values: r.gaveUp, color: C.bad }]}
            bands={[{ ...RETRY_INCIDENT, label: 'Incident' }]}
          />
        </>
      }
      assumptions={[
        'Traffic is modelled as fluid counts per second (no individual clients); one new request per client per second.',
        'Outside the incident the dependency fails 1% of calls.',
        'Past capacity, useful throughput collapses (timeouts and thrashing): at 2× load it completes only 20% of its capacity.',
        'Jitter is “full jitter”: each retry waits a random time up to twice the backoff delay, spread evenly.',
        'Clients have no retry budget or circuit breaker.',
      ]}
      tryThis={[
        { text: 'Raise clients to 900. The incident pushes load past capacity, retries keep it there, and the storm continues long after the dependency is healthy again (a metastable failure).', apply: () => patch({ clients: 900, maxRetries: 3, backoff: false, jitter: false }) },
        { text: 'Now turn on backoff and jitter. Peaks get lower and smoother, but at 900 clients the storm still persists — backoff spreads retries, it does not remove them. Cut retries to 1 and compare.', apply: () => patch({ clients: 900, backoff: true, jitter: true }) },
        { text: 'Set max retries to 0 with 900 clients. Some requests fail during the incident, but the system recovers the moment the dependency does.', apply: () => patch({ clients: 900, maxRetries: 0 }) },
      ]}
    />
  );
}
