import { describe, expect, it, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import LldPlayground from './LldPlayground';
import { toMermaid, toStateDiagram } from './generate';
import { LLD_TEMPLATES } from './templates';

beforeAll(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});

describe('generated Mermaid parses', () => {
  it('class diagrams and state diagrams of every template', async () => {
    const { default: mermaid } = await import('mermaid');
    for (const t of LLD_TEMPLATES) {
      if (!t.model.classes.length) continue;
      await expect(mermaid.parse(toMermaid(t.model)), t.id).resolves.toBeTruthy();
      for (const c of t.model.classes) if (c.states?.length) await expect(mermaid.parse(toStateDiagram(c.states, c.transitions ?? []))).resolves.toBeTruthy();
    }
  });
});

describe('LldPlayground', () => {
  it('renders template classes, adds a class and shows review sections', () => {
    const strategy = LLD_TEMPLATES.find((t) => t.id === 'strategy')!.model;
    render(<LldPlayground initial={strategy} storageKey="test:lld" title="Strategy" />);
    expect(screen.getByText('PercentageOffStrategy')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '+ Interface' }));
    expect(screen.getByDisplayValue('INewInterface')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Review/ }));
    expect(screen.getByText(/Definite issues/)).toBeInTheDocument();
    expect(screen.getByText(/Trade-offs to consider/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: 'C#' }));
    expect(screen.getByText('Checkout.cs')).toBeInTheDocument();
  });

  it('undoes and redoes adding a class', () => {
    const strategy = LLD_TEMPLATES.find((t) => t.id === 'strategy')!.model;
    render(<LldPlayground initial={strategy} storageKey="test:lld:undo" title="Undo LLD" />);
    fireEvent.click(screen.getByRole('button', { name: '+ Interface' }));
    expect(screen.getAllByText('INewInterface').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(screen.queryAllByText('INewInterface')).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(screen.getAllByText('INewInterface').length).toBeGreaterThan(0);
  });
});
