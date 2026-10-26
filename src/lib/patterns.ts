// The Pattern Atlas catalogue: every pattern the course teaches, grouped by category, each pointing at
// the lesson that teaches it. Lessons can also declare patterns in frontmatter (`patterns:`); those are
// merged in at runtime so the atlas never goes out of date.
export type PatternCategory =
  | 'Creational' | 'Structural' | 'Behavioral' | 'Enterprise & .NET' | 'Concurrency' | 'Resilience'
  | 'Messaging' | 'Data & consistency' | 'Cloud & distributed' | 'Architectural' | 'Anti-patterns';

export interface PatternEntry { name: string; category: PatternCategory; lessonId: string; intent: string; gof?: boolean }

export const CATEGORY_ORDER: PatternCategory[] = ['Creational', 'Structural', 'Behavioral', 'Enterprise & .NET', 'Concurrency', 'Resilience', 'Messaging', 'Data & consistency', 'Cloud & distributed', 'Architectural', 'Anti-patterns'];

export const CATEGORY_BLURB: Record<PatternCategory, string> = {
  Creational: 'How objects get created, so the code that uses them does not depend on how they are built.',
  Structural: 'How classes and objects fit together into bigger structures.',
  Behavioral: 'How objects share work and talk to each other.',
  'Enterprise & .NET': 'Patterns you meet every day in ASP.NET Core business applications.',
  Concurrency: 'Doing many things at once without corrupting shared state.',
  Resilience: 'Staying up when the things you depend on are slow or down.',
  Messaging: 'Decoupling producers and consumers with queues and streams.',
  'Data & consistency': 'Keeping data correct across services, caches and databases.',
  'Cloud & distributed': 'Patterns for systems spread over many machines and regions.',
  Architectural: 'Whole-system shapes and the rules for organising code at scale.',
  'Anti-patterns': 'Common designs that look reasonable and cause pain later.',
};

const P = (category: PatternCategory, name: string, lessonId: string, intent: string, gof = false): PatternEntry => ({ name, category, lessonId, intent, gof });

