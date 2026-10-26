import { useState } from 'react';
import { Link } from 'react-router-dom';
import { lessonById } from '../lib/content';
import { actions, useProgress } from '../lib/progress';
import { Badge, Card, PageHeader, Progress, StatusBadge, cx } from '../components/ui';

interface Project { id: string; title: string; lessonId: string; summary: string; milestones: { title: string; tasks: string[] }[]; lessons: string[] }

const CAPSTONE_DELIVERABLES = ['Requirements document', 'HLD document', 'LLD document', 'Architecture diagrams (C4 context + container)', 'API specification (OpenAPI)', 'Database schema and migrations', 'Complete implementation', 'Unit and integration tests', 'Security review', 'Performance tests', 'Failure scenarios tested', 'Deployment instructions', 'Operational runbook', 'Cost and scaling analysis', 'Architecture Decision Records', 'Final architecture review'];

export const PROJECTS: Project[] = [
  { id: 'employee-api', title: 'Employee management REST API', lessonId: 'm03-layers', summary: 'Module 3 project: a complete ASP.NET Core API with layers, PostgreSQL, validation, auth, logging and tests.',
    lessons: ['m03-request-lifecycle', 'm03-dependency-injection', 'm03-dtos-mapping-validation', 'm03-authn-authz', 'm03-logging'],
    milestones: [
      { title: 'Skeleton', tasks: ['Create solution with Api, Domain, Infrastructure and Tests projects', 'Health endpoint and structured logging', 'Docker Compose with PostgreSQL'] },
      { title: 'Core feature', tasks: ['Employee entity, DTOs and validation', 'Repository with parameterised SQL or EF Core', 'CRUD endpoints with correct status codes and ProblemDetails'] },
      { title: 'Production concerns', tasks: ['JWT or cookie authentication + policy authorisation', 'Pagination, filtering and sorting', 'Global exception handling and correlation ids'] },
      { title: 'Quality', tasks: ['Unit tests for services', 'Integration tests with a real PostgreSQL (Testcontainers)', 'README with run instructions'] },
    ] },
  { id: 'order-domain', title: 'Order management domain (DDD)', lessonId: 'm08-order-management-project', summary: 'Module 8 project: products, customers, orders, payments, inventory reservations and order status transitions.',
    lessons: ['m08-aggregates', 'm08-domain-events', 'm08-transaction-boundaries', 'm06-state'],
    milestones: [
      { title: 'Model', tasks: ['Identify aggregates and invariants', 'Value objects for Money, Quantity, Address', 'Order state machine with allowed transitions'] },
      { title: 'Behaviour', tasks: ['Domain events for OrderPlaced, PaymentCaptured, StockReserved', 'Application services and transaction boundaries', 'Sequence diagram for checkout'] },
      { title: 'Tests', tasks: ['Unit tests for every invariant', 'Integration test for checkout flow'] },
    ] },
  { id: 'async-workers', title: 'Caching and messaging projects', lessonId: 'm12-cache-patterns', summary: 'Module 12 projects: Redis caching, a RabbitMQ notification worker, retries, DLQ, idempotency, and cache invalidation failures.',
    lessons: ['m12-cache-patterns', 'm12-rabbitmq', 'm12-retries-dlq', 'm12-idempotent-consumers', 'm12-outbox'],
    milestones: [
      { title: 'Caching', tasks: ['Add Redis cache-aside to a product API', 'Measure hit ratio and latency before/after', 'Demonstrate a cache invalidation failure and fix it'] },
      { title: 'Messaging', tasks: ['Background notification worker using RabbitMQ', 'Retries with backoff and a dead-letter queue', 'Demonstrate duplicate delivery', 'Fix duplicate payment/order processing with idempotency'] },
    ] },
  ...(['a', 'b', 'c'] as const).map(k => ({
    id: `capstone-${k}`,
    title: k === 'a' ? 'Capstone A — Enterprise modular monolith' : k === 'b' ? 'Capstone B — Distributed order processing' : 'Capstone C — Production-style communication platform',
    lessonId: `m20-capstone-${k}`,
    summary: k === 'a' ? 'Project and contract management system: ASP.NET Core, PostgreSQL, auth, validation, background processing, automated tests.'
      : k === 'b' ? 'Independently deployable services with Redis, RabbitMQ, idempotency, retries, DLQs and a saga or another justified consistency strategy.'
        : 'Real-time communication or asynchronous workflows with search, caching, observability, Docker and deployment documentation.',
    lessons: k === 'a' ? ['m02-modular-monolith', 'm08-ddd-modular-monolith', 'm03-background-services'] : k === 'b' ? ['m12-sagas', 'm12-outbox', 'm12-idempotent-consumers', 'm16-saga-orchestration-choreography'] : ['m10-realtime', 'm16-search-architecture', 'm14-observability', 'm15-docker'],
    milestones: [
      { title: 'Design', tasks: CAPSTONE_DELIVERABLES.slice(0, 6) },
      { title: 'Build', tasks: CAPSTONE_DELIVERABLES.slice(6, 8) },
      { title: 'Operate', tasks: CAPSTONE_DELIVERABLES.slice(8) },
    ],
  })),
];

