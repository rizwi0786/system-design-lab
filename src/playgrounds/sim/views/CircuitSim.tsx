import { useMemo } from 'react';
import { C, LineChart, StateStrip } from '../charts';
import { CIRCUIT_DEFAULTS, CIRCUIT_OUTAGE, CIRCUIT_STEPS, simulateCircuit, type CircuitState } from '../models/circuit';
import { sum } from '../models/prng';
import { num, pct, PlaybackBar, SimShell, Slider, Stat, Toggle, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

const COLORS: Record<CircuitState, string> = { closed: C.ok, open: C.bad, 'half-open': C.warn };
const LABELS: Record<CircuitState, string> = { closed: 'Closed', open: 'Open', 'half-open': 'Half-open' };

export default function CircuitSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(CIRCUIT_DEFAULTS, attrs);
  const r = useMemo(() => simulateCircuit(p), [p]);
  const pb = usePlayback(CIRCUIT_STEPS);
  const n = Math.max(1, pb.t);
  const saved = sum(r.shortCircuited.slice(0, n));
  const failed = sum(r.failed.slice(0, n));
  const without = Math.round(sum(r.failureRate.slice(0, n)) * p.rps);
  const state = r.state[Math.max(0, pb.t - 1)];
  return (
    <SimShell
      title="Circuit breaker"
      description="A dependency fails badly for 45 seconds. The breaker stops calling it, then probes until it recovers."
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Toggle label="Circuit breaker enabled" checked={p.breaker} onChange={(v) => set('breaker', v)} />
          <Slider label="Outage failure rate" value={p.outageFailure} min={0} max={1} step={0.05} format={(v) => pct(v)} onChange={(v) => set('outageFailure', v)} />
          <Slider label="Trip threshold" value={p.failureThreshold} min={0.1} max={1} step={0.05} format={(v) => pct(v)} onChange={(v) => set('failureThreshold', v)} hint="Failure share in the rolling window" />
          <Slider label="Rolling window" value={p.windowSec} min={1} max={30} onChange={(v) => set('windowSec', v)} format={(v) => `${v} s`} />
          <Slider label="Min requests to judge" value={p.minRequests} min={1} max={200} onChange={(v) => set('minRequests', v)} />
          <Slider label="Open duration" value={p.openSec} min={1} max={30} onChange={(v) => set('openSec', v)} format={(v) => `${v} s`} />
          <Slider label="Half-open probes" value={p.halfOpenProbes} min={1} max={20} onChange={(v) => set('halfOpenProbes', v)} />
          <Slider label="Calls / s" value={p.rps} min={1} max={100} onChange={(v) => set('rps', v)} />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="State now" value={LABELS[state]} tone={state === 'closed' ? 'ok' : state === 'open' ? 'bad' : 'warn'} />
          <Stat label="Calls saved" value={num(saved)} sub="not sent to a failing dependency" />
          <Stat label="Failed calls" value={num(failed)} sub={`vs ≈${num(without)} without a breaker`} tone={failed > without / 2 ? 'warn' : 'ok'} />
          <Stat label="Times tripped" value={String(r.summary.trips)} sub={r.summary.recoveredAt !== null ? `closed again at ${r.summary.recoveredAt}s` : undefined} />
        </>
      }
      charts={
        <>
          <StateStrip title="Breaker state" states={r.state} t={pb.t} colors={COLORS} labels={LABELS} />
          <LineChart
            title="Calls per second"
            t={pb.t}
            series={[
              { label: 'Sent', values: r.sent, color: C.accent },
              { label: 'Failed', values: r.failed, color: C.bad },
              { label: 'Short-circuited', values: r.shortCircuited, color: C.muted, dashed: true },
            ]}
            bands={[{ ...CIRCUIT_OUTAGE, label: 'Dependency outage' }]}
          />
        </>
      }
      assumptions={[
        'The dependency fails 2% of calls normally and the chosen rate during the outage (30 s – 75 s).',
        'Closed: every call is sent and counted in a rolling window; the breaker opens when failures ≥ threshold and the window has enough calls.',
        'Open: calls fail fast without being sent. After the open duration the breaker goes half-open and sends a few probes; any probe failure re-opens it.',
        'Short-circuited calls get an immediate error — the caller needs a fallback (cached data, default answer).',
      ]}
      tryThis={[
        { text: 'Turn the breaker off. Every call during the outage is sent and fails — each one holding a thread until its timeout.', apply: () => patch({ breaker: false }) },
        { text: 'Set the open duration to 2 s. The breaker flaps between open and half-open, probing constantly; longer waits are calmer but recover later.', apply: () => patch({ breaker: true, openSec: 2 }) },
        { text: 'Set the outage failure rate to 40% with a 50% threshold. The breaker never trips: a dependency that is “only” half-broken slips under the threshold.', apply: () => patch({ breaker: true, outageFailure: 0.4, failureThreshold: 0.5, openSec: 10 }) },
      ]}
    />
  );
}
