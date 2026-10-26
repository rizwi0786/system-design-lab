import { useMemo } from 'react';
import { C, LineChart } from '../charts';
import { expectedStaleShare, REPLICATION_DEFAULTS, REPLICATION_SPIKE, REPLICATION_STEPS, RYW_PIN_MS, simulateReplication, type ReadStrategy } from '../models/replication';
import { mean } from '../models/prng';
import { ms, pct, PlaybackBar, Segmented, SimShell, Slider, Stat, Toggle, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

export default function ReplicationSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(REPLICATION_DEFAULTS, attrs, { readFrom: ['replica', 'primary', 'ryw'] });
  const r = useMemo(() => simulateReplication(p), [p]);
  const pb = usePlayback(REPLICATION_STEPS);
  const n = Math.max(1, pb.t);
  const stale = mean(r.staleRate.slice(0, n));
  const primary = mean(r.primaryReadShare.slice(0, n));
  return (
    <SimShell
      title="Replication lag"
      description="A user saves something, then reads it back. If the read goes to a replica that has not caught up, they see old data."
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Slider label="Average replication lag" value={p.lagMs} min={0} max={2000} step={10} onChange={(v) => set('lagMs', v)} format={ms} />
          <Slider label="Read happens after write" value={p.readDelayMs} min={0} max={3000} step={10} onChange={(v) => set('readDelayMs', v)} format={ms} />
          <Slider label="Writes / s" value={p.writesPerSec} min={10} max={200} step={10} onChange={(v) => set('writesPerSec', v)} />
          <Segmented<ReadStrategy>
            label="Read the user's own data from"
            value={p.readFrom}
            onChange={(v) => set('readFrom', v)}
            options={[
              { value: 'replica', label: 'Replica' },
              { value: 'primary', label: 'Primary' },
              { value: 'ryw', label: 'Read-your-writes' },
            ]}
          />
          <Toggle label="Lag spike" checked={p.lagSpike} onChange={(v) => set('lagSpike', v)} hint={`10× lag from ${REPLICATION_SPIKE.from}s to ${REPLICATION_SPIKE.to}s`} />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Stale reads" value={pct(stale, 1)} tone={stale > 0.05 ? 'bad' : stale > 0 ? 'warn' : 'ok'} />
          <Stat label="Expected (no spike)" value={p.readFrom === 'replica' ? pct(expectedStaleShare(p.lagMs, p.readDelayMs), 1) : '0%'} sub="P(lag > read delay)" />
          <Stat label="Reads on primary" value={pct(primary)} sub="load you cannot spread" tone={primary > 0.5 ? 'warn' : 'neutral'} />
          <Stat label="Avg lag now" value={ms(r.avgLagMs[Math.max(0, pb.t - 1)])} />
        </>
      }
      charts={
        <>
          <LineChart
            title="Share of read-after-write reads that were stale"
            t={pb.t}
            series={[{ label: 'Stale', values: r.staleRate, color: C.bad, area: true }]}
            yMax={1}
            yFormat={(v) => pct(v)}
            bands={p.lagSpike ? [{ ...REPLICATION_SPIKE, label: 'Lag spike' }] : undefined}
          />
          <LineChart
            title="Average replication lag (ms)"
            t={pb.t}
            series={[{ label: 'Lag', values: r.avgLagMs, color: C.accent }]}
            refLine={{ y: p.readDelayMs, label: 'read delay' }}
            bands={p.lagSpike ? [{ ...REPLICATION_SPIKE, label: 'Lag spike' }] : undefined}
          />
        </>
      }
      assumptions={[
        'Asynchronous replication with one replica; lag per write is random (exponential) around the average.',
        'Every write is followed by one read of that same data by the same user, after the chosen delay.',
        `Read-your-writes routes a user's reads to the primary for ${RYW_PIN_MS} ms after their own write; other users' reads are not modelled.`,
        'The primary never fails and never lags itself.',
      ]}
      tryThis={[
        { text: 'Set lag 200 ms and read after 100 ms. About 60% of users see their own change missing — the classic “I saved it but it is gone” bug.', apply: () => patch({ lagMs: 200, readDelayMs: 100, readFrom: 'replica', lagSpike: false }) },
        { text: 'Switch to read-your-writes. Stale reads drop to 0%, but those reads now hit the primary — the trade is consistency for primary load.', apply: () => patch({ readFrom: 'ryw' }) },
        { text: 'Back on replica with a 1 s read delay, turn on the lag spike. A replica that is “usually fine” becomes stale exactly when the database is busiest.', apply: () => patch({ readFrom: 'replica', readDelayMs: 1000, lagSpike: true }) },
      ]}
    />
  );
}