export const PATTERNS: PatternEntry[] = [
  P('Creational', 'Singleton', 'm06-singleton', 'Exactly one instance, with a global access point.', true),
  P('Creational', 'Factory Method', 'm06-factory-method', 'Let subclasses decide which class to create.', true),
  P('Creational', 'Abstract Factory', 'm06-abstract-factory', 'Create families of related objects without naming concrete classes.', true),
  P('Creational', 'Builder', 'm06-builder', 'Construct a complex object step by step.', true),
  P('Creational', 'Prototype', 'm06-prototype', 'Create new objects by copying an existing one.', true),
  P('Creational', 'Object Pool', 'm06-object-pool', 'Reuse expensive objects instead of creating them each time.'),
  P('Structural', 'Adapter', 'm06-adapter', 'Make an incompatible interface fit the one you expect.', true),
  P('Structural', 'Decorator', 'm06-decorator', 'Add behaviour by wrapping an object in another with the same interface.', true),
  P('Structural', 'Facade', 'm06-facade', 'One simple entry point in front of a complex subsystem.', true),
  P('Structural', 'Proxy', 'm06-proxy', 'A stand-in that controls access to the real object.', true),
  P('Structural', 'Composite', 'm06-composite', 'Treat single objects and trees of objects the same way.', true),
  P('Structural', 'Bridge', 'm06-bridge', 'Separate an abstraction from its implementation so both can vary.', true),
  P('Structural', 'Flyweight', 'm06-flyweight', 'Share common state between many small objects.', true),
  P('Behavioral', 'Strategy', 'm06-strategy', 'Swap algorithms behind one interface.', true),
  P('Behavioral', 'Observer', 'm06-observer', 'Notify subscribers when something changes.', true),
  P('Behavioral', 'Command', 'm06-command', 'Turn a request into an object you can queue, log or undo.', true),
  P('Behavioral', 'State', 'm06-state', 'Change behaviour when internal state changes.', true),
  P('Behavioral', 'Template Method', 'm06-template-method', 'Fixed algorithm skeleton with overridable steps.', true),
  P('Behavioral', 'Chain of Responsibility', 'm06-chain-of-responsibility', 'Pass a request along handlers until one deals with it.', true),
  P('Behavioral', 'Mediator', 'm06-mediator', 'Objects talk through a hub instead of to each other.', true),
  P('Behavioral', 'Iterator', 'm06-iterator', 'Walk a collection without exposing its internals.', true),
  P('Behavioral', 'Memento', 'm06-memento', 'Capture and restore an object’s state (undo).', true),
  P('Behavioral', 'Visitor', 'm06-visitor', 'Add operations to a class hierarchy without changing it.', true),
  P('Behavioral', 'Interpreter', 'm06-interpreter', 'Evaluate sentences of a small language.', true),
  P('Behavioral', 'Null Object', 'm06-null-object', 'A do-nothing object instead of null checks.'),
  P('Enterprise & .NET', 'Specification', 'm06-specification', 'Business rules as composable objects.'),
  P('Enterprise & .NET', 'Repository', 'm06-repository-uow', 'Collection-like access to aggregates, hiding persistence.'),
  P('Enterprise & .NET', 'Unit of Work', 'm06-repository-uow', 'Track changes and commit them in one transaction.'),
  P('Enterprise & .NET', 'Dependency Injection', 'm06-dependency-injection-pattern', 'Objects receive their dependencies instead of creating them.'),
  P('Enterprise & .NET', 'Options pattern', 'm06-options-result', 'Strongly-typed configuration with IOptions<T>.'),
  P('Enterprise & .NET', 'Result pattern', 'm06-options-result', 'Return success-or-error values instead of throwing for expected failures.'),
  P('Enterprise & .NET', 'Pipeline / Middleware', 'm06-pipeline', 'A chain of steps each processing and passing on a request.'),
  P('Enterprise & .NET', 'Service Locator (anti-pattern)', 'm04-di-vs-service-locator', 'Pulling dependencies from a global registry — and why to avoid it.'),
  P('Enterprise & .NET', 'Domain Events', 'm08-domain-events', 'Record that something meaningful happened in the domain.'),
  P('Enterprise & .NET', 'Aggregate', 'm08-aggregates', 'A consistency boundary with one root entity.'),
  P('Enterprise & .NET', 'Value Object', 'm08-entities-value-objects', 'Immutable values compared by content, not identity.'),
  P('Concurrency', 'Producer–Consumer', 'm13-concurrency-patterns', 'Decouple producing work from processing it with a bounded buffer.'),
  P('Concurrency', 'Thread Pool', 'm13-concurrency-patterns', 'Reuse a fixed set of worker threads.'),
  P('Concurrency', 'Actor model', 'm13-concurrency-patterns', 'Isolated actors that communicate only by messages.'),
  P('Concurrency', 'Read–Write Lock', 'm13-concurrency-patterns', 'Many readers or one writer.'),
  P('Concurrency', 'Double-Checked Locking', 'm13-concurrency-patterns', 'Lazy initialisation with minimal locking (and its pitfalls).'),
  P('Concurrency', 'Async/await and channels', 'm03-async-await', 'Non-blocking I/O and in-process queues in .NET.'),
  P('Concurrency', 'Optimistic concurrency', 'm09-locking', 'Detect conflicting writes with a version check instead of locks.'),
  P('Resilience', 'Timeout', 'm10-timeouts-retries', 'Never wait forever for a dependency.'),
  P('Resilience', 'Retry with backoff and jitter', 'm10-timeouts-retries', 'Retry transient failures without causing a stampede.'),
  P('Resilience', 'Circuit Breaker', 'm10-circuit-breaker', 'Stop calling a failing dependency for a while.'),
  P('Resilience', 'Bulkhead', 'm10-bulkhead', 'Isolate resources so one failure cannot sink everything.'),
  P('Resilience', 'Fallback', 'm10-bulkhead', 'Serve a degraded answer when the real one is unavailable.'),
  P('Resilience', 'Rate Limiting', 'm10-rate-limiting', 'Cap how many requests a client may make.'),
  P('Resilience', 'Idempotency Key', 'm10-idempotency', 'Make retries safe by recognising repeated requests.'),
  P('Resilience', 'Backpressure & Load Shedding', 'm13-backpressure', 'Push back or drop work instead of collapsing.'),
  P('Resilience', 'Health Endpoint Monitoring', 'm03-health-shutdown', 'Expose liveness and readiness for orchestrators.'),
  P('Messaging', 'Publish–Subscribe', 'm12-messaging-patterns', 'One event, many independent subscribers.'),
  P('Messaging', 'Competing Consumers', 'm12-messaging-patterns', 'Several workers share one queue.'),
  P('Messaging', 'Claim Check', 'm12-messaging-patterns', 'Send a reference to a large payload, not the payload.'),
  P('Messaging', 'Priority Queue', 'm12-messaging-patterns', 'Process urgent messages first.'),
  P('Messaging', 'Request–Reply over messaging', 'm12-messaging-patterns', 'Correlated responses over queues.'),
  P('Messaging', 'Dead-Letter Queue', 'm12-retries-dlq', 'Park messages that keep failing.'),
  P('Messaging', 'Transactional Outbox', 'm12-outbox', 'Save data and the event to publish in one transaction.'),
  P('Messaging', 'Inbox / Idempotent Consumer', 'm12-idempotent-consumers', 'Process each message once even if delivered twice.'),
  P('Data & consistency', 'Cache-Aside', 'm12-cache-patterns', 'Read from cache, fall back to DB and fill the cache.'),
  P('Data & consistency', 'Read-Through / Write-Through / Write-Behind', 'm12-cache-patterns', 'Caches that sit in front of the store.'),
  P('Data & consistency', 'Saga', 'm12-sagas', 'A long transaction as local steps with compensations.'),
  P('Data & consistency', 'Two-Phase Commit', 'm13-distributed-transactions', 'Atomic commit across resources — and why it is rare.'),
  P('Data & consistency', 'CQRS', 'm16-cqrs', 'Separate models for writing and reading.'),
  P('Data & consistency', 'Event Sourcing', 'm16-event-sourcing', 'Store state as a sequence of events.'),
  P('Data & consistency', 'Change Data Capture', 'm16-cdc', 'Stream database changes to other systems.'),
  P('Data & consistency', 'Sharding', 'm13-sharding', 'Split data across nodes by key.'),
  P('Data & consistency', 'Consistent Hashing', 'm13-sharding', 'Move few keys when nodes join or leave.'),
  P('Data & consistency', 'Leader–Follower Replication', 'm13-replication', 'One writer, many read copies.'),
  P('Data & consistency', 'Quorum', 'm13-quorums', 'Read and write to overlapping majorities.'),
  P('Data & consistency', 'Fencing Token', 'm13-distributed-locks', 'Stop stale lock holders from writing.'),
  P('Cloud & distributed', 'API Gateway', 'm16-gateway-bff', 'One front door for many services.'),
  P('Cloud & distributed', 'Backend for Frontend', 'm16-gateway-bff', 'A tailored backend per client type.'),
  P('Cloud & distributed', 'Strangler Fig', 'm16-strangler-acl', 'Replace a legacy system piece by piece.'),
  P('Cloud & distributed', 'Anti-Corruption Layer', 'm16-strangler-acl', 'Translate between your model and a legacy one.'),
  P('Cloud & distributed', 'Sidecar', 'm16-cloud-design-patterns', 'Helper process deployed next to each service.'),
  P('Cloud & distributed', 'Ambassador', 'm16-cloud-design-patterns', 'Out-of-process proxy for outbound calls.'),
  P('Cloud & distributed', 'Valet Key', 'm16-cloud-design-patterns', 'Time-limited direct access to storage (pre-signed URLs).'),
  P('Cloud & distributed', 'Gatekeeper', 'm16-cloud-design-patterns', 'A hardened host that validates requests before they reach services.'),
  P('Cloud & distributed', 'Throttling', 'm16-cloud-design-patterns', 'Limit resource use per tenant or client.'),
  P('Cloud & distributed', 'Leader Election', 'm16-cloud-design-patterns', 'Pick one instance to coordinate work.'),
  P('Cloud & distributed', 'Deployment Stamps', 'm16-cloud-design-patterns', 'Scale by repeating independent copies of the whole stack.'),
  P('Cloud & distributed', 'Geode', 'm16-cloud-design-patterns', 'Globally distributed copies serving nearby users.'),
  P('Cloud & distributed', 'Compensating Transaction', 'm16-cloud-design-patterns', 'Undo completed steps when a later one fails.'),
  P('Cloud & distributed', 'Service Discovery', 'm10-service-discovery', 'Find service instances dynamically.'),
  P('Cloud & distributed', 'Multi-level Caching', 'm16-multi-level-caching', 'In-process L1 plus distributed L2 caches.'),
  P('Cloud & distributed', 'Blue–Green / Canary Deployment', 'm15-deployment-strategies', 'Release with a safe rollback path.'),
  P('Cloud & distributed', 'Feature Flags', 'm16-workflow-engines', 'Turn features on without redeploying.'),
  P('Architectural', 'Layered Architecture', 'm02-layered', 'Presentation, business and data layers.'),
  P('Architectural', 'Modular Monolith', 'm02-modular-monolith', 'One deployable with strong internal module boundaries.'),
  P('Architectural', 'Microservices', 'm02-microservices', 'Independently deployable services owning their data.'),
  P('Architectural', 'Event-Driven Architecture', 'm02-event-driven', 'Components react to events.'),
  P('Architectural', 'Hexagonal (Ports & Adapters)', 'm02-hexagonal', 'Core logic isolated behind ports.'),
  P('Architectural', 'Clean / Onion Architecture', 'm02-clean-onion', 'Dependencies point inward to the domain.'),
  P('Architectural', 'Vertical Slice Architecture', 'm02-vertical-slice', 'Organise by feature, not by layer.'),
  P('Architectural', 'Client–Server / N-tier', 'm02-n-tier', 'Separate clients, application and data tiers.'),
  P('Architectural', 'Multi-tenancy (silo/pool/bridge)', 'm16-multi-tenancy', 'Serve many customers from shared infrastructure.'),
  P('Anti-patterns', 'God Object', 'm06-anti-patterns', 'One class that knows and does everything.'),
  P('Anti-patterns', 'Anemic Domain Model', 'm06-anti-patterns', 'Data-only classes with logic scattered in services.'),
  P('Anti-patterns', 'Golden Hammer', 'm06-anti-patterns', 'Using one favourite tool for every problem.'),
  P('Anti-patterns', 'Spaghetti Code', 'm06-anti-patterns', 'Tangled control flow with no structure.'),
  P('Anti-patterns', 'Lava Flow', 'm06-anti-patterns', 'Dead code nobody dares remove.'),
  P('Anti-patterns', 'Distributed Monolith', 'm16-monolith-vs-microservices', 'Services that must change and deploy together.'),
  P('Anti-patterns', 'Speculative Generality', 'm04-over-under-engineering', 'Abstractions for needs that never arrive.'),
  P('Anti-patterns', 'Shotgun Surgery & Feature Envy', 'm04-code-smells', 'Code smells that signal misplaced responsibilities.'),
];

export function mergeFrontmatterPatterns(lessons: { id: string; patterns: string[] }[]): PatternEntry[] {
  const known = new Set(PATTERNS.map(p => p.name.toLowerCase()));
  const extra: PatternEntry[] = [];
  for (const l of lessons) for (const name of l.patterns ?? []) {
    if (known.has(name.toLowerCase())) continue;
    known.add(name.toLowerCase());
    const sibling = PATTERNS.find(x => x.lessonId === l.id)?.category;
    const cat: PatternCategory = sibling ?? (l.id.startsWith('m06') ? 'Behavioral' : l.id.startsWith('m12') ? 'Messaging' : l.id.startsWith('m13') ? 'Data & consistency' : l.id.startsWith('m10') ? 'Resilience' : l.id.startsWith('m16') ? 'Cloud & distributed' : 'Enterprise & .NET');
    extra.push({ name, category: cat, lessonId: l.id, intent: 'Taught in this lesson.' });
  }
  return [...PATTERNS, ...extra];
}
