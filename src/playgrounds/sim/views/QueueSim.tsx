import { useMemo } from 'react';
import { C, LineChart } from '../charts';
import { QUEUE_CRASH, QUEUE_DEFAULTS, QUEUE_STEPS, simulateQueue } from '../models/queue';
import { ms, num, pct, PlaybackBar, SimShell, Slider, Stat, Toggle, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

export default function QueueSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(QUEUE_DEFAULTS, attrs);
  const r = useMemo(() => simulateQueue(p), [p]);
  const pb = usePlayback(QUEUE_STEPS);
  const last = Math.max(0, pb.t - 1);
  const u = r.summary.utilisation;
  const bands = p.crash ? [{ ...QUEUE_CRASH, label: 'Consumers crashed' }] : undefined;
  return (
    <SimShell
      title="Message queue"
      description="Producers add messages, consumers take them off. Watch the backlog when consumers cannot keep up."
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Slider label="Producer rate" value={p.producerRate} min={10} max={400} step={5} onChange={(v) => set('producerRate', v)} format={(v) => `${v} msg/s`} />
          <Slider label="Consumers" value={p.consumers} min={1} max={20} onChange={(v) => set('consumers', v)} />
          <Slider label="Processing time" value={p.processingMs} min={5} max={500} step={5} onChange={(v) => set('processingMs', v)} format={ms} hint="Per message, per consumer" />
          <Toggle label="Consumers crash" checked={p.crash} onChange={(v) => set('crash', v)} hint={`All down from ${QUEUE_CRASH.from}s to ${QUEUE_CRASH.to}s`} />
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Consumer capacity" value={`${num(r.summary.capacityPerSec)} msg/s`} />
          <Stat label="Utilisation" value={Number.isFinite(u) ? pct(u) : '∞'} tone={u >= 1 ? 'bad' : u > 0.8 ? 'warn' : 'ok'} sub={u >= 1 ? 'backlog grows forever' : 'keeps up on average'} />
          <Stat label="Backlog now" value={num(r.backlog[last])} />
          <Stat label="Wait for a new message" value={ms(r.latencyMs[last])} tone={r.latencyMs[last] > 5000 ? 'bad' : 'neutral'} />
        </>
      }
      charts={
        <>
          <LineChart title="Backlog (messages waiting)" t={pb.t} series={[{ label: 'Backlog', values: r.backlog, color: C.accent, area: true }]} bands={bands} />
          <LineChart
            title="Messages per second"
            t={pb.t}
            series={[
              { label: 'Produced', values: r.arrivals, color: C.muted, dashed: true },
              { label: 'Processed', values: r.processed, color: C.accent },
            ]}
            bands={bands}
          />
        </>
      }
      assumptions={[
        'Messages arrive randomly (Poisson) around the producer rate; each consumer handles one message at a time.',
        'Processing time is the same for every message; there are no retries or poison messages.',
        "Wait time is estimated with Little's law: backlog ÷ full consumer throughput + processing time.",
        'The queue has unlimited space and never drops messages.',
      ]}
      tryThis={[
        { text: 'Raise the producer rate above the consumer capacity (e.g. 120 msg/s with 4 consumers at 40 ms). Above 100% utilisation the backlog never stops growing.', apply: () => patch({ producerRate: 120, consumers: 4, processingMs: 40, crash: false }) },
        { text: 'Turn on the crash at 80% utilisation. After recovery the backlog drains only at the spare 20% capacity — catching up takes longer than the outage.', apply: () => patch({ producerRate: 80, consumers: 4, processingMs: 40, crash: true }) },
        { text: 'With the crash on, raise consumers to 8. Extra headroom drains the backlog much faster — the reason to over-provision consumers.', apply: () => patch({ consumers: 8, crash: true }) },
      ]}
    />
  );
}
