export type SimName =
  | 'cache'
  | 'queue'
  | 'retry'
  | 'ratelimit'
  | 'replication'
  | 'circuit'
  | 'scaling'
  | 'partition'
  | 'loadbalancer'
  | 'consistent-hash';

export interface SimulatorInfo {
  id: SimName;
  title: string;
  description: string;
}

export const SIMULATORS: SimulatorInfo[] = [
  { id: 'cache', title: 'Cache', description: 'Hit ratio, TTL and cache outages versus latency and database load.' },
  { id: 'queue', title: 'Message queue', description: 'Producer rate, consumers and crashes versus backlog and wait time.' },
  { id: 'retry', title: 'Retries', description: 'Retries, backoff and jitter versus load amplification and retry storms.' },
  { id: 'ratelimit', title: 'Rate limiting', description: 'Token bucket, fixed window and sliding window on bursty traffic.' },
  { id: 'replication', title: 'Replication lag', description: 'Read-after-write from a lagging replica and how often it is stale.' },
  { id: 'circuit', title: 'Circuit breaker', description: 'Closed, open and half-open states during a dependency outage.' },
  { id: 'scaling', title: 'Autoscaling', description: 'Instances, cooldown and start-up time versus dropped requests in a spike.' },
  { id: 'partition', title: 'Network partition', description: 'CP versus AP: availability against stale reads and lost writes.' },
  { id: 'loadbalancer', title: 'Load balancing', description: 'Round robin, least connections and random with uneven servers.' },
  { id: 'consistent-hash', title: 'Consistent hashing', description: 'Keys moved when nodes join or leave, versus modulo hashing.' },
];

export const isSimName = (v: unknown): v is SimName => typeof v === 'string' && SIMULATORS.some((s) => s.id === v);
