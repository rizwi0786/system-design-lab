// Lazy entry points for the heavy playgrounds so they only load when a learner opens one.
import { lazy, Suspense, type ReactNode, Component } from 'react';
import { Spinner } from './ui';

export const HldPlayground = lazy(() => import('../playgrounds/hld/HldPlayground'));
export const HldPlaygroundPage = lazy(() => import('../playgrounds/hld/HldPlaygroundPage'));
export const SimulatorLab = lazy(() => import('../playgrounds/sim/SimulatorLab'));
export const SimulatorLabPage = lazy(() => import('../playgrounds/sim/SimulatorLabPage'));
export const LldPlayground = lazy(() => import('../playgrounds/lld/LldPlayground'));
export const LldPlaygroundPage = lazy(() => import('../playgrounds/lld/LldPlaygroundPage'));
export const SqlPlayground = lazy(() => import('../playgrounds/sql/SqlPlayground'));
export const SqlPlaygroundPage = lazy(() => import('../playgrounds/sql/SqlPlaygroundPage'));
export const CSharpEditor = lazy(() => import('./CSharpEditor'));

class Boundary extends Component<{ children: ReactNode; label: string }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) return (
      <div className="not-prose rounded-lg border border-bad/40 bg-bad-soft p-4 text-sm text-bad" role="alert">
        <strong>The {this.props.label} could not load.</strong> {this.state.error.message}
        <div className="mt-2"><button className="underline" onClick={() => this.setState({ error: null })}>Try again</button></div>
      </div>
    );
    return this.props.children;
  }
}

export function Lazy({ children, label }: { children: ReactNode; label: string }) {
  return <Boundary label={label}><Suspense fallback={<Spinner label={`Loading ${label}…`} />}>{children}</Suspense></Boundary>;
}

export function parseJsonBlock<T>(text: string | undefined): T | undefined {
  if (!text) return undefined;
  const m = text.match(/```json[^\n]*\n([\s\S]*?)\n```/);
  const raw = m ? m[1] : text.trim().startsWith('{') ? text : null;
  if (!raw) return undefined;
  try { return JSON.parse(raw) as T; } catch { return undefined; }
}

export function sqlBlock(text: string): string {
  const m = text.match(/```(?:sql|psql|pgsql)[^\n]*\n([\s\S]*?)\n```/);
  return m ? m[1] : text;
}
