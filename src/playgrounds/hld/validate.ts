import { indexGraph, longestSyncPath, syncReachableFromClients } from './graph';
import { boolProp, numProp, type HldFinding, type HldGraph, type HldNode, type HldNodeType } from './types';

const SPOF_TYPES: HldNodeType[] = ['app-server', 'database', 'cache', 'load-balancer'];
const WRITE_LABEL = /\b(write|writes|insert|update|delete|upsert)\b/i;
export const MAX_SYNC_HOPS = 4;

const name = (n: HldNode) => `"${n.label || n.id}"`;

/**
 * Reviews a design and returns teaching findings. Pure and deterministic: the same graph always
 * yields the same findings in the same order (rule order, then node order).
 *
 * Severity meaning:
 *  - error: a definite problem that breaks a common rule (for example clients talking to the database).
 *  - warning: a likely risk that is easy to fix.
 *  - tradeoff: a valid choice with a cost worth stating out loud.
 *  - info: something to consider; often fine in a first draft.
 */
export function validateHld(graph: HldGraph): HldFinding[] {
  const findings: HldFinding[] = [];
  const idx = indexGraph(graph);
  const { byId, out, inc, edges } = idx;
  const typeOf = (id: string) => byId.get(id)!.type;
  const degree = (id: string) => (out.get(id)?.length ?? 0) + (inc.get(id)?.length ?? 0);
  const add = (f: HldFinding) => findings.push(f);

  // 1. Single point of failure.
  for (const n of graph.nodes) {
    if (!SPOF_TYPES.includes(n.type)) continue;
    const copies = Math.max(numProp(n, 'instances') ?? 1, numProp(n, 'replicas') ?? 1);
    if (copies <= 1 && !boolProp(n, 'multiAz')) {
      add({
        id: `spof:${n.id}`,
        severity: 'warning',
        title: `Single point of failure: ${name(n)}`,
        detail:
          `Only one copy of this ${n.type} exists and it is not spread across availability zones. ` +
          `If that one machine or zone fails, every request that needs it fails too — like a shop with one ` +
          `cash register: when it breaks, nobody can pay. Run at least 2 instances/replicas, or set multiAz ` +
          `so a standby in another zone can take over (failover).`,
        nodeIds: [n.id],
      });
    }
  }

  // 2. Client connecting directly to a database.
  for (const e of edges) {
    const to = typeOf(e.to);
    if (typeOf(e.from) === 'client' && (to === 'database' || to === 'read-replica')) {
      add({
        id: `client-db:${e.from}->${e.to}`,
        severity: 'error',
        title: `Client talks directly to the database`,
        detail:
          `${name(byId.get(e.from)!)} connects straight to ${name(byId.get(e.to)!)}. That means database ` +
          `credentials ship inside the app, anyone can run any query, and you cannot change the schema without ` +
          `breaking every installed client. Put an app server (or API) in between: it checks who the caller is, ` +
          `validates input and only runs the queries you allow.`,
        nodeIds: [e.from, e.to],
      });
    }
  }

  // 3. Database with no app-server / worker in front.
  for (const n of graph.nodes) {
    if (n.type !== 'database' || degree(n.id) === 0) continue;
    const fronted = (inc.get(n.id) ?? []).some((e) => ['app-server', 'worker'].includes(typeOf(e.from)));
    if (!fronted) {
      add({
        id: `db-unfronted:${n.id}`,
        severity: 'error',
        title: `Nothing owns access to ${name(n)}`,
        detail:
          `No app server or worker connects to this database, so there is no layer that enforces business ` +
          `rules, authorisation or connection pooling. Databases accept a limited number of connections ` +
          `(often a few hundred); an app tier pools them and keeps the data consistent.`,
        nodeIds: [n.id],
      });
    }
  }

  // 4. Deep synchronous chain.
  const deep = longestSyncPath(graph, 'hops');
  if (deep.hops > MAX_SYNC_HOPS) {
    add({
      id: 'deep-sync-chain',
      severity: 'tradeoff',
      title: `Synchronous chain of ${deep.hops} hops`,
      detail:
        `A request waits on ${deep.hops} components in a row. Latencies add up, and availabilities multiply: ` +
        `5 services at 99.9% each give roughly 99.5% end to end. One slow link also holds threads in every ` +
        `caller (cascading failure). Consider collapsing hops, caching, or moving non-urgent steps behind a queue.`,
      nodeIds: deep.path,
    });
  }

  // 5. Cache that nothing reads through.
  for (const n of graph.nodes) {
    if (n.type === 'cache' && (inc.get(n.id)?.length ?? 0) === 0) {
      add({
        id: `cache-unused:${n.id}`,
        severity: 'info',
        title: `Cache ${name(n)} is not read by anything`,
        detail:
          `No component sends requests to this cache, so it cannot save any work. Draw an edge from the app ` +
          `server that checks the cache first and falls back to the database on a miss (cache-aside).`,
        nodeIds: [n.id],
      });
    }
  }

  // 6 + 7. Queues: consumers and dead-letter handling.
  for (const n of graph.nodes) {
    if (n.type !== 'queue') continue;
    const producers = inc.get(n.id) ?? [];
    const consumers = (out.get(n.id) ?? []).filter((e) => ['worker', 'app-server'].includes(typeOf(e.to)));
    if (producers.length > 0 && consumers.length === 0) {
      add({
        id: `queue-no-consumer:${n.id}`,
        severity: 'error',
        title: `Queue ${name(n)} has producers but no consumer`,
        detail:
          `Messages go in but nothing takes them out, so the backlog grows forever and the work never happens. ` +
          `Add a worker (or app server) with an edge from the queue to it.`,
        nodeIds: [n.id],
      });
    }
    const touchesQueue = [...producers, ...(out.get(n.id) ?? [])].some((e) => {
      const other = e.from === n.id ? e.to : e.from;
      return other !== n.id && typeOf(other) === 'queue';
    });
    if (!boolProp(n, 'dlq') && !touchesQueue) {
      add({
        id: `queue-no-dlq:${n.id}`,
        severity: 'info',
        title: `No dead-letter plan for ${name(n)}`,
        detail:
          `Some messages will always fail (bad data, a bug). Without a dead-letter queue they are retried ` +
          `forever and block the line, or silently dropped. Route messages that fail N times to a second ` +
          `queue for inspection, or set the dlq prop to show you have one.`,
        nodeIds: [n.id],
      });
    }
  }

  // 8. No monitoring.
  if (graph.nodes.length > 0 && !graph.nodes.some((n) => n.type === 'monitoring')) {
    add({
      id: 'no-monitoring',
      severity: 'info',
      title: 'No monitoring',
      detail:
        `Without metrics, logs and alerts you learn about outages from your users. Add a monitoring node ` +
        `and send it error rate, latency and saturation from each tier.`,
      nodeIds: [],
    });
  }

  // 9. External provider called synchronously on the request path.
  const requestPath = syncReachableFromClients(graph);
  for (const n of graph.nodes) {
    if (n.type !== 'external') continue;
    const callers = (inc.get(n.id) ?? []).filter((e) => e.kind === 'sync' && requestPath.has(e.from));
    if (callers.length) {
      add({
        id: `external-sync:${n.id}`,
        severity: 'tradeoff',
        title: `${name(n)} is called synchronously while the user waits`,
        detail:
          `Your response time and uptime now include a provider you do not control. If it slows from 150 ms ` +
          `to 10 s, your threads pile up waiting. Set a short timeout, wrap it in a circuit breaker, or make ` +
          `the call asynchronous (queue + worker) when the user does not need the answer immediately.`,
        nodeIds: [n.id, ...callers.map((e) => e.from)],
      });
    }
  }

  // 10. Object storage served to clients without a CDN.
  for (const e of edges) {
    if (typeOf(e.from) === 'client' && typeOf(e.to) === 'object-storage') {
      add({
        id: `storage-no-cdn:${e.from}->${e.to}`,
        severity: 'tradeoff',
        title: 'Files served straight from object storage',
        detail:
          `Every download travels from one region to the user and you pay egress each time. A CDN keeps copies ` +
          `near users (tens of ms instead of hundreds) and absorbs traffic spikes. Fine for low traffic or ` +
          `private files; add a CDN in front for public, popular content.`,
        nodeIds: [e.from, e.to],
      });
    }
  }

  // 11. Writes sent to a read replica.
  for (const e of edges) {
    if (typeOf(e.to) === 'read-replica' && typeOf(e.from) !== 'database' && WRITE_LABEL.test(e.label ?? '')) {
      add({
        id: `replica-write:${e.from}->${e.to}`,
        severity: 'error',
        title: 'Writes sent to a read replica',
        detail:
          `A read replica only copies changes from the primary; it rejects writes (or, worse, they are lost ` +
          `on the next resync). Send writes to the primary database and use replicas for reads that can ` +
          `tolerate a little lag.`,
        nodeIds: [e.from, e.to],
      });
    }
  }

  // 12. Stateful app servers behind a load balancer.
  for (const n of graph.nodes) {
    if (n.type !== 'app-server' || !boolProp(n, 'stateful') || boolProp(n, 'sharedSession')) continue;
    const lbs = (inc.get(n.id) ?? []).filter((e) => typeOf(e.from) === 'load-balancer' && !boolProp(byId.get(e.from)!, 'sticky'));
    if (lbs.length) {
      add({
        id: `stateful-behind-lb:${n.id}`,
        severity: 'warning',
        title: `${name(n)} keeps session state behind a load balancer`,
        detail:
          `The load balancer may send a user's next request to a different instance that does not have their ` +
          `session, so they appear logged out or lose their cart. Store sessions in a shared cache/database ` +
          `(set sharedSession) or enable sticky sessions on the load balancer (set sticky) — sticky is simpler ` +
          `but sessions are lost when that instance dies.`,
        nodeIds: [n.id, ...lbs.map((e) => e.from)],
      });
    }
  }

  // 13. Isolated nodes.
  if (graph.nodes.length > 1) {
    for (const n of graph.nodes) {
      if (degree(n.id) === 0) {
        add({
          id: `isolated:${n.id}`,
          severity: 'warning',
          title: `${name(n)} is not connected`,
          detail:
            `Nothing talks to this component and it talks to nothing, so it does no work in this design. ` +
            `Connect it (use an async edge for things like metrics or logs) or remove it.`,
          nodeIds: [n.id],
        });
      }
    }
  }

  return findings;
}

export const SEVERITY_LABEL: Record<HldFinding['severity'], string> = {
  error: 'Definite problem',
  warning: 'Risk',
  tradeoff: 'Trade-off',
  info: 'Consider',
};
