import { useMemo, useState } from 'react';
import { BarChart, C, LineChart } from '../charts';
import { CH_DEFAULT_OPS, CH_DEFAULTS, simulateConsistentHash, type HashOp } from '../models/consistentHash';
import { pct, PlaybackBar, SimShell, Slider, Stat, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

const btn = 'inline-flex items-center rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50';

export default function ConsistentHashSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(CH_DEFAULTS, attrs);
  const [ops, setOps] = useState<HashOp[]>(CH_DEFAULT_OPS);
  const steps = useMemo(() => simulateConsistentHash(p, ops), [p, ops]);
  const pb = usePlayback(steps.length);
  const cur = steps[Math.max(0, pb.t - 1)];
  const changes = steps.slice(1, Math.max(1, pb.t));
  const xf = (i: number) => (i === 0 ? 'start' : `${i}: ${steps[i]?.op ?? ''}`);
  const addOp = (op: HashOp) => {
    setOps((o) => [...o, op].slice(-20));
  };
  return (
    <SimShell
      title="Consistent hashing"
      description="Spread keys across cache nodes. When a node joins or leaves, how many keys have to move?"
      compact={compact}
      onRestore={() => {
        restore();
        setOps(CH_DEFAULT_OPS);
      }}
      controls={
        <>
          <Slider label="Starting nodes" value={p.nodes} min={1} max={16} onChange={(v) => set('nodes', v)} />
          <Slider label="Virtual nodes per node" value={p.vnodes} min={1} max={300} onChange={(v) => set('vnodes', v)} hint="Points each node owns on the ring" />
          <Slider label="Keys" value={p.keys} min={1000} max={50000} step={1000} onChange={(v) => set('keys', v)} />
          <div>
            <div className="mb-1 text-xs text-ink-2">Change membership</div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className={btn} onClick={() => addOp('add')}>
                + Add node
              </button>
              <button type="button" className={btn} onClick={() => addOp('remove')} disabled={(cur?.nodes.length ?? 1) <= 1}>
                − Remove node
              </button>
              <button type="button" className={btn} onClick={() => setOps([])}>
                Clear history
              </button>
            </div>
            <p className="mt-1 text-[11px] text-ink-3">{ops.length} changes in the script. Use Play/Step to walk through them.</p>
          </div>
        </>
      }
      playback={<PlaybackBar pb={pb} unit="" label="Step" />}
      stats={
        <>
          <Stat label="Nodes now" value={String(cur?.nodes.length ?? 0)} sub={cur?.op === 'start' ? 'start' : `after “${cur?.op}”`} />
          <Stat label="Keys moved (ring)" value={cur && cur.op !== 'start' ? pct(cur.movedConsistent, 1) : '—'} sub={cur && cur.op !== 'start' ? `ideal ≈ ${pct(cur.ideal, 1)}` : undefined} tone="ok" />
          <Stat label="Keys moved (modulo)" value={cur && cur.op !== 'start' ? pct(cur.movedModulo, 1) : '—'} sub="hash(key) mod N" tone={cur && cur.movedModulo > 0.5 ? 'bad' : 'neutral'} />
          <Stat label="Busiest node" value={cur ? `${cur.maxOverAvg.toFixed(2)}×` : '—'} sub="keys vs average (1.00 = even)" tone={cur && cur.maxOverAvg > 1.5 ? 'warn' : 'ok'} />
        </>
      }
      charts={
        <>
          <LineChart
            title="Share of keys that changed node, per membership change"
            t={pb.t}
            series={[
              { label: 'Modulo hashing', values: steps.map((s) => s.movedModulo), color: C.bad },
              { label: 'Consistent hashing', values: steps.map((s) => s.movedConsistent), color: C.accent },
              { label: 'Ideal (1/N)', values: steps.map((s) => s.ideal), color: C.muted, dashed: true },
            ]}
            yMax={1}
            yFormat={(v) => pct(v)}
            xFormat={xf}
          />
          {cur && <BarChart title={`Keys per node now (${cur.nodes.length} nodes, consistent hashing)`} bars={cur.distribution.map((d) => ({ label: d.node, value: d.keys }))} refValue={{ value: p.keys / cur.nodes.length, label: 'perfectly even share' }} />}
          {changes.length > 0 && (
            <p className="text-[11px] text-ink-3">
              Average so far: ring moved {pct(changes.reduce((a, s) => a + s.movedConsistent, 0) / changes.length, 1)} of keys per change, modulo moved{' '}
              {pct(changes.reduce((a, s) => a + s.movedModulo, 0) / changes.length, 1)}.
            </p>
          )}
        </>
      }
      assumptions={[
        'Keys are named key-0, key-1, …; nodes and their virtual nodes are hashed with a 32-bit FNV-1a + mix function.',
        'A key belongs to the first virtual node clockwise from its hash on the ring.',
        'Modulo hashing assigns hash(key) mod N to the N-th node in a list; adding or removing changes N for every key.',
        '“Remove” takes away the most recently listed node. Replication and data transfer time are not modelled.',
      ]}
      tryThis={[
        { text: 'Step through the script. Each change moves roughly 1/N of keys with the ring, but 70–90% with modulo — a cache flush every time you scale.' },
        { text: 'Set virtual nodes to 1. Moves are still small, but the busiest node holds far more than its share — hot spots.', apply: () => patch({ vnodes: 1 }) },
        { text: 'Set virtual nodes to 200. Load evens out to within a few percent; the price is a bigger ring to store and search.', apply: () => patch({ vnodes: 200 }) },
      ]}
    />
  );
}
