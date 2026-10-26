import { useId, useState, type ComponentType } from 'react';
import { isSimName, SIMULATORS, type SimName } from './registry';
import CacheSim from './views/CacheSim';
import CircuitSim from './views/CircuitSim';
import ConsistentHashSim from './views/ConsistentHashSim';
import LoadBalancerSim from './views/LoadBalancerSim';
import PartitionSim from './views/PartitionSim';
import QueueSim from './views/QueueSim';
import RateLimitSim from './views/RateLimitSim';
import ReplicationSim from './views/ReplicationSim';
import RetrySim from './views/RetrySim';
import ScalingSim from './views/ScalingSim';
import ShellFallback from './views/UnknownSim';
import type { SimViewProps } from './views/types';

export { SIMULATORS, isSimName } from './registry';
export type { SimName, SimulatorInfo } from './registry';

const VIEWS: Record<SimName, ComponentType<SimViewProps>> = {
  cache: CacheSim,
  queue: QueueSim,
  retry: RetrySim,
  ratelimit: RateLimitSim,
  replication: ReplicationSim,
  circuit: CircuitSim,
  scaling: ScalingSim,
  partition: PartitionSim,
  loadbalancer: LoadBalancerSim,
  'consistent-hash': ConsistentHashSim,
};

export interface SimulatorLabProps {
  /** Which simulator to show. When omitted, a picker lets the learner choose. */
  sim?: SimName;
  /** Initial parameters from lesson markup, e.g. { hitRatio: '0.8' }. */
  attrs?: Record<string, string>;
  compact?: boolean;
}

export default function SimulatorLab({ sim, attrs, compact }: SimulatorLabProps) {
  const [picked, setPicked] = useState<SimName>('cache');
  const pickerId = useId();
  if (sim !== undefined) {
    if (!isSimName(sim)) return <ShellFallback name={String(sim)} />;
    const View = VIEWS[sim];
    return <View attrs={attrs} compact={compact} />;
  }
  const View = VIEWS[picked];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={pickerId} className="text-xs font-medium text-ink-2">
          Simulator
        </label>
        <select
          id={pickerId}
          value={picked}
          onChange={(e) => isSimName(e.target.value) && setPicked(e.target.value)}
          className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
        >
          {SIMULATORS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </div>
      <View key={picked} attrs={attrs} compact={compact} />
    </div>
  );
}
