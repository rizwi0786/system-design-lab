import { useMemo } from 'react';
import { C, LineChart } from '../charts';
import { RATELIMIT_DEFAULTS, RATELIMIT_SECONDS, simulateRateLimit, type RateAlgorithm, type TrafficPattern } from '../models/ratelimit';
import { sum } from '../models/prng';
import { pct, PlaybackBar, Segmented, SimShell, Slider, Stat, usePlayback, useSimParams } from '../ui';
import type { SimViewProps } from './types';

const ALGOS = ['token', 'fixed', 'sliding'] as const;
const PATTERNS = ['steady', 'bursty', 'edge'] as const;

export default function RateLimitSim({ attrs, compact }: SimViewProps) {
  const { params: p, set, patch, restore } = useSimParams(RATELIMIT_DEFAULTS, attrs, { algorithm: ALGOS, pattern: PATTERNS });
  const r = useMemo(() => simulateRateLimit(p), [p]);
  const pb = usePlayback(RATELIMIT_SECONDS);
  const n = Math.max(1, pb.t);
  const acc = sum(r.accepted.slice(0, n));
  const off = sum(r.offered.slice(0, n));
  const limitText = p.algorithm === 'token' ? `bucket ${p.capacity}, +${p.refillRate}/s` : `${p.capacity} per ${p.windowSec}s window`;
  return (
    <SimShell
      title="Rate limiting"
      description="Compare token bucket, fixed window and sliding window limiters on the same traffic."
      compact={compact}
      onRestore={restore}
      controls={
        <>
          <Segmented<RateAlgorithm>
            label="Algorithm"
            value={p.algorithm}
            onChange={(v) => set('algorithm', v)}
            options={[
              { value: 'token', label: 'Token bucket' },
              { value: 'fixed', label: 'Fixed window' },
              { value: 'sliding', label: 'Sliding window' },
            ]}
          />
          <Segmented<TrafficPattern>
            label="Traffic"
            value={p.pattern}
            onChange={(v) => set('pattern', v)}
            options={[
              { value: 'steady', label: 'Steady' },
              { value: 'bursty', label: 'Bursts' },
              { value: 'edge', label: 'Window edge' },
            ]}
          />
          <Slider label={p.algorithm === 'token' ? 'Bucket capacity' : 'Requests per window'} value={p.capacity} min={1} max={60} onChange={(v) => set('capacity', v)} />
          {p.algorithm === 'token' ? (
            <Slider label="Refill rate" value={p.refillRate} min={1} max={30} onChange={(v) => set('refillRate', v)} format={(v) => `${v}/s`} />
          ) : (
            <Slider label="Window length" value={p.windowSec} min={1} max={10} onChange={(v) => set('windowSec', v)} format={(v) => `${v} s`} />
          )}
        </>
      }
      playback={<PlaybackBar pb={pb} />}
      stats={
        <>
          <Stat label="Limit" value={limitText} />
          <Stat label="Accepted" value={pct(off ? acc / off : 1)} sub={`${acc} of ${off}`} />
          <Stat label="Rejected (429)" value={String(off - acc)} tone={off - acc > 0 ? 'warn' : 'ok'} />
          <Stat
            label={`Most accepted in any ${p.windowSec}s`}
            value={String(r.summary.maxInAnyWindow)}
            sub={p.algorithm === 'token' ? 'burst + refill' : `limit is ${p.capacity}`}
            tone={p.algorithm !== 'token' && r.summary.maxInAnyWindow > p.capacity ? 'bad' : 'neutral'}
          />
        </>
      }
      charts={
        <LineChart
          title="Requests per second"
          t={pb.t}
          series={[
            { label: 'Offered', values: r.offered, color: C.muted, dashed: true },
            { label: 'Accepted', values: r.accepted, color: C.accent, area: true },
            { label: 'Rejected', values: r.rejected, color: C.warn },
          ]}
          height={180}
        />
      }
      assumptions={[
        'One client, one limiter, checked in 100 ms ticks; requests within a tick are spread evenly.',
        'Fixed window resets its counter at multiples of the window length; sliding window keeps an exact log of accepted requests.',
        'Rejected requests are not retried.',
        'The token bucket starts full. The long-run rate is the same for all three when capacity ÷ window = refill rate.',
      ]}
      tryThis={[
        { text: 'Pick “Window edge” traffic with a fixed window: a burst just before and just after a boundary gets 2× the limit through in a few hundred ms.', apply: () => patch({ pattern: 'edge', algorithm: 'fixed' }) },
        { text: 'Switch the same traffic to sliding window. It never accepts more than the limit in any window — at the cost of storing a timestamp per request.', apply: () => patch({ pattern: 'edge', algorithm: 'sliding' }) },
        { text: 'Use Bursts with a token bucket and raise capacity from 10 to 40. A bigger bucket absorbs bursts while the refill rate still caps the long-term average.', apply: () => patch({ pattern: 'bursty', algorithm: 'token', capacity: 40 }) },
      ]}
    />
  );
}
