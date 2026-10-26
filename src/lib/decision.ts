// Architecture Decision Simulator: transparent, simplified models. Every number carries a provenance
// label so the UI can say whether it was calculated from the inputs or is an illustrative assumption.
export type Provenance = 'calculated estimate' | 'illustrative assumption';
export interface Metric { label: string; value: string; numeric?: number; provenance: Provenance; formula: string }
export interface OptionResult { name: string; metrics: Metric[]; failureModes: string[]; whenBetter: string }
export interface Workload { rps: number; readRatio: number; teamSize: number; strongConsistency: boolean; monthlyBudgetUsd: number; dataGb: number }
export interface Comparison { id: string; title: string; question: string; evaluate: (w: Workload) => [OptionResult, OptionResult]; assumptions: string[] }

const fmtMs = (n: number) => `${n < 10 ? n.toFixed(1) : Math.round(n)} ms`;
const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString('en-US')}/mo`;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
/** Instances needed for a load, with 30 % headroom; at least 2 for redundancy. */
export const instancesFor = (rps: number, perInstanceRps: number) => Math.max(2, Math.ceil((rps * 1.3) / perInstanceRps));

// Illustrative unit costs (USD/month). Real prices vary by provider, region, and discounts.
export const UNIT = { appInstance: 70, dbPrimary: 350, dbReplica: 300, docDbNode: 250, cacheNode: 120, brokerNode: 150, perServiceOverhead: 400, regionMultiplier: 1.0, crossRegionEgressPerGb: 0.02 };

export const COMPARISONS: Comparison[] = [
  {
    id: 'cache', title: 'Redis cache vs no cache', question: 'Should reads go through a Redis cache (cache-aside)?',
    assumptions: ['DB read 8 ms, cache hit 1 ms (typical same-AZ figures; measure your own)', 'Hit ratio 0.9 for read-heavy, falling as writes rise', 'One DB primary handles ~3,000 simple reads/s before needing replicas'],
    evaluate: w => {
      const reads = w.rps * w.readRatio;
      const hit = clamp(0.95 - (1 - w.readRatio) * 0.6, 0.3, 0.95);
      const dbReadsNo = reads, dbReadsYes = reads * (1 - hit);
      const latNo = 8, latYes = hit * 1 + (1 - hit) * (8 + 1);
      const replicasNo = Math.max(0, Math.ceil(dbReadsNo / 3000) - 1), replicasYes = Math.max(0, Math.ceil(dbReadsYes / 3000) - 1);
      const costNo = UNIT.dbPrimary + replicasNo * UNIT.dbReplica, costYes = UNIT.dbPrimary + replicasYes * UNIT.dbReplica + 2 * UNIT.cacheNode;
      return [
        { name: 'No cache', metrics: [
          { label: 'Avg read latency', value: fmtMs(latNo), numeric: latNo, provenance: 'calculated estimate', formula: 'DB read latency (assumed 8 ms)' },
          { label: 'DB reads/s', value: Math.round(dbReadsNo).toLocaleString(), numeric: dbReadsNo, provenance: 'calculated estimate', formula: 'RPS × read ratio' },
          { label: 'Read replicas needed', value: String(replicasNo), numeric: replicasNo, provenance: 'calculated estimate', formula: 'ceil(DB reads ÷ 3,000) − 1' },
          { label: 'Data-tier cost', value: fmtUsd(costNo), numeric: costNo, provenance: 'illustrative assumption', formula: 'primary + replicas × unit price' },
          { label: 'Moving parts', value: '1 (database)', provenance: 'calculated estimate', formula: 'components on the read path' },
        ], failureModes: ['DB overload under read spikes', 'Replica lag if you add replicas'], whenBetter: 'Low traffic, write-heavy data, or data that must never be stale.' },
        { name: 'Redis cache-aside', metrics: [
          { label: 'Avg read latency', value: fmtMs(latYes), numeric: latYes, provenance: 'calculated estimate', formula: 'hit × 1 ms + miss × (8 ms + 1 ms)' },
          { label: 'Cache hit ratio', value: `${Math.round(hit * 100)} %`, numeric: hit, provenance: 'illustrative assumption', formula: '0.95 − write share × 0.6 (clamped 0.3–0.95)' },
          { label: 'DB reads/s', value: Math.round(dbReadsYes).toLocaleString(), numeric: dbReadsYes, provenance: 'calculated estimate', formula: 'reads × (1 − hit ratio)' },
          { label: 'Read replicas needed', value: String(replicasYes), numeric: replicasYes, provenance: 'calculated estimate', formula: 'ceil(DB reads ÷ 3,000) − 1' },
          { label: 'Data-tier cost', value: fmtUsd(costYes), numeric: costYes, provenance: 'illustrative assumption', formula: 'primary + replicas + 2 cache nodes' },
        ], failureModes: ['Stale reads until TTL/invalidation', 'Cache stampede when a hot key expires', 'Cold cache after restart sends full load to DB'], whenBetter: 'Read-heavy traffic with tolerance for slightly stale data.' },
      ];
    },
  },
  {
    id: 'sync-async', title: 'Synchronous calls vs asynchronous events', question: 'Order service calls Payment, Inventory and Notification. Call them directly, or publish an event?',
    assumptions: ['Each downstream call ~40 ms, availability 99.9 %', 'Broker publish ~5 ms; consumers process within seconds', 'Availability of a synchronous chain = product of each dependency'],
    evaluate: w => {
      const deps = 3, perCall = 40, avail = 0.999;
      const chainAvail = Math.pow(avail, deps + 1);
      const asyncAvail = avail * 0.9995;
      return [
        { name: 'Synchronous HTTP chain', metrics: [
          { label: 'User-facing latency', value: fmtMs(deps * perCall + 10), numeric: deps * perCall + 10, provenance: 'calculated estimate', formula: '3 sequential calls × 40 ms + 10 ms own work' },
          { label: 'Availability', value: `${(chainAvail * 100).toFixed(2)} %`, numeric: chainAvail, provenance: 'calculated estimate', formula: '0.999 ^ (3 dependencies + itself)' },
          { label: 'Downtime per month', value: `${Math.round((1 - chainAvail) * 43200)} min`, numeric: (1 - chainAvail) * 43200, provenance: 'calculated estimate', formula: '(1 − availability) × 43,200 min' },
          { label: 'Consistency', value: 'Immediate', provenance: 'calculated estimate', formula: 'all steps complete before response' },
        ], failureModes: ['One slow dependency slows every request', 'Retry storms amplify outages', 'Cascading failure without timeouts/circuit breakers'], whenBetter: w.strongConsistency ? 'Your inputs say strong consistency is required: keep the money-critical step synchronous.' : 'The caller needs the result immediately (e.g. payment authorisation).' },
        { name: 'Publish event, async consumers', metrics: [
          { label: 'User-facing latency', value: fmtMs(10 + 5), numeric: 15, provenance: 'calculated estimate', formula: '10 ms own work + 5 ms publish (outbox)' },
          { label: 'Availability of accept path', value: `${(asyncAvail * 100).toFixed(2)} %`, numeric: asyncAvail, provenance: 'calculated estimate', formula: 'own 0.999 × broker 0.9995' },
          { label: 'Consistency', value: 'Eventual (seconds)', provenance: 'illustrative assumption', formula: 'consumer lag' },
          { label: 'Extra infrastructure', value: fmtUsd(3 * UNIT.brokerNode), numeric: 3 * UNIT.brokerNode, provenance: 'illustrative assumption', formula: '3 broker nodes × unit price' },
        ], failureModes: ['Duplicate deliveries (need idempotent consumers)', 'Poison messages (need DLQ)', 'Harder debugging without tracing', 'User sees "processing" states'], whenBetter: 'Side effects that can finish later: notifications, analytics, search indexing.' },
      ];
    },
  },
  {
    id: 'monolith-ms', title: 'Modular monolith vs microservices', question: 'Should the system be one deployable or many services?',
    assumptions: ['Each service adds pipelines, dashboards, on-call and contracts (~0.5 engineer of ongoing overhead per 3 services)', 'In-process call ~0.01 ms; network call ~2–5 ms within a region', 'Teams under ~25 engineers rarely need independent deployment of many services'],
    evaluate: w => {
      const services = clamp(Math.round(w.teamSize / 5), 2, 30);
      const overheadEng = services / 6;
      const msCost = services * (2 * UNIT.appInstance) + services * UNIT.perServiceOverhead;
      const monoInst = instancesFor(w.rps, 500);
      const monoCost = monoInst * UNIT.appInstance + UNIT.perServiceOverhead;
      return [
        { name: 'Modular monolith', metrics: [
          { label: 'Deployables', value: '1', provenance: 'calculated estimate', formula: 'one process, modules enforced in code' },
          { label: 'App instances', value: String(monoInst), numeric: monoInst, provenance: 'calculated estimate', formula: 'ceil(RPS × 1.3 ÷ 500 per instance), min 2' },
          { label: 'Compute + tooling cost', value: fmtUsd(monoCost), numeric: monoCost, provenance: 'illustrative assumption', formula: 'instances × unit + one pipeline/observability stack' },
          { label: 'Ops overhead', value: '≈0.2 engineers', provenance: 'illustrative assumption', formula: 'single pipeline and dashboard set' },
          { label: 'Cross-module call latency', value: '<0.1 ms', provenance: 'illustrative assumption', formula: 'in-process call' },
        ], failureModes: ['A memory leak in one module takes the whole app down', 'Module boundaries erode without enforcement', 'Whole-app deploys get slower as code grows'], whenBetter: w.teamSize <= 25 ? `With ${w.teamSize} engineers, this is usually the better default.` : 'Smaller teams, unclear domain boundaries, early-stage products.' },
        { name: `Microservices (~${services})`, metrics: [
          { label: 'Deployables', value: String(services), numeric: services, provenance: 'illustrative assumption', formula: 'team size ÷ 5 (one service per ~5 engineers), 2–30' },
          { label: 'Compute + tooling cost', value: fmtUsd(msCost), numeric: msCost, provenance: 'illustrative assumption', formula: 'services × (2 instances + per-service overhead)' },
          { label: 'Ops overhead', value: `≈${overheadEng.toFixed(1)} engineers`, numeric: overheadEng, provenance: 'illustrative assumption', formula: 'services ÷ 6' },
          { label: 'Cross-service call latency', value: '2–5 ms per hop', provenance: 'illustrative assumption', formula: 'network round-trip in one region' },
        ], failureModes: ['Distributed monolith (services that must deploy together)', 'Data consistency across services needs sagas/outbox', 'Partial failures and timeouts everywhere', 'Debugging needs distributed tracing'], whenBetter: w.teamSize > 25 ? `With ${w.teamSize} engineers, independent deployment can pay for its overhead.` : 'Many teams that need to deploy independently, or parts with very different scaling needs.' },
      ];
    },
  },
  {
    id: 'sql-doc', title: 'PostgreSQL vs document database', question: 'Store orders and customers in PostgreSQL or a document database?',
    assumptions: ['Single PostgreSQL primary comfortably handles a few thousand writes/s for simple rows (workload dependent)', 'Document DB scales writes horizontally by shard key', 'Strong consistency and multi-row transactions are native in PostgreSQL'],
    evaluate: w => {
      const writes = w.rps * (1 - w.readRatio);
      const pgNeedsShard = writes > 5000;
      const docNodes = Math.max(3, Math.ceil(writes / 3000) * 3);
      const pgCost = UNIT.dbPrimary + (w.readRatio > 0.8 ? UNIT.dbReplica : 0) + (pgNeedsShard ? 3 * UNIT.dbPrimary : 0);
      const docCost = docNodes * UNIT.docDbNode;
      return [
        { name: 'PostgreSQL', metrics: [
          { label: 'Writes/s', value: Math.round(writes).toLocaleString(), numeric: writes, provenance: 'calculated estimate', formula: 'RPS × (1 − read ratio)' },
          { label: 'Fits one primary?', value: pgNeedsShard ? 'No — partition/shard or batch' : 'Yes', provenance: 'illustrative assumption', formula: 'writes ≤ 5,000/s' },
          { label: 'Transactions across entities', value: 'Native ACID', provenance: 'calculated estimate', formula: 'multi-row transactions' },
          { label: 'Cost', value: fmtUsd(pgCost), numeric: pgCost, provenance: 'illustrative assumption', formula: 'primary + replica if reads > 80 % + shards if needed' },
        ], failureModes: ['Primary is a write bottleneck', 'Schema migrations need care on big tables', 'Failover takes seconds to minutes'], whenBetter: w.strongConsistency ? 'Strong consistency required — PostgreSQL is the safer default.' : 'Relational data, reporting, transactions, and teams that know SQL.' },
        { name: 'Document database', metrics: [
          { label: 'Nodes', value: String(docNodes), numeric: docNodes, provenance: 'illustrative assumption', formula: 'max(3, ceil(writes ÷ 3,000) × 3 replicas)' },
          { label: 'Transactions across documents', value: 'Limited / costly', provenance: 'illustrative assumption', formula: 'model aggregates as single documents' },
          { label: 'Cost', value: fmtUsd(docCost), numeric: docCost, provenance: 'illustrative assumption', formula: 'nodes × unit price' },
        ], failureModes: ['Data duplicated across documents drifts out of sync', 'Ad-hoc reporting is harder', 'Bad shard key creates hot partitions'], whenBetter: 'Very high write volume with self-contained documents and flexible schemas.' },
      ];
    },
  },
  {
    id: 'regions', title: 'Single region vs multi-region active-active', question: 'Deploy in one region or two active regions?',
    assumptions: ['Single region with multiple availability zones ≈ 99.95 % (illustrative)', 'Two independent regions with failover ≈ 1 − (0.0005)² for infrastructure, but app/data bugs are shared', 'Cross-region replication adds 60–150 ms for synchronous writes'],
    evaluate: w => {
      const appInst = instancesFor(w.rps, 500);
      const single = appInst * UNIT.appInstance + UNIT.dbPrimary + UNIT.dbReplica;
      const egress = w.dataGb * 30 * UNIT.crossRegionEgressPerGb * (1 - w.readRatio) * 10;
      const multi = single * 2 + egress;
      return [
        { name: 'Single region, multi-AZ', metrics: [
          { label: 'Availability (infra)', value: '≈99.95 %', provenance: 'illustrative assumption', formula: 'zone-redundant deployment' },
          { label: 'Write latency', value: '≈5 ms', provenance: 'illustrative assumption', formula: 'synchronous replication within region' },
          { label: 'Cost', value: fmtUsd(single), numeric: single, provenance: 'illustrative assumption', formula: 'app instances + primary + replica' },
        ], failureModes: ['Full regional outage = downtime', 'Users far away see higher latency'], whenBetter: single * 2 > w.monthlyBudgetUsd ? `Your budget (${fmtUsd(w.monthlyBudgetUsd)}) does not cover two regions.` : 'Most systems; regional outages are rare and recovery from backups may be acceptable.' },
        { name: 'Two regions, active-active', metrics: [
          { label: 'Availability (infra)', value: '≈99.99 %+', provenance: 'illustrative assumption', formula: '1 − (1 − 0.9995)², ignoring shared software bugs' },
          { label: 'Write latency', value: w.strongConsistency ? '≈80–150 ms' : '≈5 ms (async, conflicts possible)', provenance: 'illustrative assumption', formula: w.strongConsistency ? 'cross-region quorum per write' : 'local write, async replication' },
          { label: 'Cost', value: fmtUsd(multi), numeric: multi, provenance: 'illustrative assumption', formula: '2 × single region + cross-region egress' },
        ], failureModes: ['Write conflicts with async replication', 'Split-brain if failover is automated badly', 'Double the operational surface'], whenBetter: 'Strict uptime SLOs, global users, or data-residency rules per region.' },
      ];
    },
  },
];
