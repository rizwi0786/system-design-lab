import { useState } from 'react';
import { COMPARISONS, type Workload } from '../lib/decision';
import { Badge, Card, PageHeader, cx } from '../components/ui';

function Num({ label, value, onChange, min, max, step, suffix }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number; step: number; suffix?: string }) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-2">
      <span className="flex justify-between"><span>{label}</span><span className="tabular-nums text-ink">{value.toLocaleString()}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(Number(e.target.value))} className="accent-[var(--color-accent)]" />
    </label>
  );
}

export default function DecisionSimulator() {
  const [cmp, setCmp] = useState(COMPARISONS[0].id);
  const [w, setW] = useState<Workload>({ rps: 2000, readRatio: 0.9, teamSize: 12, strongConsistency: false, monthlyBudgetUsd: 5000, dataGb: 200 });
  const c = COMPARISONS.find(x => x.id === cmp)!;
  const [a, b] = c.evaluate(w);
  const set = (p: Partial<Workload>) => setW({ ...w, ...p });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <PageHeader title="Architecture decision simulator">
        Compare two designs under your own workload. These are simplified, transparent models to build intuition — not measurements. Every number shows its formula and is labelled <Badge tone="accent">calculated estimate</Badge> (derived from your inputs) or <Badge tone="warn">illustrative assumption</Badge> (a typical figure you should replace with your own data).
      </PageHeader>
      <div className="mb-4 flex flex-wrap gap-2" role="tablist">
        {COMPARISONS.map(x => <button key={x.id} role="tab" aria-selected={cmp === x.id} onClick={() => setCmp(x.id)} className={cx('rounded-md border px-3 py-1.5 text-sm', cmp === x.id ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface text-ink-2 hover:bg-surface-2')}>{x.title}</button>)}
      </div>
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card title="Workload assumptions">
          <div className="space-y-4">
            <Num label="Peak requests per second" value={w.rps} min={50} max={100000} step={50} onChange={rps => set({ rps })} />
            <Num label="Read share of traffic" value={Math.round(w.readRatio * 100)} min={0} max={100} step={5} suffix=" %" onChange={v => set({ readRatio: v / 100 })} />
            <Num label="Engineering team size" value={w.teamSize} min={1} max={200} step={1} onChange={teamSize => set({ teamSize })} />
            <Num label="Monthly infrastructure budget" value={w.monthlyBudgetUsd} min={200} max={200000} step={100} suffix=" USD" onChange={monthlyBudgetUsd => set({ monthlyBudgetUsd })} />
            <Num label="Data size" value={w.dataGb} min={1} max={50000} step={10} suffix=" GB" onChange={dataGb => set({ dataGb })} />
            <label className="flex items-center gap-2 text-sm text-ink-2"><input type="checkbox" checked={w.strongConsistency} onChange={e => set({ strongConsistency: e.target.checked })} className="accent-[var(--color-accent)]" />Strong consistency required</label>
          </div>
        </Card>
        <div className="min-w-0 space-y-4">
          <p className="text-sm font-medium text-ink">{c.question}</p>
          <div className="grid gap-4 md:grid-cols-2">
            {[a, b].map(o => (
              <Card key={o.name} title={o.name}>
                <table className="w-full text-sm">
                  <tbody>
                    {o.metrics.map(m => (
                      <tr key={m.label} className="border-b border-line last:border-0 align-top">
                        <td className="py-2 pr-2 text-ink-2">{m.label}<div className="text-[11px] text-ink-3">{m.formula}</div></td>
                        <td className="py-2 text-right"><div className="font-medium tabular-nums text-ink">{m.value}</div><Badge tone={m.provenance === 'calculated estimate' ? 'accent' : 'warn'}>{m.provenance}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Failure modes</h3>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-ink-2">{o.failureModes.map(f => <li key={f}>{f}</li>)}</ul>
                <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-ink-3">Better when</h3>
                <p className="mt-1 text-sm text-ink">{o.whenBetter}</p>
              </Card>
            ))}
          </div>
          <Card title="Model assumptions">
            <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{c.assumptions.map(x => <li key={x}>{x}</li>)}</ul>
            <p className="mt-2 text-xs text-ink-3">Unit prices are illustrative round numbers, not quotes from any cloud provider. Measure latency and cost on your own workload before deciding.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
