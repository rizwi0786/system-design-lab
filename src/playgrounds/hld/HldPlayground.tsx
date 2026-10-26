import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react';
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
} from '@xyflow/react';
import { readJson, writeJson } from '../../lib/storage';
import { autoLayout, parseHldGraph, toMermaid } from './analysis';
import { HighlightContext, HldNodeView, type HldFlowNode } from './HldNodeView';
import {
  btn,
  ComparePanel,
  ExportPanel,
  FindingsPanel,
  Inspector,
  SectionTitle,
  SummaryPanel,
  type EdgeSelection,
  type NodeSelection,
} from './HldPanels';
import { NodeIcon } from './icons';
import { validateHld } from './validate';
import { useCanvasKeys, useCanvasPrefs, useFullscreen, useHistory } from '../canvasHooks';
import { CanvasToolbar, ShortcutsHelp } from '../CanvasToolbar';
import {
  emptyGraph,
  HLD_NODE_TYPES,
  isNodeType,
  NODE_META,
  type HldEdge,
  type HldEdgeKind,
  type HldFinding,
  type HldGraph,
  type HldNode,
  type HldNodeType,
} from './types';

export type { HldGraph, HldNode, HldEdge, HldFinding, HldNodeType, HldEdgeKind } from './types';
export { validateHld } from './validate';

export interface HldPlaygroundProps {
  initial?: HldGraph;
  reference?: HldGraph;
  storageKey: string;
  title?: string;
  compact?: boolean;
  /** Fill the parent's height instead of using a fixed height (used by the full-page view). */
  fullHeight?: boolean;
}

type HldEdgeData = { kind: HldEdgeKind; label?: string };
type HldFlowEdge = Edge<HldEdgeData>;

const DND_MIME = 'application/x-hld-node';
const nodeTypes: NodeTypes = { hld: HldNodeView };

// ---------- conversions ----------

