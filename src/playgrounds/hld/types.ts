// Data model for the HLD (high-level design) playground. Matches docs/CONTENT_MODEL.md §6.

export const HLD_NODE_TYPES = [
  'client',
  'dns',
  'cdn',
  'load-balancer',
  'api-gateway',
  'app-server',
  'worker',
  'database',
  'read-replica',
  'cache',
  'queue',
  'stream',
  'object-storage',
  'search',
  'monitoring',
  'external',
  'websocket-gateway',
  'scheduler',
  'rate-limiter',
  'service-registry',
] as const;

export type HldNodeType = (typeof HLD_NODE_TYPES)[number];
export type HldEdgeKind = 'sync' | 'async';
export type HldPropValue = number | string | boolean;

export interface HldNode {
  id: string;
  type: HldNodeType;
  label: string;
  props?: Record<string, HldPropValue>;
  /** Canvas position. Optional: graphs without positions are auto-laid out. */
  position?: { x: number; y: number };
}

export interface HldEdge {
  id?: string;
  from: string;
  to: string;
  kind: HldEdgeKind;
  label?: string;
}

export interface HldGraph {
  nodes: HldNode[];
  edges: HldEdge[];
}

export type HldSeverity = 'error' | 'warning' | 'tradeoff' | 'info';

export interface HldFinding {
  id: string;
  severity: HldSeverity;
  title: string;
  detail: string;
  nodeIds: string[];
}

export interface NodeMeta {
  label: string;
  description: string;
  /** Illustrative default latency added by one hop through this component, in ms. */
  latencyMs: number;
  group: 'Edge' | 'Compute' | 'Data' | 'Messaging' | 'Operations';
}

export const NODE_META: Record<HldNodeType, NodeMeta> = {
  client: { label: 'Client', description: 'Browser or mobile app that starts requests.', latencyMs: 0, group: 'Edge' },
  dns: { label: 'DNS', description: 'Turns a domain name into server addresses.', latencyMs: 20, group: 'Edge' },
  cdn: { label: 'CDN', description: 'Caches static files close to users worldwide.', latencyMs: 15, group: 'Edge' },
  'load-balancer': { label: 'Load balancer', description: 'Spreads requests across many servers.', latencyMs: 2, group: 'Edge' },
  'api-gateway': { label: 'API gateway', description: 'Single front door: auth, routing, quotas.', latencyMs: 5, group: 'Edge' },
  'rate-limiter': { label: 'Rate limiter', description: 'Caps how many requests a caller may send.', latencyMs: 1, group: 'Edge' },
  'websocket-gateway': { label: 'WebSocket gateway', description: 'Holds long-lived connections for push.', latencyMs: 5, group: 'Edge' },
  'app-server': { label: 'App server', description: 'Runs your business logic per request.', latencyMs: 20, group: 'Compute' },
  worker: { label: 'Worker', description: 'Background job runner fed by a queue.', latencyMs: 50, group: 'Compute' },
  scheduler: { label: 'Scheduler', description: 'Triggers jobs on a timetable (cron).', latencyMs: 0, group: 'Compute' },
  database: { label: 'Database', description: 'Durable source of truth for data.', latencyMs: 10, group: 'Data' },
  'read-replica': { label: 'Read replica', description: 'Read-only copy of the database.', latencyMs: 8, group: 'Data' },
  cache: { label: 'Cache', description: 'Fast in-memory copy of hot data.', latencyMs: 1, group: 'Data' },
  'object-storage': { label: 'Object storage', description: 'Stores files and blobs (images, videos).', latencyMs: 30, group: 'Data' },
  search: { label: 'Search index', description: 'Full-text and filtered search.', latencyMs: 25, group: 'Data' },
  queue: { label: 'Queue', description: 'Buffers jobs so producers do not wait.', latencyMs: 5, group: 'Messaging' },
  stream: { label: 'Event stream', description: 'Ordered, replayable event log.', latencyMs: 5, group: 'Messaging' },
  monitoring: { label: 'Monitoring', description: 'Metrics, logs, traces and alerts.', latencyMs: 0, group: 'Operations' },
  external: { label: 'External API', description: 'Third-party service you do not control.', latencyMs: 150, group: 'Operations' },
  'service-registry': { label: 'Service registry', description: 'Lets services find each other.', latencyMs: 2, group: 'Operations' },
};

export const isNodeType = (v: unknown): v is HldNodeType =>
  typeof v === 'string' && (HLD_NODE_TYPES as readonly string[]).includes(v);

export const emptyGraph = (): HldGraph => ({ nodes: [], edges: [] });

export function numProp(n: HldNode, key: string): number | undefined {
  const v = n.props?.[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

export function boolProp(n: HldNode, key: string): boolean {
  return n.props?.[key] === true;
}
