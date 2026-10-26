import { SIMULATORS } from '../registry';

export default function UnknownSim({ name }: { name: string }) {
  return (
    <div role="alert" className="rounded-xl border border-line bg-warn-soft p-4 text-xs text-warn">
      Unknown simulator “{name}”. Available: {SIMULATORS.map((s) => s.id).join(', ')}.
    </div>
  );
}
