import { mulberry32 } from './prng';

export type PartitionMode = 'CP' | 'AP';

export interface PartitionParams {
  mode: PartitionMode;
  partitionSec: number;
  requestsPerSec: number; // per region
  writeShare: number;
  keys: number;
}

export const PARTITION_DEFAULTS: PartitionParams = { mode: 'CP', partitionSec: 30, requestsPerSec: 20, writeShare: 0.3, keys: 50 };
export const PARTITION_STEPS = 80;
export const PARTITION_START = 20;

export interface PartitionResult {
  partitioned: boolean[];
  availA: number[];
  availB: number[];
  staleReads: number[];
  summary: { availability: number; availabilityB: number; staleReads: number; servedReads: number; stalePct: number; conflictingKeys: number; lostWrites: number };
}

/**
 * Two regions. Region A holds the leader (majority); region B is the minority side.
 * CP: during the partition B refuses reads and writes it cannot confirm with the leader.
 * AP: both sides keep serving; B misses A's new writes (stale reads) and both may write the same key,
 *     which last-writer-wins resolves on heal by discarding the older write.
 */
export function simulatePartition(p: PartitionParams, seed = 23): PartitionResult {
  const rand = mulberry32(seed);
  const keys = Math.max(1, Math.round(p.keys));
  const n = Math.max(0, Math.round(p.requestsPerSec));
  const end = PARTITION_START + p.partitionSec;
  // During the partition: per-key last write time on each side (−1 = untouched since the split).
  let writtenA = new Array<number>(keys).fill(-1);
  let writtenB = new Array<number>(keys).fill(-1);
  let writesA = new Array<number>(keys).fill(0);
  let writesB = new Array<number>(keys).fill(0);
  const r: PartitionResult = { partitioned: [], availA: [], availB: [], staleReads: [], summary: { availability: 1, availabilityB: 1, staleReads: 0, servedReads: 0, stalePct: 0, conflictingKeys: 0, lostWrites: 0 } };
  let served = 0;
  let servedB = 0;
  let total = 0;

  for (let t = 0; t < PARTITION_STEPS; t++) {
    const split = t >= PARTITION_START && t < end;
    if (t === end && p.mode === 'AP') {
      // Heal: reconcile with last-writer-wins.
      for (let k = 0; k < keys; k++) {
        if (writtenA[k] >= 0 && writtenB[k] >= 0) {
          r.summary.conflictingKeys++;
          r.summary.lostWrites += writtenA[k] >= writtenB[k] ? writesB[k] : writesA[k];
        }
      }
      writtenA = writtenA.map(() => -1);
      writtenB = writtenB.map(() => -1);
      writesA = writesA.map(() => 0);
      writesB = writesB.map(() => 0);
    }
    let okA = 0;
    let okB = 0;
    let stale = 0;
    for (const region of ['A', 'B'] as const) {
      for (let i = 0; i < n; i++) {
        const isWrite = rand() < p.writeShare;
        const key = Math.floor(rand() * keys);
        const time = t + i / Math.max(1, n);
        total++;
        if (!split) {
          if (region === 'A') okA++;
          else okB++;
          if (!isWrite) r.summary.servedReads++;
          continue;
        }
        if (region === 'B' && p.mode === 'CP') continue; // refused: cannot reach the leader
        if (region === 'A') okA++;
        else okB++;
        if (isWrite) {
          if (region === 'A') {
            writtenA[key] = time;
            writesA[key]++;
          } else {
            writtenB[key] = time;
            writesB[key]++;
          }
        } else {
          r.summary.servedReads++;
          // A read is stale when the other side changed this key and we cannot see it.
          const other = region === 'A' ? writtenB[key] : writtenA[key];
          if (other >= 0) stale++;
        }
      }
    }
    served += okA + okB;
    servedB += okB;
    r.partitioned.push(split);
    r.availA.push(n ? okA / n : 1);
    r.availB.push(n ? okB / n : 1);
    r.staleReads.push(stale);
    r.summary.staleReads += stale;
  }
  r.summary.availability = total ? served / total : 1;
  r.summary.availabilityB = total ? servedB / (total / 2) : 1;
  r.summary.stalePct = r.summary.servedReads ? r.summary.staleReads / r.summary.servedReads : 0;
  return r;
}
