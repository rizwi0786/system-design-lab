import type { HldGraph } from './types';

export interface HldTemplate {
  id: string;
  title: string;
  description: string;
  graph: HldGraph;
}

export const HLD_TEMPLATES: HldTemplate[] = [
  {
    id: 'blank',
    title: 'Blank',
    description: 'Empty canvas — drag components from the palette.',
    graph: { nodes: [], edges: [] },
  },
  {
    id: 'three-tier',
    title: '3-tier web app',
    description: 'Clients → load balancer → app servers → database, with a cache.',
    graph: {
      nodes: [
        { id: 'web', type: 'client', label: 'Browser', props: { rps: 500 } },
        { id: 'lb', type: 'load-balancer', label: 'Load balancer', props: { multiAz: true } },
        { id: 'api', type: 'app-server', label: 'Web/API servers', props: { instances: 3 } },
        { id: 'cache', type: 'cache', label: 'Redis', props: { ttlSeconds: 300, replicas: 2 } },
        { id: 'db', type: 'database', label: 'PostgreSQL', props: { replicas: 2, multiAz: true } },
        { id: 'mon', type: 'monitoring', label: 'Metrics & alerts' },
      ],
      edges: [
        { from: 'web', to: 'lb', kind: 'sync', label: 'HTTPS' },
        { from: 'lb', to: 'api', kind: 'sync' },
        { from: 'api', to: 'cache', kind: 'sync', label: 'read-through' },
        { from: 'api', to: 'db', kind: 'sync', label: 'SQL' },
        { from: 'api', to: 'mon', kind: 'async', label: 'metrics' },
      ],
    },
  },
  {
    id: 'url-shortener',
    title: 'URL shortener',
    description: 'Read-heavy redirects (≈100 reads per write) served mostly from cache.',
    graph: {
      nodes: [
        { id: 'user', type: 'client', label: 'Users', props: { rps: 10000 } },
        { id: 'dns', type: 'dns', label: 'DNS' },
        { id: 'lb', type: 'load-balancer', label: 'Load balancer', props: { multiAz: true } },
        { id: 'rl', type: 'rate-limiter', label: 'Rate limiter', props: { instances: 2 } },
        { id: 'api', type: 'app-server', label: 'Shorten/redirect API', props: { instances: 4 } },
        { id: 'cache', type: 'cache', label: 'Hot links cache', props: { ttlSeconds: 86400, replicas: 3 } },
        { id: 'db', type: 'database', label: 'Links DB (key-value)', props: { replicas: 3, multiAz: true } },
        { id: 'q', type: 'queue', label: 'Click events', props: { dlq: true } },
        { id: 'w', type: 'worker', label: 'Analytics worker', props: { instances: 2 } },
        { id: 'mon', type: 'monitoring', label: 'Monitoring' },
      ],
      edges: [
        { from: 'user', to: 'dns', kind: 'sync' },
        { from: 'user', to: 'lb', kind: 'sync' },
        { from: 'lb', to: 'rl', kind: 'sync' },
        { from: 'rl', to: 'api', kind: 'sync' },
        { from: 'api', to: 'cache', kind: 'sync', label: 'lookup' },
        { from: 'api', to: 'db', kind: 'sync', label: 'miss / create' },
        { from: 'api', to: 'q', kind: 'async', label: 'click' },
        { from: 'q', to: 'w', kind: 'async' },
        { from: 'w', to: 'db', kind: 'sync', label: 'write counts' },
        { from: 'api', to: 'mon', kind: 'async' },
      ],
    },
  },
  {
    id: 'chat',
    title: 'Chat system',
    description: 'WebSocket gateways push messages; a stream fans them out and stores history.',
    graph: {
      nodes: [
        { id: 'app', type: 'client', label: 'Chat app', props: { rps: 3000 } },
        { id: 'lb', type: 'load-balancer', label: 'L4 load balancer', props: { multiAz: true } },
        { id: 'ws', type: 'websocket-gateway', label: 'WebSocket gateway', props: { instances: 6 } },
        { id: 'reg', type: 'service-registry', label: 'Presence / session registry' },
        { id: 'chat', type: 'app-server', label: 'Chat service', props: { instances: 4 } },
        { id: 'stream', type: 'stream', label: 'Message stream' },
        { id: 'store', type: 'worker', label: 'History writer', props: { instances: 2 } },
        { id: 'db', type: 'database', label: 'Message store (wide-column)', props: { replicas: 3, multiAz: true } },
        { id: 'push', type: 'external', label: 'Mobile push provider' },
        { id: 'blob', type: 'object-storage', label: 'Media files' },
        { id: 'cdn', type: 'cdn', label: 'CDN' },
        { id: 'mon', type: 'monitoring', label: 'Monitoring' },
      ],
      edges: [
        { from: 'app', to: 'lb', kind: 'sync' },
        { from: 'lb', to: 'ws', kind: 'sync' },
        { from: 'ws', to: 'reg', kind: 'sync', label: 'who is online' },
        { from: 'ws', to: 'chat', kind: 'sync', label: 'send' },
        { from: 'chat', to: 'stream', kind: 'async', label: 'publish' },
        { from: 'stream', to: 'ws', kind: 'async', label: 'deliver' },
        { from: 'stream', to: 'store', kind: 'async' },
        { from: 'store', to: 'db', kind: 'sync', label: 'write' },
        { from: 'chat', to: 'db', kind: 'sync', label: 'history' },
        { from: 'stream', to: 'push', kind: 'async', label: 'offline users' },
        { from: 'app', to: 'cdn', kind: 'sync', label: 'media' },
        { from: 'cdn', to: 'blob', kind: 'sync' },
        { from: 'chat', to: 'mon', kind: 'async' },
      ],
    },
  },
  {
    id: 'checkout',
    title: 'E-commerce checkout',
    description: 'Order service with payment provider, inventory and async fulfilment.',
    graph: {
      nodes: [
        { id: 'shop', type: 'client', label: 'Web shop', props: { rps: 200 } },
        { id: 'gw', type: 'api-gateway', label: 'API gateway', props: { instances: 2 } },
        { id: 'order', type: 'app-server', label: 'Order service', props: { instances: 3 } },
        { id: 'inv', type: 'app-server', label: 'Inventory service', props: { instances: 2 } },
        { id: 'pay', type: 'external', label: 'Payment provider', props: { latencyMs: 400 } },
        { id: 'odb', type: 'database', label: 'Orders DB', props: { replicas: 2, multiAz: true } },
        { id: 'idb', type: 'database', label: 'Inventory DB', props: { replicas: 2, multiAz: true } },
        { id: 'q', type: 'queue', label: 'Order placed', props: { dlq: true } },
        { id: 'ful', type: 'worker', label: 'Fulfilment worker', props: { instances: 2 } },
        { id: 'email', type: 'external', label: 'Email provider' },
        { id: 'mon', type: 'monitoring', label: 'Monitoring' },
      ],
      edges: [
        { from: 'shop', to: 'gw', kind: 'sync', label: 'POST /checkout' },
        { from: 'gw', to: 'order', kind: 'sync' },
        { from: 'order', to: 'inv', kind: 'sync', label: 'reserve stock' },
        { from: 'inv', to: 'idb', kind: 'sync' },
        { from: 'order', to: 'pay', kind: 'sync', label: 'charge' },
        { from: 'order', to: 'odb', kind: 'sync', label: 'write order' },
        { from: 'order', to: 'q', kind: 'async' },
        { from: 'q', to: 'ful', kind: 'async' },
        { from: 'ful', to: 'email', kind: 'async', label: 'receipt' },
        { from: 'ful', to: 'odb', kind: 'sync', label: 'update status' },
        { from: 'order', to: 'mon', kind: 'async' },
      ],
    },
  },
];
