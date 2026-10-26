import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import SimulatorLab, { SIMULATORS } from './SimulatorLab';
import SimulatorLabPage from './SimulatorLabPage';
import { applyAttrs } from './ui';
import { RETRY_DEFAULTS, RETRY_INCIDENT, simulateRetry } from './models/retry';
import { CIRCUIT_DEFAULTS, simulateCircuit } from './models/circuit';
import { LB_DEFAULTS, simulateLoadBalancer } from './models/loadbalancer';
import { simulatePartition, PARTITION_DEFAULTS } from './models/partition';

describe('applyAttrs', () => {
  const d = { hitRatio: 0.5, cacheDown: false, mode: 'CP' };
  it('coerces strings to the default types and ignores junk', () => {
    expect(applyAttrs(d, { hitRatio: '0.8', cacheDown: 'true', mode: 'AP', nope: '1' }, { mode: ['CP', 'AP'] })).toEqual({ hitRatio: 0.8, cacheDown: true, mode: 'AP' });
    expect(applyAttrs(d, { hitRatio: 'abc', cacheDown: 'maybe', mode: 'XX' }, { mode: ['CP', 'AP'] })).toEqual(d);
    expect(applyAttrs(d)).toEqual(d);
  });
});

describe('SIMULATORS', () => {
  it('lists the ten documented simulators', () => {
    expect(SIMULATORS.map((s) => s.id)).toEqual(['cache', 'queue', 'retry', 'ratelimit', 'replication', 'circuit', 'scaling', 'partition', 'loadbalancer', 'consistent-hash']);
  });
});

describe('SimulatorLab', () => {
  for (const s of SIMULATORS) {
    it(`renders ${s.id} with assumptions, try-this prompts and working controls`, () => {
      render(<SimulatorLab sim={s.id} />);
      expect(screen.getByRole('region', { name: /simulator$/ })).toBeInTheDocument();
      expect(screen.getByText('Assumptions')).toBeInTheDocument();
      expect(screen.getByText(/simplified, deterministic teaching model/)).toBeInTheDocument();
      expect(screen.getByText('Try this')).toBeInTheDocument();
      const setups = screen.queryAllByRole('button', { name: 'Set up' });
      for (const b of setups) fireEvent.click(b);
      fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
      fireEvent.click(screen.getByRole('button', { name: 'Step' }));
      fireEvent.click(screen.getByRole('button', { name: 'Restore defaults' }));
      expect(screen.getAllByRole('img').length).toBeGreaterThan(0);
    });
  }

  it('applies attrs as initial parameters', () => {
    render(<SimulatorLab sim="cache" attrs={{ hitRatio: '0.42' }} />);
    expect(screen.getByLabelText('Cacheable hit ratio')).toHaveValue('0.42');
  });

  it('plays and pauses', () => {
    render(<SimulatorLab sim="queue" />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Pause' }));
    expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
  });

  it('shows a picker when no sim is given, and the page switches simulators', () => {
    const { unmount } = render(<SimulatorLab />);
    fireEvent.change(screen.getByLabelText('Simulator'), { target: { value: 'circuit' } });
    expect(screen.getByRole('region', { name: 'Circuit breaker simulator' })).toBeInTheDocument();
    unmount();
    render(<SimulatorLabPage />);
    fireEvent.click(screen.getByRole('button', { name: /Consistent hashing/ }));
    expect(screen.getByRole('region', { name: 'Consistent hashing simulator' })).toBeInTheDocument();
  });

  it('reports an unknown simulator name', () => {
    render(<SimulatorLab sim={'nope' as never} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Unknown simulator');
  });
});

// The "Try this" texts make claims; keep them true.
describe('try-this claims', () => {
  it('retry prompts', () => {
    expect(simulateRetry(RETRY_DEFAULTS).summary.stormAfterIncident).toBe(false);
    const storm = simulateRetry({ ...RETRY_DEFAULTS, clients: 900 });
    expect(storm.summary.stormAfterIncident).toBe(true);
    const smoothed = simulateRetry({ ...RETRY_DEFAULTS, clients: 900, backoff: true, jitter: true });
    expect(smoothed.summary.stormAfterIncident).toBe(true);
    expect(smoothed.summary.peakLoad).toBeLessThanOrEqual(storm.summary.peakLoad);
    const none = simulateRetry({ ...RETRY_DEFAULTS, clients: 900, maxRetries: 0 });
    expect(none.load[RETRY_INCIDENT.to + 1]).toBeLessThan(1);
  });
  it('circuit prompts', () => {
    expect(simulateCircuit({ ...CIRCUIT_DEFAULTS, outageFailure: 0.4 }).summary.trips).toBe(0);
    const halfOpen = (openSec: number) => simulateCircuit({ ...CIRCUIT_DEFAULTS, openSec }).state.filter((s) => s === 'half-open').length;
    expect(halfOpen(2)).toBeGreaterThan(2 * halfOpen(10));
  });
  it('load balancer prompt: random worse than round robin with identical servers at high load', () => {
    const rr = simulateLoadBalancer({ ...LB_DEFAULTS, slowServers: 0, loadPct: 0.9 });
    const rnd = simulateLoadBalancer({ ...LB_DEFAULTS, slowServers: 0, loadPct: 0.9, algorithm: 'random' });
    expect(rnd.summary.p95LatencyMs).toBeGreaterThan(rr.summary.p95LatencyMs);
  });
  it('partition prompt: more keys means fewer conflicts', () => {
    const few = simulatePartition({ ...PARTITION_DEFAULTS, mode: 'AP' });
    const many = simulatePartition({ ...PARTITION_DEFAULTS, mode: 'AP', keys: 1000 });
    expect(many.summary.conflictingKeys / 1000).toBeLessThan(few.summary.conflictingKeys / 50);
    expect(many.summary.lostWrites).toBeLessThan(few.summary.lostWrites);
  });
});
