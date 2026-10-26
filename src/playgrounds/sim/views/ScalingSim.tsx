import { useMemo } from 'react';
import { C, LineChart } from '../charts';
import { SCALING_DEFAULTS, SCALING_STEPS, SPIKE, simulateScaling } from '../models/scaling';
import { sum } from '../models/prng';
import { num, pct, PlaybackBar, SimShell, Slider, Stat, Toggle, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

export default function ScalingSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(SCALING_DEFAULTS, attrs);
  const r = useMemo(() => simulateScaling(p), [p]);
  const pb = usePlayback(SCALING_STEPS);
  const n = Math.max(1, pb.t);
  const last = n - 1;
  const dropped = sum(r.dropped.slice(0, n));
  const total = sum(r.load.slice(0, n));
  const band = [{ from: SPIKE.rampFrom, to: SPIKE.endAt, label: 'Traffic spike' }];
  return (
    <SimShell
      title="Autoscaling"
      description="Traffic triples for two minutes. Does the fleet grow fast enough, and what is dropped while it does?"
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Slider label="Starting instances" value={p.instances} min={1} max={20} onChange={(v) => set('instances', v)} />
          <Slider label="Capacity per instance" value={p.capacityPerInstance} min={10} max={500} step={10} onChange={(v) => set('capacityPerInstance', v)} format={(v) => `${v} rps`} />
          <Slider label="Spike size" value={p.spikeMultiplier} min={1} max={6} step={0.5} onChange={(v) => set('spikeMultiplier', v)} format={(v) => `${v}×`} />
          <Toggle label="Autoscaling" checked={p.autoscale} onChange={(v) => set('autoscale', v)} />
          <Slider label="Target utilisation" value={p.targetUtil} min={0.3} max={0.95} step={0.05} onChange={(v) => set('targetUtil', v)} format={(v) => pct(v)} />
          <Slider label="Cooldown" value={p.cooldownSec} min={0} max={180} step={5} onChange={(v) => set('cooldownSec', v)} format={(v) => `${v} s`} hint="Minimum time between scaling actions" />
          <Slider label="Instance start-up time" value={p.provisionSec} min={0} max={180} step={5} onChange={(v) => set('provisionSec', v)} format={(v) => `${v} s`} />
          <Slider label="Max instances" value={p.maxInstances} min={1} max={40} onChange={(v) => set('maxInstances', v)} />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Instances now" value={String(r.instances[last])} sub={`peak ${Math.max(...r.instances.slice(0, n))}`} />
          <Stat label="Utilisation now" value={pct(r.util[last])} tone={r.util[last] > 1 ? 'bad' : r.util[last] > 0.85 ? 'warn' : 'ok'} />
          <Stat label="Dropped requests" value={num(dropped)} sub={pct(total ? dropped / total : 0, 1) + ' of traffic'} tone={dropped > 0 ? 'bad' : 'ok'} />
          <Stat label="Avg utilisation" value={pct(r.summary.avgUtil)} sub="whole run; higher = cheaper" />
        </>
      }
      charts={
        <>
          <LineChart
            title="Requests per second vs fleet capacity"
            t={pb.t}
            series={[
              { label: 'Traffic', values: r.load, color: C.accent },
              { label: 'Capacity', values: r.capacity, color: C.muted, dashed: true },
            ]}
            bands={band}
          />
          <LineChart title="Dropped requests per second" t={pb.t} series={[{ label: 'Dropped', values: r.dropped, color: C.bad, area: true }]} bands={band} />
        </>
      }
      assumptions={[
        'Baseline traffic is half of the starting fleet’s capacity, ±5% noise; the spike ramps up over 20 s, holds, then ramps down.',
        'The autoscaler sets instances = ceil(traffic ÷ (capacity × target)) each second, but only once per cooldown period.',
        'New instances serve traffic only after the start-up time. Scale-in removes one instance per cooldown.',
        'Requests above capacity are dropped immediately (no queueing, no retries). Load is spread perfectly evenly.',
      ]}
      tryThis={[
        { text: 'Turn autoscaling off. With a fixed fleet, everything above 4 × 100 rps is dropped for the whole spike.', apply: () => patch({ autoscale: false }) },
        { text: 'With autoscaling on, set cooldown 10 s and start-up 10 s. Drops nearly vanish — reaction time matters more than the scaling formula.', apply: () => patch({ autoscale: true, cooldownSec: 10, provisionSec: 10 }) },
        { text: 'Lower the target utilisation to 40%. You keep spare headroom for spikes, but the average utilisation (your bill efficiency) falls.', apply: () => patch({ autoscale: true, targetUtil: 0.4, cooldownSec: 60, provisionSec: 30 }) },
      ]}
    />
  );
}