export default function Projects() {
  const p = useProgress();
  const [open, setOpen] = useState<string | null>(PROJECTS[0].id);
  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <PageHeader title="Projects workspace">
        Track the module projects and the three capstones: tick off milestones, keep notes and decisions, and jump to the lessons each one relies on. Your checklist and notes are saved in this browser. Project briefs whose lesson is still Planned are marked so.
      </PageHeader>
      <div className="space-y-3">
        {PROJECTS.map(pr => {
          const rec = p.projects[pr.id] ?? { checks: {}, notes: '' };
          const tasks = pr.milestones.flatMap(m => m.tasks);
          const done = tasks.filter(t => rec.checks[t]).length;
          const l = lessonById.get(pr.lessonId);
          const isOpen = open === pr.id;
          return (
            <Card key={pr.id}>
              <button className="flex w-full flex-wrap items-start justify-between gap-2 text-left" onClick={() => setOpen(isOpen ? null : pr.id)} aria-expanded={isOpen}>
                <div className="min-w-0">
                  <h2 className="font-semibold text-ink">{pr.title}</h2>
                  <p className="text-sm text-ink-2">{pr.summary}</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-ink-3">{done}/{tasks.length} tasks <StatusBadge status={l?.status ?? 'planned'} /></div>
              </button>
              <Progress className="mt-3" value={(done / tasks.length) * 100} />
              {isOpen && (
                <div className="mt-4 space-y-4">
                  <div className="text-sm">Brief: <Link className="text-accent" to={`/lesson/${pr.lessonId}`}>{l?.title ?? pr.lessonId}</Link>{!l?.hasContent && <Badge className="ml-2">brief not written yet</Badge>}</div>
                  {pr.milestones.map(m => (
                    <fieldset key={m.title}>
                      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">{m.title}</legend>
                      <ul className="space-y-1">
                        {m.tasks.map(t => (
                          <li key={t}><label className={cx('flex items-center gap-2 text-sm', rec.checks[t] ? 'text-ink-3 line-through' : 'text-ink')}>
                            <input type="checkbox" checked={!!rec.checks[t]} onChange={e => actions.setProject(pr.id, { checks: { [t]: e.target.checked } })} className="accent-[var(--color-accent)]" />{t}</label></li>
                        ))}
                      </ul>
                    </fieldset>
                  ))}
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-3">Lessons this project uses</div>
                    <div className="flex flex-wrap gap-1.5">{pr.lessons.map(id => <Link key={id} to={`/lesson/${id}`} className={cx('rounded border px-2 py-0.5 text-xs', p.completed[id] ? 'border-ok/40 bg-ok-soft text-ok' : 'border-line text-ink-2 hover:bg-surface-2')}>{lessonById.get(id)?.title ?? id}</Link>)}</div>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-3">Notes, decisions and repository link</span>
                    <textarea value={rec.notes} onChange={e => actions.setProject(pr.id, { notes: e.target.value })} rows={4} placeholder="e.g. ADR-001: chose a modular monolith because…" className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm text-ink" />
                  </label>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
