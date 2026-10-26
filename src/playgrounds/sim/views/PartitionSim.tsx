import { useMemo } from 'react';
import { C, LineChart } from '../charts';
import { PARTITION_DEFAULTS, PARTITION_START, PARTITION_STEPS, simulatePartition, type PartitionMode } from '../models/partition';
import { sum } from '../models/prng';
import { pct, PlaybackBar, Segmented, SimShell, Slider, Stat, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

export default function PartitionSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(PARTITION_DEFAULTS, attrs, { mode: ['CP', 'AP'] });
  const r = useMemo(() => simulatePartition(p), [p]);
  const pb = usePlayback(PARTITION_STEPS);
  const n = Math.max(1, pb.t);
  const end = PARTITION_START + p.partitionSec;
  const healed = pb.t > end;
  const avail = (sum(r.availA.slice(0, n)) + sum(r.availB.slice(0, n))) / (2 * n);
  const stale = sum(r.staleReads.slice(0, n));
  return (
    <SimShell
      title="Network partition (CAP)"
      description="Two regions lose contact. Choose consistency (CP: refuse what you cannot confirm) or availability (AP: keep answering)."
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Segmented<PartitionMode>
            label="During a partition, prefer"
            value={p.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'CP', label: 'Consistency (CP)' },
              { value: 'AP', label: 'Availability (AP)' },
            ]}
          />
          <Slider label="Partition length" value={p.partitionSec} min={5} max={55} onChange={(v) => set('partitionSec', v)} format={(v) => `${v} s`} />
          <Slider label="Requests / s per region" value={p.requestsPerSec} min={5} max={100} step={5} onChange={(v) => set('requestsPerSec', v)} />
          <Slider label="Write share" value={p.writeShare} min={0.05} max={0.9} step={0.05} onChange={(v) => set('writeShare', v)} format={(v) => pct(v)} />
          <Slider label="Distinct keys" value={p.keys} min={5} max={1000} step={5} onChange={(v) => set('keys', v)} hint="Fewer keys = more chance both sides edit the same record" />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Availability" value={pct(avail, 1)} sub="requests answered, both regions" tone={avail < 0.95 ? 'warn' : 'ok'} />
          <Stat label="Stale reads" value={String(stale)} sub={pct(r.summary.stalePct, 1) + ' of reads (whole run)'} tone={stale > 0 ? 'bad' : 'ok'} />
          <Stat label="Conflicting keys" value={healed ? String(r.summary.conflictingKeys) : '…'} sub="written on both sides" tone={healed && r.summary.conflictingKeys > 0 ? 'bad' : 'neutral'} />
          <Stat label="Writes lost on heal" value={healed ? String(r.summary.lostWrites) : '…'} sub="last-writer-wins discards" tone={healed && r.summary.lostWrites > 0 ? 'bad' : 'neutral'} />
        </>
      }
      charts={
        <>
          <LineChart
            title="Share of requests answered"
            t={pb.t}
            series={[
              { label: 'Region A (leader)', values: r.availA, color: C.accent },
              { label: 'Region B', values: r.availB, color: C.warn, dashed: true },
            ]}
            yMax={1}
            yFormat={(v) => pct(v)}
            bands={[{ from: PARTITION_START, to: end, label: 'Partition' }]}
          />
          <LineChart title="Stale reads per second" t={pb.t} series={[{ label: 'Stale reads', values: r.staleReads, color: C.bad, area: true }]} bands={[{ from: PARTITION_START, to: end, label: 'Partition' }]} />
        </>
      }
      assumptions={[
        'Two regions with equal traffic; region A holds the leader (the majority), region B is the minority side.',
        'Outside the partition replication is instant, so every read is fresh.',
        'CP: region B refuses all reads and writes it cannot confirm with the leader; region A carries on.',
        'AP: both regions keep serving. A read is stale if the other side changed that key during the partition. On heal, last-writer-wins keeps the newest write per key.',
        'Keys are chosen uniformly at random; no clocks drift.',
      ]}
      tryThis={[
        { text: 'Run CP. Region B answers nothing during the partition, but no user ever sees wrong data and nothing is lost on heal.', apply: () => patch({ mode: 'CP' }) },
        { text: 'Switch to AP. Every request is answered, yet some reads are stale and dozens of writes are silently discarded on heal — fine for a “likes” counter, not for a bank balance.', apply: () => patch({ mode: 'AP' }) },
        { text: 'In AP, raise distinct keys to 1000. Conflicts become rare because the two sides rarely touch the same record — data shape changes the trade-off.', apply: () => patch({ mode: 'AP', keys: 1000 }) },
      ]}
    />
  );
}
