import { describe, expect, it, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import HldPlayground from './HldPlayground';
import { readJson } from '../../lib/storage';
import type { HldGraph } from './types';

beforeAll(() => {
  // React Flow needs these browser APIs, which jsdom lacks.
  class RO { observe() {} unobserve() {} disconnect() {} }
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= RO;
  (globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly ??= class {
    m22 = 1;
    constructor() {}
  };
});

const initial: HldGraph = {
  nodes: [
    { id: 'c', type: 'client', label: 'Mobile app', props: { rps: 2000 } },
    { id: 'db', type: 'database', label: 'PostgreSQL' },
  ],
  edges: [{ from: 'c', to: 'db', kind: 'sync' }],
};

describe('HldPlayground', () => {
  it('renders palette, canvas nodes and review findings', () => {
    render(<HldPlayground storageKey="test:hld:1" initial={initial} title="Test design" />);
    expect(screen.getByRole('region', { name: 'Test design' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Add Cache:/ })).toBeInTheDocument();
    expect(screen.getByText('Client talks directly to the database')).toBeInTheDocument();
    expect(screen.getAllByText('Definite problem').length).toBeGreaterThan(0);
  });

  it('adds a component from the palette and auto-saves', async () => {
    render(<HldPlayground storageKey="test:hld:2" initial={initial} />);
    fireEvent.click(screen.getByRole('button', { name: /Add Monitoring:/ }));
    await new Promise((r) => setTimeout(r, 400));
    const saved = readJson<HldGraph | null>('test:hld:2', null);
    expect(saved?.nodes.map((n) => n.type)).toContain('monitoring');
  });

  it('shows the compare tab only with a reference', () => {
    const { unmount } = render(<HldPlayground storageKey="test:hld:3" initial={initial} />);
    expect(screen.queryByRole('tab', { name: 'Compare' })).toBeNull();
    unmount();
    render(<HldPlayground storageKey="test:hld:4" initial={initial} reference={initial} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Compare' }));
    expect(screen.getByText(/Same component types and connections/)).toBeInTheDocument();
  });

  it('exports Mermaid text', () => {
    render(<HldPlayground storageKey="test:hld:5" initial={initial} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Import/Export' }));
    const mmd = screen.getByLabelText('Mermaid flowchart') as HTMLTextAreaElement;
    expect(mmd.value).toContain('n_c --> n_db');
  });

  it('undoes and redoes edits from the toolbar and the keyboard', async () => {
    render(<HldPlayground storageKey="test:hld:6" initial={initial} title="Undo test" />);
    const count = () => screen.getByText(/components ·/).textContent;
    expect(count()).toMatch(/^2 components/);
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /Add Cache:/ }));
    expect(count()).toMatch(/^3 components/);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(count()).toMatch(/^2 components/);
    fireEvent.click(screen.getByRole('button', { name: 'Redo' }));
    expect(count()).toMatch(/^3 components/);

    // Keyboard: shortcuts apply once the canvas has been clicked.
    fireEvent.pointerDown(screen.getByRole('region', { name: 'Undo test' }));
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(count()).toMatch(/^2 components/);
    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(count()).toMatch(/^3 components/);
    await new Promise((r) => setTimeout(r, 350));
    // Select all, duplicate (components and the connections between them), then undo it in one step.
    fireEvent.keyDown(window, { key: 'a', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'd', ctrlKey: true });
    expect(count()).toMatch(/^6 components · 2 connections/);
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(count()).toMatch(/^3 components/);
  });

  it('ignores canvas shortcuts while typing in a field', () => {
    render(<HldPlayground storageKey="test:hld:7" initial={initial} title="Typing test" />);
    fireEvent.click(screen.getByRole('button', { name: /Add Cache:/ }));
    const field = screen.getAllByRole('textbox')[0];
    fireEvent.pointerDown(field);
    fireEvent.keyDown(field, { key: 'z', ctrlKey: true });
    expect(screen.getByText(/components ·/).textContent).toMatch(/^3 components/);
  });

  it('goes full screen (overlay fallback) and back, and shows the shortcut sheet', () => {
    render(<HldPlayground storageKey="test:hld:8" initial={initial} title="FS test" />);
    const region = screen.getByRole('region', { name: 'FS test' });
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }));
    expect(region.className).toContain('fixed');
    fireEvent.click(screen.getByRole('button', { name: 'Exit full screen' }));
    expect(region.className).not.toContain('fixed');
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts' }));
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});
