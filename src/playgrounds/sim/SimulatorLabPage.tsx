import { useState } from 'react';
import SimulatorLab from './SimulatorLab';
import { SIMULATORS, type SimName } from './registry';

/** Full-page lab: list of simulators on the left, the chosen one on the right. */
export default function SimulatorLabPage({ initial = 'cache' }: { initial?: SimName }) {
  const [sim, setSim] = useState<SimName>(initial);
  return (
    <div className="min-h-screen bg-bg p-4 text-ink">
      <div className="mb-4">
        <h1 className="text-lg font-semibold">Distributed systems lab</h1>
        <p className="text-xs text-ink-2">
          Small, deterministic models of common distributed-systems behaviour. Change a parameter, press Play, and watch
          what happens. Every model lists its simplifying assumptions.
        </p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <nav aria-label="Simulators">
          <ul className="flex gap-1 overflow-x-auto lg:flex-col lg:overflow-visible">
            {SIMULATORS.map((s) => (
              <li key={s.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setSim(s.id)}
                  aria-current={sim === s.id ? 'page' : undefined}
                  className={`w-full rounded-lg border px-3 py-2 text-left ${
                    sim === s.id ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:bg-surface-2'
                  }`}
                >
                  <span className={`block text-xs font-medium ${sim === s.id ? 'text-accent' : 'text-ink'}`}>{s.title}</span>
                  <span className="block text-[11px] leading-snug text-ink-3 max-lg:hidden">{s.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <main className="min-w-0">
          <SimulatorLab key={sim} sim={sim} />
        </main>
      </div>
    </div>
  );
}