function toFlow(g: HldGraph): { nodes: HldFlowNode[]; edges: HldFlowEdge[] } {
  const laid = autoLayout(g);
  const nodes: HldFlowNode[] = laid.nodes.map((n) => ({
    id: n.id,
    type: 'hld',
    position: n.position ?? { x: 0, y: 0 },
    data: { type: n.type, label: n.label, props: { ...(n.props ?? {}) } },
  }));
  const edges: HldFlowEdge[] = laid.edges.map((e, i) => ({
    id: e.id ?? `e${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    data: { kind: e.kind, label: e.label },
  }));
  return { nodes, edges };
}

function toGraph(nodes: HldFlowNode[], edges: HldFlowEdge[]): HldGraph {
  return {
    nodes: nodes.map((n) => {
      const out: HldNode = { id: n.id, type: n.data.type, label: n.data.label };
      if (Object.keys(n.data.props).length) out.props = { ...n.data.props };
      out.position = { x: Math.round(n.position.x), y: Math.round(n.position.y) };
      return out;
    }),
    edges: edges.map((e) => {
      const out: HldEdge = { id: e.id, from: e.source, to: e.target, kind: e.data?.kind ?? 'sync' };
      if (e.data?.label) out.label = e.data.label;
      return out;
    }),
  };
}

function loadInitial(storageKey: string, initial?: HldGraph): HldGraph {
  const saved = readJson<unknown>(storageKey, null);
  if (saved) {
    const r = parseHldGraph(saved);
    if (r.ok) return r.graph;
  }
  if (initial) {
    const r = parseHldGraph(initial);
    if (r.ok) return r.graph;
  }
  return emptyGraph();
}

/** Copied components, shared by every HLD canvas on the page so you can paste between them. */
let clipboard: HldGraph | null = null;

function uniqueId(base: string, taken: Set<string>): string {
  let i = 1;
  while (taken.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

// ---------- component ----------

export default function HldPlayground(props: HldPlaygroundProps) {
  return (
    <ReactFlowProvider>
      <HldPlaygroundInner {...props} />
    </ReactFlowProvider>
  );
}

type Tab = 'inspect' | 'findings' | 'summary' | 'compare' | 'export';

function HldPlaygroundInner({ initial, reference, storageKey, title, compact, fullHeight }: HldPlaygroundProps) {
  const [start] = useState(() => toFlow(loadInitial(storageKey, initial)));
  const [nodes, setNodes, onNodesChange] = useNodesState<HldFlowNode>(start.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<HldFlowEdge>(start.edges);
  const [tab, setTab] = useState<Tab>('findings');
  const [activeFinding, setActiveFinding] = useState<HldFinding | null>(null);
  const [announce, setAnnounce] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const rf = useReactFlow<HldFlowNode, HldFlowEdge>();
  const [help, setHelp] = useState(false);
  const [prefs, setPrefs] = useCanvasPrefs('hld', { snap: false, minimap: !compact });
  const pasteCount = useRef(0);

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const findings = useMemo(() => validateHld(graph), [graph]);
  const json = useMemo(() => JSON.stringify(graph, null, 2), [graph]);
  const mermaid = useMemo(() => toMermaid(graph), [graph]);

  // Auto-save (debounced so dragging does not write on every frame).
  useEffect(() => {
    const t = setTimeout(() => writeJson(storageKey, graph), 300);
    return () => clearTimeout(t);
  }, [graph, storageKey]);

  // Drop a stale highlight when the finding disappears.
  useEffect(() => {
    if (activeFinding && !findings.some((f) => f.id === activeFinding.id)) setActiveFinding(null);
  }, [findings, activeFinding]);

  const highlight = useMemo(() => new Set(activeFinding?.nodeIds ?? []), [activeFinding]);

  // ---------- undo / redo, full screen, clipboard ----------
  const restore = useCallback((s: string) => {
    const f = toFlow(JSON.parse(s) as HldGraph);
    setNodes(f.nodes);
    setEdges(f.edges);
  }, [setNodes, setEdges]);
  const [dragging, setDragging] = useState(false);
  const history = useHistory(json, restore, { paused: dragging });
  const fs = useFullscreen(sectionRef);
  useEffect(() => {
    const t = setTimeout(() => rf.fitView({ padding: 0.2, duration: 200 }), 150);
    return () => clearTimeout(t);
  }, [fs.isFullscreen, rf]);

  const selectedGraph = useCallback((): HldGraph | null => {
    const sel = nodes.filter((n) => n.selected);
    if (!sel.length) return null;
    const ids = new Set(sel.map((n) => n.id));
    return toGraph(sel, edges.filter((e) => ids.has(e.source) && ids.has(e.target)));
  }, [nodes, edges]);

  const pasteGraph = useCallback((clip: HldGraph, offset: number) => {
    const taken = new Set(nodes.map((n) => n.id));
    const idMap = new Map<string, string>();
    const added: HldFlowNode[] = clip.nodes.map((n) => {
      const id = uniqueId(n.type, taken);
      taken.add(id);
      idMap.set(n.id, id);
      return { id, type: 'hld', selected: true, position: { x: (n.position?.x ?? 0) + offset, y: (n.position?.y ?? 0) + offset }, data: { type: n.type, label: n.label, props: { ...(n.props ?? {}) } } };
    });
    const takenE = new Set(edges.map((e) => e.id));
    const addedE: HldFlowEdge[] = clip.edges.flatMap((e) => {
      const source = idMap.get(e.from), target = idMap.get(e.to);
      if (!source || !target) return [];
      const id = uniqueId(`e-${source}-${target}`, takenE);
      takenE.add(id);
      return [{ id, source, target, data: { kind: e.kind, label: e.label } }];
    });
    setNodes((ns) => [...ns.map((n) => ({ ...n, selected: false })), ...added]);
    setEdges((es) => [...es.map((e) => ({ ...e, selected: false })), ...addedE]);
    setAnnounce(`Pasted ${added.length} component${added.length === 1 ? '' : 's'}`);
  }, [nodes, edges, setNodes, setEdges]);

  const copy = () => { const g = selectedGraph(); if (g) { clipboard = g; pasteCount.current = 0; setAnnounce(`Copied ${g.nodes.length} component${g.nodes.length === 1 ? '' : 's'}`); } };
  const paste = () => { if (clipboard) { pasteCount.current += 1; pasteGraph(clipboard, 40 * pasteCount.current); } };
  const duplicate = () => { const g = selectedGraph(); if (g) pasteGraph(g, 40); };
  const removeSelected = () => {
    const gone = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    setNodes((ns) => ns.filter((n) => !n.selected));
    setEdges((es) => es.filter((e) => !e.selected && !gone.has(e.source) && !gone.has(e.target)));
    setAnnounce('Selection deleted');
  };
  const selectAll = () => { setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))); setEdges((es) => es.map((e) => ({ ...e, selected: true }))); };
  const clearSelection = () => { setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))); setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e))); };
  const arrange = () => {
    const laid = autoLayout({ ...graph, nodes: graph.nodes.map((n) => ({ ...n, position: undefined })) });
    const pos = new Map(laid.nodes.map((n) => [n.id, n.position!]));
    setNodes((ns) => ns.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position })));
    requestAnimationFrame(() => rf.fitView({ padding: 0.2, duration: 250 }));
    setAnnounce('Auto-arranged');
  };
  const fit = () => rf.fitView({ padding: 0.2, duration: 200 });
  const hasSelection = nodes.some((n) => n.selected) || edges.some((e) => e.selected);

  useCanvasKeys(sectionRef, {
    'mod+z': history.undo, 'mod+shift+z': history.redo, 'mod+y': history.redo,
    'mod+c': copy, 'mod+v': paste, 'mod+d': duplicate, 'mod+a': selectAll,
    l: arrange, g: () => setPrefs({ snap: !prefs.snap }), m: () => setPrefs({ minimap: !prefs.minimap }), '0': fit,
    f: fs.toggle, '?': () => setHelp((h) => !h),
    escape: () => { if (help) setHelp(false); else if (fs.overlay) fs.exit(); else clearSelection(); },
  });

  const selection: NodeSelection | EdgeSelection | null = useMemo(() => {
    const n = nodes.find((x) => x.selected);
    if (n) return { kind: 'node', id: n.id, type: n.data.type, label: n.data.label, props: n.data.props };
    const e = edges.find((x) => x.selected);
    if (e) {
      const lbl = (id: string) => nodes.find((x) => x.id === id)?.data.label ?? id;
      return {
        kind: 'edge',
        id: e.id,
        fromLabel: lbl(e.source),
        toLabel: lbl(e.target),
        edgeKind: e.data?.kind ?? 'sync',
        label: e.data?.label ?? '',
      };
    }
    return null;
  }, [nodes, edges]);

  // Jump to the inspector when the user selects something.
  const selKey = selection ? `${selection.kind}:${selection.id}` : '';
  const lastSel = useRef('');
  useEffect(() => {
    if (selKey && selKey !== lastSel.current) setTab('inspect');
    lastSel.current = selKey;
  }, [selKey]);

  const addNode = useCallback(
    (type: HldNodeType, position?: { x: number; y: number }) => {
      setNodes((ns) => {
        const id = uniqueId(type, new Set(ns.map((n) => n.id)));
        let pos = position;
        if (!pos) {
          const box = wrapper.current?.getBoundingClientRect();
          const center = box ? rf.screenToFlowPosition({ x: box.left + box.width / 2, y: box.top + box.height / 2 }) : { x: 100, y: 100 };
          const k = ns.length % 6;
          pos = { x: center.x - 80 + k * 18, y: center.y - 30 + k * 18 };
        }
        const node: HldFlowNode = {
          id,
          type: 'hld',
          position: pos,
          selected: true,
          data: { type, label: NODE_META[type].label, props: {} },
        };
        return [...ns.map((n) => ({ ...n, selected: false })), node];
      });
      setEdges((es) => es.map((e) => (e.selected ? { ...e, selected: false } : e)));
      setAnnounce(`Added ${NODE_META[type].label}`);
    },
    [rf, setNodes, setEdges],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData(DND_MIME);
      if (!isNodeType(type)) return;
      const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      addNode(type, { x: p.x - 75, y: p.y - 25 });
    },
    [rf, addNode],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      setEdges((es) => {
        if (es.some((e) => e.source === c.source && e.target === c.target)) return es;
        const id = uniqueId(`e-${c.source}-${c.target}`, new Set(es.map((e) => e.id)));
        return [...es, { id, source: c.source, target: c.target, data: { kind: 'sync' } }];
      });
    },
    [setEdges],
  );

  const replaceGraph = useCallback(
    (g: HldGraph) => {
      const f = toFlow(g);
      setNodes(f.nodes);
      setEdges(f.edges);
      setActiveFinding(null);
      requestAnimationFrame(() => rf.fitView({ padding: 0.2 }));
    },
    [rf, setNodes, setEdges],
  );

  const reset = () => {
    const r = initial ? parseHldGraph(initial) : null;
    replaceGraph(r && r.ok ? r.graph : emptyGraph());
    setAnnounce('Canvas reset');
  };

  const onImport = (text: string): string | null => {
    const r = parseHldGraph(text);
    if (!r.ok) return r.error;
    replaceGraph(r.graph);
    return null;
  };

  const renderEdges = useMemo(
    () =>
      edges.map((e) => {
        const async = e.data?.kind === 'async';
        const sel = e.selected;
        return {
          ...e,
          animated: async,
          label: e.data?.label || undefined,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: sel ? 'var(--color-accent)' : 'var(--color-ink-3)' },
          style: {
            stroke: sel ? 'var(--color-accent)' : 'var(--color-ink-3)',
            strokeWidth: sel ? 2 : 1.5,
            strokeDasharray: async ? '6 4' : undefined,
          },
          labelStyle: { fill: 'var(--color-ink-2)', fontSize: 11 },
          labelBgStyle: { fill: 'var(--color-surface)' },
          ariaLabel: `${async ? 'Async' : 'Sync'} connection from ${e.source} to ${e.target}`,
        };
      }),
    [edges],
  );

  const flowStyle = {
    '--xy-background-color': 'var(--color-bg)',
    '--xy-background-pattern-color': 'var(--color-line)',
    '--xy-controls-button-background-color': 'var(--color-surface)',
    '--xy-controls-button-background-color-hover': 'var(--color-surface-2)',
    '--xy-controls-button-color': 'var(--color-ink)',
    '--xy-controls-button-border-color': 'var(--color-line)',
    '--xy-connectionline-stroke': 'var(--color-accent)',
    '--xy-attribution-background-color': 'transparent',
  } as CSSProperties;

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const tabs: { id: Tab; label: string }[] = [
    { id: 'inspect', label: 'Inspect' },
    { id: 'findings', label: `Review (${findings.length})` },
    { id: 'summary', label: 'Latency' },
    ...(reference ? [{ id: 'compare' as const, label: 'Compare' }] : []),
    { id: 'export', label: 'Import/Export' },
  ];

  const height = fs.isFullscreen ? 'h-screen w-screen' : fullHeight ? 'h-full min-h-[560px]' : compact ? 'h-[520px]' : 'h-[720px]';

  return (
    <section
      ref={sectionRef}
      className={`flex flex-col overflow-hidden border-line bg-surface text-ink ${height} ${fs.isFullscreen ? 'rounded-none border-0' : 'rounded-xl border'} ${fs.overlay ? 'fixed inset-0 z-[80]' : ''}`}
      aria-label={title ?? 'Architecture playground'}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <h2 className="mr-auto text-sm font-semibold text-ink">{title ?? 'Architecture playground'}</h2>
        <span className="text-[11px] text-ink-3" aria-live="polite">
          {nodes.length} components · {edges.length} connections
          {errorCount > 0 && <span className="text-bad"> · {errorCount} definite problem{errorCount > 1 ? 's' : ''}</span>}
        </span>
        <button type="button" className={btn} onClick={reset} title="Discard changes and restore the starting design">
          Reset
        </button>
        <CanvasToolbar t={{
          undo: history.undo, redo: history.redo, canUndo: history.canUndo, canRedo: history.canRedo,
          duplicate, remove: removeSelected, hasSelection, arrange, fit,
          snap: prefs.snap, toggleSnap: () => setPrefs({ snap: !prefs.snap }),
          minimap: prefs.minimap, toggleMinimap: () => setPrefs({ minimap: !prefs.minimap }),
          fullscreen: fs.isFullscreen, toggleFullscreen: fs.toggle, toggleHelp: () => setHelp((h) => !h),
        }} />
      </header>

      <div
        className={`grid min-h-0 flex-1 ${
          compact ? 'grid-cols-1 grid-rows-[auto_1fr_auto] md:grid-cols-[1fr_300px] md:grid-rows-[auto_1fr]' : 'grid-cols-1 grid-rows-[auto_1fr_auto] lg:grid-cols-[210px_1fr_320px] lg:grid-rows-1'
        }`}
      >
        <Palette compact={!!compact} onAdd={addNode} />

        <div ref={wrapper} className="relative min-h-[280px]" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={onDrop}>
          <HighlightContext.Provider value={highlight}>
            <ReactFlow<HldFlowNode, HldFlowEdge>
              nodes={nodes}
              edges={renderEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeDragStart={() => setDragging(true)}
              onNodeDragStop={() => setDragging(false)}
              deleteKeyCode={['Delete', 'Backspace']}
              snapToGrid={prefs.snap}
              snapGrid={[18, 18]}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              style={flowStyle}
              proOptions={{ hideAttribution: false }}
              aria-label="Design canvas"
            >
              <Background gap={18} size={prefs.snap ? 1.6 : 1} />
              <Controls showInteractive={false} />
              {prefs.minimap && (
                <MiniMap pannable zoomable ariaLabel="Mini-map" maskColor="color-mix(in srgb, var(--color-bg) 70%, transparent)"
                  nodeColor="var(--color-accent-soft)" nodeStrokeColor="var(--color-accent)" style={{ background: 'var(--color-surface)' }} />
              )}
            </ReactFlow>
          </HighlightContext.Provider>
          {nodes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-xs text-ink-3">
              Drag components here from the palette, or click one to add it.
            </div>
          )}
          {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
        </div>

        <aside
          className={`flex min-h-0 flex-col border-line bg-surface ${compact ? 'border-t md:col-start-2 md:row-span-2 md:row-start-1 md:border-l md:border-t-0' : 'border-t lg:border-l lg:border-t-0'}`}
        >
          <div role="tablist" aria-label="Playground panels" className="flex shrink-0 gap-0.5 overflow-x-auto border-b border-line px-2 pt-1.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`hld-tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`hld-panel-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`whitespace-nowrap rounded-t-md px-2 py-1 text-xs ${
                  tab === t.id ? 'border-b-2 border-accent font-medium text-ink' : 'text-ink-2 hover:text-ink'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`hld-panel-${tab}`} aria-labelledby={`hld-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-3 max-lg:max-h-[420px]">
            {tab === 'inspect' && (
              <Inspector
                selection={selection}
                onNodeChange={(id, patch) =>
                  setNodes((ns) =>
                    ns.map((n) =>
                      n.id === id
                        ? { ...n, data: { ...n.data, ...(patch.label !== undefined ? { label: patch.label } : {}), ...(patch.props ? { props: patch.props } : {}) } }
                        : n,
                    ),
                  )
                }
                onEdgeChange={(id, patch) =>
                  setEdges((es) => es.map((e) => (e.id === id ? { ...e, data: { kind: e.data?.kind ?? 'sync', label: e.data?.label, ...patch } } : e)))
                }
                onDelete={(kind, id) => {
                  if (kind === 'node') {
                    setNodes((ns) => ns.filter((n) => n.id !== id));
                    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
                  } else setEdges((es) => es.filter((e) => e.id !== id));
                  setAnnounce(kind === 'node' ? 'Component deleted' : 'Connection deleted');
                }}
              />
            )}
            {tab === 'findings' && <FindingsPanel findings={findings} activeId={activeFinding?.id ?? null} onActivate={setActiveFinding} />}
            {tab === 'summary' && <SummaryPanel graph={graph} />}
            {tab === 'compare' && reference && <ComparePanel graph={graph} reference={reference} />}
            {tab === 'export' && <ExportPanel json={json} mermaid={mermaid} onImport={onImport} />}
          </div>
        </aside>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </section>
  );
}

function Palette({ compact, onAdd }: { compact: boolean; onAdd: (t: HldNodeType) => void }) {
  const groups = useMemo(() => {
    const m = new Map<string, HldNodeType[]>();
    for (const t of HLD_NODE_TYPES) {
      const g = NODE_META[t].group;
      m.set(g, [...(m.get(g) ?? []), t]);
    }
    return [...m.entries()];
  }, []);

  const onDragStart = (e: DragEvent, t: HldNodeType) => {
    e.dataTransfer.setData(DND_MIME, t);
    e.dataTransfer.effectAllowed = 'move';
  };

  if (compact) {
    return (
      <div className="flex gap-1 overflow-x-auto border-b border-line bg-surface-2 px-2 py-1.5 md:col-start-1" aria-label="Component palette" role="toolbar">
        {HLD_NODE_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            draggable
            onDragStart={(e) => onDragStart(e, t)}
            onClick={() => onAdd(t)}
            title={`${NODE_META[t].label} — ${NODE_META[t].description}`}
            aria-label={`Add ${NODE_META[t].label}: ${NODE_META[t].description}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-ink-2 hover:text-accent"
          >
            <NodeIcon type={t} size={16} />
          </button>
        ))}
      </div>
    );
  }

  return (
    <nav
      aria-label="Component palette"
      className="overflow-y-auto border-b border-line bg-surface-2 p-2 max-lg:flex max-lg:gap-1 max-lg:overflow-x-auto lg:border-b-0 lg:border-r"
    >
      <p className="mb-2 px-1 text-[11px] text-ink-3 max-lg:hidden">Drag onto the canvas, or click to add.</p>
      {groups.map(([group, types]) => (
        <div key={group} className="mb-2 max-lg:contents">
          <SectionTitle>
            <span className="px-1 max-lg:hidden">{group}</span>
          </SectionTitle>
          <ul className="space-y-0.5 max-lg:contents">
            {types.map((t) => (
              <li key={t} className="max-lg:contents">
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => onDragStart(e, t)}
                  onClick={() => onAdd(t)}
                  aria-label={`Add ${NODE_META[t].label}: ${NODE_META[t].description}`}
                  title={NODE_META[t].description}
                  className="flex w-full cursor-grab items-start gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface max-lg:w-auto max-lg:shrink-0 max-lg:border max-lg:border-line max-lg:bg-surface"
                >
                  <span className="mt-0.5 text-ink-2">
                    <NodeIcon type={t} size={16} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium text-ink max-lg:whitespace-nowrap">{NODE_META[t].label}</span>
                    <span className="block text-[11px] leading-snug text-ink-3 max-lg:hidden">{NODE_META[t].description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
