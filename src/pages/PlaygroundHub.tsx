import { Link } from 'react-router-dom';
import { PageHeader, Badge } from '../components/ui';

const ITEMS = [
  { to: '/playground/csharp', title: 'C# coding playground', body: 'Monaco editor with sample programs. Download any program as a .NET 10 project with xUnit tests and run it locally.', tag: 'Runs on your machine' },
  { to: '/playground/sql', title: 'SQL playground', body: 'A real PostgreSQL engine (PGlite, WebAssembly) in your browser: sample schemas, result tables, EXPLAIN plans, reset.', tag: 'Runs in browser' },
  { to: '/playground/lld', title: 'LLD class designer', body: 'Add classes, interfaces and relationships; see the class diagram, generate C# skeletons, and get coupling/cohesion feedback.', tag: 'Runs in browser' },
  { to: '/playground/hld', title: 'HLD architecture canvas', body: 'Drag clients, load balancers, caches, queues and databases; set traffic; get rule-based feedback on single points of failure and latency.', tag: 'Runs in browser' },
  { to: '/playground/api', title: 'API design playground', body: 'Design endpoints, lint them against REST conventions, export OpenAPI 3.1, and detect breaking changes between versions.', tag: 'Runs in browser' },
  { to: '/playground/sim', title: 'Distributed systems simulator', body: 'Simplified models of caches, queues, retry storms, replication lag, partitions, circuit breakers and more.', tag: 'Simplified models' },
  { to: '/playground/decision', title: 'Architecture decision simulator', body: 'Compare two designs under your workload assumptions. Every number is labelled as a calculated estimate or an illustrative assumption.', tag: 'Estimates' },
];

export default function PlaygroundHub() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PageHeader title="Playgrounds">Hands-on tools used throughout the lessons. You can also open them on their own.</PageHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {ITEMS.map(i => (
          <Link key={i.to} to={i.to} className="rounded-lg border border-line bg-surface p-4 hover:border-accent">
            <div className="flex items-start justify-between gap-2"><h2 className="font-semibold text-ink">{i.title}</h2><Badge>{i.tag}</Badge></div>
            <p className="mt-1 text-sm text-ink-2">{i.body}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
