// LLD Design Playground: a React Flow canvas of UML class cards with live analysis, Mermaid and C# output.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import { Background, ConnectionMode, Controls, MiniMap, ReactFlow, ReactFlowProvider, applyNodeChanges, useReactFlow } from '@xyflow/react';
import type { Connection, NodeChange, EdgeChange } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { readJson, writeJson } from '../../lib/storage';
import { analyzeModel, compareModels } from './analyze';
import type { LldFinding, LldSeverity } from './analyze';
import { ClassNodeCard, RelationGlyph, UmlEdge, UmlMarkerDefs } from './canvas';
import type { ClassFlowNode, UmlFlowEdge } from './canvas';
import { toCSharp, toMermaid, toStateDiagram } from './generate';
import { CLASS_KINDS, RELATION_KINDS, emptyModel, normalizeModel } from './model';
import type { ClassKind, ClassModel, ClassNode, Relation, RelationKind, StateTransition } from './model';
import MermaidView from './MermaidView';
import { useIsDark } from './useIsDark';
import { arrangeModel } from './layout';
import { useCanvasKeys, useCanvasPrefs, useFullscreen, useHistory } from '../canvasHooks';
import { CanvasToolbar, ShortcutsHelp } from '../CanvasToolbar';

export type { ClassModel, ClassNode, Relation } from './model';

export interface LldPlaygroundProps {
  initial?: ClassModel;
  /** Optional reference design: enables the "Compare" tab (differences, not a grade). */
  reference?: ClassModel;
  storageKey: string;
  title?: string;
  compact?: boolean;
}

type Selection = { type: 'class' | 'relation'; id: string } | null;
type Tab = 'inspect' | 'review' | 'compare' | 'mermaid' | 'csharp' | 'states' | 'notes';

const nodeTypes = { classNode: ClassNodeCard };
const edgeTypes = { uml: UmlEdge };

const RELATION_HELP: Record<RelationKind, string> = {
  inherits: 'Is-a: the source is a specialised kind of the target (hollow triangle).',
  implements: 'Fulfils a contract: the source provides the target interface (dashed, hollow triangle).',
  composition: 'Owns, with lifetime: the source creates and destroys its parts (filled diamond at the owner).',
  aggregation: 'Has, without lifetime: the source groups parts that can live on their own (hollow diamond at the owner).',
  association: 'Knows about: the source keeps a long-lived reference to the target (open arrow).',
  dependency: 'Uses briefly: the target appears as a parameter, local or return value (dashed, open arrow).',
};

const SEVERITY_STYLE: Record<LldSeverity, string> = {
  error: 'bg-bad-soft text-bad', warning: 'bg-warn-soft text-warn', tradeoff: 'bg-accent-soft text-accent', info: 'bg-surface-2 text-ink-2',
};

function loadModel(storageKey: string, initial?: ClassModel): ClassModel {
  const saved = readJson<unknown>(storageKey, null);
  if (saved) { try { return normalizeModel(saved); } catch { /* fall through to initial */ } }
  try { return initial ? normalizeModel(initial) : emptyModel(); } catch { return emptyModel(); }
}

/** Copied classes (with the relations between them), shared by every class designer on the page. */
let clipboard: { classes: ClassNode[]; relations: Relation[] } | null = null;
const newId = (p: string) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const btn = 'inline-flex items-center gap-1 rounded-md border border-line bg-surface px-2.5 py-1 text-xs font-medium text-ink hover:bg-surface-2 disabled:opacity-50';
const input = 'w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium text-ink-2';

export default function LldPlayground(props: LldPlaygroundProps) {
  return (
    <ReactFlowProvider>
      <LldPlaygroundInner {...props} />
    </ReactFlowProvider>
  );
}

function LldPlaygroundInner({ initial, reference, storageKey, title, compact = false }: LldPlaygroundProps) {
  const uid = useId().replace(/[^\w]/g, '');
  const markerPrefix = `uml${uid}`;
  const dark = useIsDark();
  const flow = useReactFlow();
  const wrapRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const pasteCount = useRef(0);
  /** Classes to show as selected when their canvas nodes are created (pasted / duplicated). */
  const pendingSelect = useRef(new Set<string>());
  const [help, setHelp] = useState(false);
  const [prefs, setPrefs] = useCanvasPrefs('lld', { snap: false, minimap: !compact });

  const [model, setModel] = useState<ClassModel>(() => loadModel(storageKey, initial));
  const [selection, setSelection] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab>('inspect');
  const [newKind, setNewKind] = useState<RelationKind>('association');
  const [message, setMessage] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // Auto-save (debounced).
  useEffect(() => {
    const t = setTimeout(() => writeJson(storageKey, model), 250);
    return () => clearTimeout(t);
  }, [model, storageKey]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(t);
  }, [message]);

  const findings = useMemo(() => analyzeModel(model), [model]);
  const worstByClass = useMemo(() => {
    const m = new Map<string, LldSeverity>();
    for (const f of findings) for (const id of f.classIds) if (!m.has(id) && (f.severity === 'error' || f.severity === 'warning')) m.set(id, f.severity);
    return m;
  }, [findings]);

  // Nodes live in state so React Flow keeps its measurements; they are re-synced from the model.
  const [nodes, setNodes] = useState<ClassFlowNode[]>(() => model.classes.map((c) => ({ id: c.id, type: 'classNode' as const, position: { x: c.x ?? 0, y: c.y ?? 0 }, data: { cls: c } })));
  useEffect(() => {
    setNodes((prev) => model.classes.map((c) => {
      const old = prev.find((n) => n.id === c.id);
      const data = { cls: c, worst: worstByClass.get(c.id) };
      const position = { x: c.x ?? 0, y: c.y ?? 0 };
      if (old) return { ...old, data, position };
      return { id: c.id, type: 'classNode' as const, position, data, selected: pendingSelect.current.has(c.id) };
    }));
  }, [model.classes, worstByClass]);

  const edges = useMemo<UmlFlowEdge[]>(() => model.relations.map((r) => ({
    id: r.id!, source: r.from, target: r.to, type: 'uml' as const,
    selected: selection?.type === 'relation' && selection.id === r.id,
    data: { kind: r.kind, label: r.label, multiplicity: r.multiplicity, markerPrefix },
  })), [model.relations, selection, markerPrefix]);

  const update = useCallback((fn: (m: ClassModel) => ClassModel) => setModel((m) => fn(m)), []);
  const updateClass = useCallback((id: string, patch: Partial<ClassNode>) =>
    update((m) => ({ ...m, classes: m.classes.map((c) => (c.id === id ? { ...c, ...patch } : c)) })), [update]);
  const updateRelation = useCallback((id: string, patch: Partial<Relation>) =>
    update((m) => ({ ...m, relations: m.relations.map((r) => (r.id === id ? { ...r, ...patch } : r)) })), [update]);

  const removeClasses = useCallback((ids: string[]) => {
    update((m) => ({ ...m, classes: m.classes.filter((c) => !ids.includes(c.id)), relations: m.relations.filter((r) => !ids.includes(r.from) && !ids.includes(r.to)) }));
    setSelection((s) => (s && ids.includes(s.id) ? null : s));
  }, [update]);
  const removeRelations = useCallback((ids: string[]) => {
    update((m) => ({ ...m, relations: m.relations.filter((r) => !ids.includes(r.id!)) }));
    setSelection((s) => (s?.type === 'relation' && ids.includes(s.id) ? null : s));
  }, [update]);

  const onNodesChange = useCallback((changes: NodeChange<ClassFlowNode>[]) => {
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) removeClasses(removed);
    setNodes((ns) => applyNodeChanges(changes.filter((c) => c.type !== 'remove'), ns));
  }, [removeClasses]);

  const onEdgesChange = useCallback((changes: EdgeChange<UmlFlowEdge>[]) => {
    const removed = changes.filter((c) => c.type === 'remove').map((c) => c.id);
    if (removed.length) removeRelations(removed);
  }, [removeRelations]);

  const onNodeDragStop = useCallback((_e: unknown, _n: ClassFlowNode, dragged: ClassFlowNode[]) => {
    const pos = new Map(dragged.map((n) => [n.id, n.position] as const));
    update((m) => ({ ...m, classes: m.classes.map((c) => { const p = pos.get(c.id); return p ? { ...c, x: Math.round(p.x), y: Math.round(p.y) } : c; }) }));
  }, [update]);

  const onConnect = useCallback((conn: Connection) => {
    if (!conn.source || !conn.target) return;
    const id = 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    update((m) => ({ ...m, relations: [...m.relations, { id, from: conn.source, to: conn.target, kind: newKind }] }));
    setSelection({ type: 'relation', id });
    setTab('inspect');
  }, [newKind, update]);

  const addClass = (kind: ClassKind) => {
    const base = { class: 'NewClass', interface: 'INewInterface', abstract: 'NewBase', record: 'NewRecord', enum: 'NewEnum' }[kind];
    const names = new Set(model.classes.map((c) => c.name));
    let name = base;
    for (let i = 2; names.has(name); i++) name = `${base}${i}`;
    const rect = wrapRef.current?.getBoundingClientRect();
    const offset = (model.classes.length % 6) * 24;
    const p = rect ? flow.screenToFlowPosition({ x: rect.left + rect.width / 2 - 112 + offset, y: rect.top + rect.height / 2 - 60 + offset }) : { x: 40 + offset, y: 40 + offset };
    const id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const cls: ClassNode = { id, name, kind, fields: kind === 'enum' ? ['ValueA', 'ValueB'] : [], methods: [], responsibility: '', x: Math.round(p.x), y: Math.round(p.y) };
    update((m) => ({ ...m, classes: [...m.classes, cls] }));
    setSelection({ type: 'class', id });
    setTab('inspect');
  };

  const reset = () => {
    if (typeof window !== 'undefined' && !window.confirm('Reset the design to its starting state? Your changes will be lost.')) return;
    setModel(initial ? normalizeModel(initial) : emptyModel());
    setSelection(null);
    setTimeout(() => flow.fitView({ padding: 0.2 }), 50);
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
    download(blob, `${slug(title ?? 'class-model')}.json`);
  };

  const importJson = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const next = normalizeModel(JSON.parse(await file.text()));
      setModel(next);
      setSelection(null);
      setMessage({ tone: 'ok', text: `Imported ${next.classes.length} classes and ${next.relations.length} relations.` });
      setTimeout(() => flow.fitView({ padding: 0.2 }), 50);
    } catch (err) {
      setMessage({ tone: 'bad', text: `Import failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  // ---------- undo / redo, full screen, clipboard ----------
  const serialized = useMemo(() => JSON.stringify(model), [model]);
  const restore = useCallback((s: string) => { setModel(JSON.parse(s) as ClassModel); setSelection(null); }, []);
  const history = useHistory(serialized, restore);
  const fs = useFullscreen(sectionRef);
  useEffect(() => {
    const t = setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 }), 150);
    return () => clearTimeout(t);
  }, [fs.isFullscreen, flow]);

  const selectedIds = () => {
    const ids = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
    if (selection?.type === 'class') ids.add(selection.id);
    return ids;
  };
  const selectedPart = () => {
    const ids = selectedIds();
    if (!ids.size) return null;
    return { classes: model.classes.filter((c) => ids.has(c.id)), relations: model.relations.filter((r) => ids.has(r.from) && ids.has(r.to)) };
  };
  const pastePart = (part: { classes: ClassNode[]; relations: Relation[] }, offset: number) => {
    const names = new Set(model.classes.map((c) => c.name));
    const idMap = new Map<string, string>();
    const classes = part.classes.map((c) => {
      let name = c.name;
      for (let i = 2; names.has(name); i++) name = `${c.name}${i}`;
      names.add(name);
      const id = newId('c');
      idMap.set(c.id, id);
      return { ...c, id, name, x: (c.x ?? 0) + offset, y: (c.y ?? 0) + offset };
    });
    const relations = part.relations.map((r) => ({ ...r, id: newId('r'), from: idMap.get(r.from)!, to: idMap.get(r.to)! }));
    update((m) => ({ ...m, classes: [...m.classes, ...classes], relations: [...m.relations, ...relations] }));
    pendingSelect.current = new Set(classes.map((c) => c.id));
    setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n)));
    setSelection(classes.length === 1 ? { type: 'class', id: classes[0].id } : null);
    setMessage({ tone: 'ok', text: `Pasted ${classes.length} type${classes.length === 1 ? '' : 's'}.` });
  };
  const copy = () => { const part = selectedPart(); if (part) { clipboard = part; pasteCount.current = 0; setMessage({ tone: 'ok', text: `Copied ${part.classes.length} type${part.classes.length === 1 ? '' : 's'}.` }); } };
  const paste = () => { if (clipboard) { pasteCount.current += 1; pastePart(clipboard, 40 * pasteCount.current); } };
  const duplicate = () => { const part = selectedPart(); if (part) pastePart(part, 40); };
  const removeSelected = () => {
    const ids = [...selectedIds()];
    if (ids.length) removeClasses(ids);
    if (selection?.type === 'relation') removeRelations([selection.id]);
  };
  const selectAll = () => { setNodes((ns) => ns.map((n) => ({ ...n, selected: true }))); setSelection(null); };
  const clearSelection = () => { setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))); setSelection(null); };
  const arrange = () => { update(arrangeModel); setTimeout(() => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 250 }), 50); };
  const fit = () => flow.fitView({ padding: 0.2, maxZoom: 1, duration: 200 });
  const hasSelection = !!selection || nodes.some((n) => n.selected);

  useCanvasKeys(sectionRef, {
    'mod+z': history.undo, 'mod+shift+z': history.redo, 'mod+y': history.redo,
    'mod+c': copy, 'mod+v': paste, 'mod+d': duplicate, 'mod+a': selectAll,
    l: arrange, g: () => setPrefs({ snap: !prefs.snap }), m: () => setPrefs({ minimap: !prefs.minimap }), '0': fit,
    f: fs.toggle, '?': () => setHelp((h) => !h),
    escape: () => { if (help) setHelp(false); else if (fs.overlay) fs.exit(); else clearSelection(); },
  });

  const selectedClass = selection?.type === 'class' ? model.classes.find((c) => c.id === selection.id) : undefined;
  const selectedRelation = selection?.type === 'relation' ? model.relations.find((r) => r.id === selection.id) : undefined;
  const definite = findings.filter((f) => f.severity === 'error' || f.severity === 'warning');
  const tradeoffs = findings.filter((f) => f.severity === 'tradeoff');
  const infos = findings.filter((f) => f.severity === 'info');

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'inspect', label: 'Inspector' },
    { id: 'review', label: 'Review', badge: definite.length || undefined },
    ...(reference ? [{ id: 'compare' as const, label: 'Compare' }] : []),
    { id: 'mermaid', label: 'Mermaid' },
    { id: 'csharp', label: 'C#' },
    { id: 'states', label: 'States' },
    { id: 'notes', label: 'Notes' },
  ];

  const focusClass = (id: string) => {
    setSelection({ type: 'class', id });
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    const c = model.classes.find((x) => x.id === id);
    if (c) flow.setCenter((c.x ?? 0) + 112, (c.y ?? 0) + 60, { zoom: flow.getZoom(), duration: 300 });
    setTab('inspect');
  };

  const height = fs.isFullscreen ? 'min-h-[300px] flex-1' : compact ? 'h-[440px]' : 'h-[640px]';

  return (
    <section ref={sectionRef} aria-label={title ?? 'LLD design playground'}
      className={`overflow-hidden border-line bg-surface text-ink ${fs.isFullscreen ? 'flex h-screen w-screen flex-col rounded-none border-0' : 'rounded-xl border'} ${fs.overlay ? 'fixed inset-0 z-[80]' : ''}`}>
      <UmlMarkerDefs prefix={markerPrefix} />
      <header className="flex flex-wrap items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        {title && <h3 className="mr-2 text-sm font-semibold">{title}</h3>}
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Add a type">
          {CLASS_KINDS.map((k) => (
            <button key={k} type="button" className={btn} onClick={() => addClass(k)}>+ {k === 'class' ? 'Class' : k[0].toUpperCase() + k.slice(1)}</button>
          ))}
        </div>
        <label className="ml-1 flex items-center gap-1.5 text-xs text-ink-2">
          New links:
          <select className="rounded-md border border-line bg-surface px-1.5 py-1 text-xs text-ink" value={newKind} onChange={(e) => setNewKind(e.target.value as RelationKind)}>
            {RELATION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          <button type="button" className={btn} onClick={() => fileRef.current?.click()}>Import</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={importJson} aria-label="Import class model JSON" />
          <button type="button" className={btn} onClick={exportJson}>Export</button>
          <button type="button" className={btn} onClick={reset}>Reset</button>
          <CanvasToolbar t={{
            undo: history.undo, redo: history.redo, canUndo: history.canUndo, canRedo: history.canRedo,
            duplicate, remove: removeSelected, hasSelection, arrange, fit,
            snap: prefs.snap, toggleSnap: () => setPrefs({ snap: !prefs.snap }),
            minimap: prefs.minimap, toggleMinimap: () => setPrefs({ minimap: !prefs.minimap }),
            fullscreen: fs.isFullscreen, toggleFullscreen: fs.toggle, toggleHelp: () => setHelp((h) => !h),
          }} />
        </div>
      </header>
      {message && (
        <div role="status" className={`px-3 py-1.5 text-xs ${message.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'}`}>{message.text}</div>
      )}
      <div className={`flex flex-col lg:flex-row ${fs.isFullscreen ? 'min-h-0 flex-1' : ''}`}>
        <div ref={wrapRef} className={`relative min-w-0 flex-1 bg-bg ${height}`}>
          <ReactFlow<ClassFlowNode, UmlFlowEdge>
            nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeDragStop={onNodeDragStop}
            onNodeClick={(_, n) => { setSelection({ type: 'class', id: n.id }); setTab((t) => (t === 'states' ? t : 'inspect')); }}
            onEdgeClick={(_, e) => { setSelection({ type: 'relation', id: e.id }); setTab('inspect'); }}
            onPaneClick={() => setSelection(null)}
            connectionMode={ConnectionMode.Loose} deleteKeyCode={['Delete', 'Backspace']} snapToGrid={prefs.snap} snapGrid={[20, 20]}
            colorMode={dark ? 'dark' : 'light'} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.2}
            proOptions={{ hideAttribution: true }}
            style={{ background: 'var(--color-bg)' }}>
            <Background gap={20} size={prefs.snap ? 1.6 : 1} color="var(--color-line)" />
            <Controls showInteractive={false} />
            {prefs.minimap && <MiniMap pannable zoomable maskColor="color-mix(in srgb, var(--color-bg) 70%, transparent)" nodeColor="var(--color-surface-2)" nodeStrokeColor="var(--color-line)" style={{ background: 'var(--color-surface)' }} />}
          </ReactFlow>
          {model.classes.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-3">
              Add a class or interface from the toolbar. Drag from the dot on a card's edge to another card to draw a relation.
            </div>
          )}
          {help && <ShortcutsHelp onClose={() => setHelp(false)} />}
        </div>

        <aside className={`flex w-full flex-col border-t border-line lg:w-[400px] lg:border-l lg:border-t-0 ${fs.isFullscreen ? 'max-lg:max-h-[40vh] lg:h-full' : compact ? 'lg:h-[440px]' : 'lg:h-[640px]'}`}>
          <div role="tablist" aria-label="Design panels" className="flex shrink-0 overflow-x-auto border-b border-line bg-surface-2">
            {tabs.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} id={`${uid}-tab-${t.id}`} aria-controls={`${uid}-panel`}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium ${tab === t.id ? 'border-accent text-accent' : 'border-transparent text-ink-2 hover:text-ink'}`}>
                {t.label}
                {t.badge ? <span className="rounded-full bg-warn-soft px-1.5 text-[10px] text-warn">{t.badge}</span> : null}
              </button>
            ))}
          </div>
          <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} className="min-h-0 flex-1 overflow-y-auto p-3 text-sm">
            {tab === 'inspect' && (
              selectedClass ? <ClassInspector key={selectedClass.id} cls={selectedClass} findings={findings.filter((f) => f.classIds.includes(selectedClass.id))}
                onChange={(p) => updateClass(selectedClass.id, p)} onDelete={() => removeClasses([selectedClass.id])} />
                : selectedRelation ? <RelationInspector key={selectedRelation.id} rel={selectedRelation} model={model} prefix={markerPrefix}
                  onChange={(p) => updateRelation(selectedRelation.id!, p)} onDelete={() => removeRelations([selectedRelation.id!])} />
                  : <EmptyInspector prefix={markerPrefix} counts={{ classes: model.classes.length, relations: model.relations.length }} />
            )}
            {tab === 'review' && <ReviewPanel definite={definite} tradeoffs={tradeoffs} infos={infos} model={model} onFocus={focusClass} />}
            {tab === 'compare' && reference && <ComparePanel mine={model} reference={reference} />}
            {tab === 'mermaid' && <MermaidPanel source={toMermaid(model)} />}
            {tab === 'csharp' && <CSharpPanel files={toCSharp(model)} />}
            {tab === 'states' && <StatesPanel cls={selectedClass} onChange={(p) => selectedClass && updateClass(selectedClass.id, p)} />}
            {tab === 'notes' && (
              <div>
                <label htmlFor={`${uid}-notes`} className={labelCls}>Design notes</label>
                <p className="mb-2 text-xs text-ink-3">Why you chose this structure, alternatives you rejected, open questions. Saved with the design.</p>
                <textarea id={`${uid}-notes`} className={`${input} min-h-[260px] font-mono text-xs`} value={model.notes ?? ''}
                  onChange={(e) => { const notes = e.target.value; update((m) => ({ ...m, notes })); }} />
              </div>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

// ---------- panels ----------

function EmptyInspector({ prefix, counts }: { prefix: string; counts: { classes: number; relations: number } }) {
  return (
    <div className="space-y-3 text-ink-2">
      <p>Select a class or a relation to edit it. {counts.classes} classes, {counts.relations} relations.</p>
      <div>
        <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-3">Relation legend</h4>
        <ul className="space-y-1.5">
          {RELATION_KINDS.map((k) => (
            <li key={k} className="flex items-start gap-2 text-xs"><RelationGlyph kind={k} prefix={prefix} /><span><b className="text-ink">{k}</b> — {RELATION_HELP[k]}</span></li>
          ))}
        </ul>
      </div>
      <p className="text-xs text-ink-3">Tip: press Delete or Backspace to remove the selected item. Positions, notes and edits save automatically.</p>
    </div>
  );
}

function LinesEditor({ label, value, onChange, placeholder, id }: { label: string; value: string[]; onChange: (v: string[]) => void; placeholder: string; id: string }) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label} <span className="font-normal text-ink-3">(one per line)</span></label>
      <textarea id={id} className={`${input} min-h-[84px] font-mono text-xs`} defaultValue={value.join('\n')} placeholder={placeholder} spellCheck={false}
        onChange={(e) => onChange(e.target.value.split('\n').map((s) => s.trimEnd()).filter((s) => s.trim()))} />
    </div>
  );
}

function ClassInspector({ cls, findings, onChange, onDelete }: { cls: ClassNode; findings: LldFinding[]; onChange: (p: Partial<ClassNode>) => void; onDelete: () => void }) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <div>
          <label htmlFor={`${id}-name`} className={labelCls}>Name</label>
          <input id={`${id}-name`} className={input} value={cls.name} onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div>
          <label htmlFor={`${id}-kind`} className={labelCls}>Kind</label>
          <select id={`${id}-kind`} className={input} value={cls.kind} onChange={(e) => onChange({ kind: e.target.value as ClassKind })}>
            {CLASS_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
      {cls.kind !== 'enum' && (
        <div>
          <label htmlFor={`${id}-gen`} className={labelCls}>Type parameters <span className="font-normal text-ink-3">(comma-separated, e.g. T, TKey)</span></label>
          <input id={`${id}-gen`} className={input} defaultValue={(cls.generics ?? []).join(', ')}
            onChange={(e) => { const g = e.target.value.split(',').map((s) => s.trim()).filter(Boolean); onChange({ generics: g.length ? g : undefined }); }} />
        </div>
      )}
      <div>
        <label htmlFor={`${id}-resp`} className={labelCls}>Responsibility</label>
        <textarea id={`${id}-resp`} className={`${input} min-h-[56px]`} value={cls.responsibility ?? ''} placeholder="One sentence: what does this class do, and for whom?"
          onChange={(e) => onChange({ responsibility: e.target.value })} />
      </div>
      <LinesEditor id={`${id}-fields`} label={cls.kind === 'enum' ? 'Values' : 'Fields / properties'} value={cls.fields} onChange={(fields) => onChange({ fields })}
        placeholder={cls.kind === 'enum' ? 'Small\nMedium\nLarge' : '-decimal _balance\n+string Name { get; private set; }'} />
      {cls.kind !== 'enum' && (
        <LinesEditor id={`${id}-methods`} label="Methods" value={cls.methods} onChange={(methods) => onChange({ methods })}
          placeholder={'+void Deposit(decimal amount)\n+decimal Balance()'} />
      )}
      <p className="text-xs text-ink-3">Visibility: <code>+</code> public, <code>-</code> private, <code>#</code> protected, <code>~</code> internal. End a method with <code>*</code> for abstract.</p>
      {findings.length > 0 && (
        <div>
          <h4 className={labelCls}>Review notes for this class</h4>
          <ul className="space-y-1.5">{findings.map((f) => <FindingItem key={f.id} f={f} />)}</ul>
        </div>
      )}
      <button type="button" className={`${btn} text-bad`} onClick={onDelete}>Delete {cls.kind}</button>
    </div>
  );
}

function RelationInspector({ rel, model, prefix, onChange, onDelete }: { rel: Relation; model: ClassModel; prefix: string; onChange: (p: Partial<Relation>) => void; onDelete: () => void }) {
  const id = useId();
  const name = (cid: string) => model.classes.find((c) => c.id === cid)?.name ?? cid;
  return (
    <div className="space-y-3">
      <p className="text-ink-2"><b className="text-ink">{name(rel.from)}</b> → <b className="text-ink">{name(rel.to)}</b></p>
      <fieldset>
        <legend className={labelCls}>Kind</legend>
        <div className="space-y-1">
          {RELATION_KINDS.map((k) => (
            <label key={k} className={`flex cursor-pointer items-start gap-2 rounded-md border px-2 py-1.5 text-xs ${rel.kind === k ? 'border-accent bg-accent-soft' : 'border-line hover:bg-surface-2'}`}>
              <input type="radio" name={`${id}-kind`} className="mt-0.5" checked={rel.kind === k} onChange={() => onChange({ kind: k })} />
              <RelationGlyph kind={k} prefix={prefix} />
              <span><b>{k}</b><span className="block text-ink-2">{RELATION_HELP[k]}</span></span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-label`} className={labelCls}>Label</label>
          <input id={`${id}-label`} className={input} value={rel.label ?? ''} placeholder="e.g. places" onChange={(e) => onChange({ label: e.target.value || undefined })} />
        </div>
        <div>
          <label htmlFor={`${id}-mult`} className={labelCls}>Multiplicity (target end)</label>
          <input id={`${id}-mult`} className={input} value={rel.multiplicity ?? ''} placeholder="e.g. 1..*" onChange={(e) => onChange({ multiplicity: e.target.value || undefined })} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={btn} onClick={() => onChange({ from: rel.to, to: rel.from })}>Swap direction</button>
        <button type="button" className={`${btn} text-bad`} onClick={onDelete}>Delete relation</button>
      </div>
    </div>
  );
}

function FindingItem({ f, onFocus, model }: { f: LldFinding; onFocus?: (id: string) => void; model?: ClassModel }) {
  return (
    <li className="rounded-md border border-line p-2">
      <div className="flex items-center gap-2">
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${SEVERITY_STYLE[f.severity]}`}>{f.severity}</span>
        <span className="text-xs font-semibold text-ink">{f.title}</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-2">{f.detail}</p>
      {onFocus && model && (
        <div className="mt-1 flex flex-wrap gap-1">
          {f.classIds.map((id) => (
            <button key={id} type="button" className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-accent hover:underline" onClick={() => onFocus(id)}>
              {model.classes.find((c) => c.id === id)?.name ?? id}
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
  return (
    <section className="mb-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-ink">{title}</h4>
      <p className="mb-2 text-xs text-ink-3">{hint}</p>
      {children}
    </section>
  );
}

function ReviewPanel({ definite, tradeoffs, infos, model, onFocus }: { definite: LldFinding[]; tradeoffs: LldFinding[]; infos: LldFinding[]; model: ClassModel; onFocus: (id: string) => void }) {
  if (!model.classes.length) return <p className="text-ink-3">Add some classes to get design feedback.</p>;
  const list = (fs: LldFinding[], empty: string) => fs.length
    ? <ul className="space-y-2">{fs.map((f) => <FindingItem key={f.id} f={f} onFocus={onFocus} model={model} />)}</ul>
    : <p className="rounded-md bg-ok-soft px-2 py-1.5 text-xs text-ok">{empty}</p>;
  return (
    <div>
      <Section title={`Definite issues (${definite.length})`} hint="Errors and warnings: these almost always cause real problems.">
        {list(definite, 'No definite issues found.')}
      </Section>
      <Section title={`Trade-offs to consider (${tradeoffs.length})`} hint="Not wrong — but worth a conscious decision. Each one explains when it is fine.">
        {list(tradeoffs, 'No trade-offs flagged.')}
      </Section>
      <Section title={`Suggestions (${infos.length})`} hint="Small things that make the design easier to read and maintain.">
        {list(infos, 'Nothing to suggest.')}
      </Section>
      <p className="text-[11px] text-ink-3">These checks are heuristics run on the diagram only; they cannot see your real code.</p>
    </div>
  );
}

function ComparePanel({ mine, reference }: { mine: ClassModel; reference: ClassModel }) {
  const c = useMemo(() => compareModels(mine, reference), [mine, reference]);
  const pill = (s: string, tone: string) => <span key={s} className={`mr-1 mb-1 inline-block rounded px-1.5 py-0.5 font-mono text-[11px] ${tone}`}>{s}</span>;
  const rel = (r: { from: string; to: string; kind: string }) => `${r.from} —${r.kind}→ ${r.to}`;
  const same = !c.missingClasses.length && !c.extraClasses.length && !c.kindDifferences.length && !c.missingRelations.length && !c.extraRelations.length && !c.relationKindDifferences.length;
  return (
    <div className="space-y-3">
      <p className="rounded-md bg-accent-soft px-2 py-1.5 text-xs text-ink-2">Differences between your design and one reference design. Many designs are valid — use these to question your choices, not as a score.</p>
      {same && <p className="rounded-md bg-ok-soft px-2 py-1.5 text-xs text-ok">Same classes and relations as the reference.</p>}
      <div><h4 className={labelCls}>In both ({c.matchedClasses.length})</h4>{c.matchedClasses.map((s) => pill(s, 'bg-surface-2 text-ink-2'))}</div>
      {c.missingClasses.length > 0 && <div><h4 className={labelCls}>Only in the reference</h4>{c.missingClasses.map((s) => pill(s, 'bg-warn-soft text-warn'))}</div>}
      {c.extraClasses.length > 0 && <div><h4 className={labelCls}>Only in yours</h4>{c.extraClasses.map((s) => pill(s, 'bg-accent-soft text-accent'))}</div>}
      {c.kindDifferences.length > 0 && (
        <div><h4 className={labelCls}>Modelled differently</h4>
          <ul className="space-y-0.5 text-xs text-ink-2">{c.kindDifferences.map((d) => <li key={d.name}><b>{d.name}</b>: yours is {d.mine}, reference is {d.reference}</li>)}</ul></div>
      )}
      {c.methodDifferences.length > 0 && (
        <div><h4 className={labelCls}>Method differences</h4>
          <ul className="space-y-1 text-xs text-ink-2">{c.methodDifferences.map((d) => (
            <li key={d.name}><b>{d.name}</b>{d.onlyInReference.length > 0 && <> — reference also has <code>{d.onlyInReference.join(', ')}</code></>}{d.onlyInMine.length > 0 && <> — yours also has <code>{d.onlyInMine.join(', ')}</code></>}</li>
          ))}</ul></div>
      )}
      {c.relationKindDifferences.length > 0 && (
        <div><h4 className={labelCls}>Same link, different kind</h4>
          <ul className="space-y-0.5 text-xs text-ink-2">{c.relationKindDifferences.map((d, i) => <li key={i}>{d.from} → {d.to}: yours <b>{d.mine}</b>, reference <b>{d.reference}</b></li>)}</ul></div>
      )}
      {c.missingRelations.length > 0 && <div><h4 className={labelCls}>Relations only in the reference</h4><ul className="space-y-0.5 font-mono text-[11px] text-ink-2">{c.missingRelations.map((r, i) => <li key={i}>{rel(r)}</li>)}</ul></div>}
      {c.extraRelations.length > 0 && <div><h4 className={labelCls}>Relations only in yours</h4><ul className="space-y-0.5 font-mono text-[11px] text-ink-2">{c.extraRelations.map((r, i) => <li key={i}>{rel(r)}</li>)}</ul></div>}
    </div>
  );
}

function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className={btn} onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard blocked */ }
    }}>{done ? 'Copied' : label}</button>
  );
}

function MermaidPanel({ source }: { source: string }) {
  return (
    <div className="space-y-3">
      <div className="rounded-md border border-line bg-surface p-2"><MermaidView source={source} label="Class diagram" /></div>
      <div>
        <div className="mb-1 flex items-center justify-between"><h4 className={labelCls}>Mermaid source</h4><CopyButton text={source} /></div>
        <pre className="max-h-64 overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[11px] text-ink">{source}</pre>
      </div>
    </div>
  );
}

function CSharpPanel({ files }: { files: { name: string; code: string }[] }) {
  const [active, setActive] = useState(0);
  if (!files.length) return <p className="text-ink-3">Add a class to generate C#.</p>;
  const f = files[Math.min(active, files.length - 1)];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Generated files">
        {files.map((x, i) => (
          <button key={x.name} type="button" aria-pressed={x === f} onClick={() => setActive(i)}
            className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${x === f ? 'bg-accent text-surface' : 'bg-surface-2 text-ink-2 hover:text-ink'}`}>{x.name}</button>
        ))}
      </div>
      <div className="flex gap-1">
        <CopyButton text={f.code} />
        <button type="button" className={btn} onClick={() => download(new Blob([f.code], { type: 'text/plain' }), f.name)}>Download</button>
        <CopyButton text={files.map((x) => `// ${x.name}\n${x.code}`).join('\n')} label="Copy all" />
      </div>
      <pre className="overflow-auto rounded-md bg-surface-2 p-2 font-mono text-[11px] leading-relaxed text-ink">{f.code}</pre>
      <p className="text-[11px] text-ink-3">Generated skeleton: method bodies throw NotImplementedException. Targets .NET with implicit usings.</p>
    </div>
  );
}

function StatesPanel({ cls, onChange }: { cls?: ClassNode; onChange: (p: Partial<ClassNode>) => void }) {
  const id = useId();
  if (!cls) return <p className="text-ink-3">Select a class on the canvas to describe its lifecycle as a state machine (e.g. an Order: Created → Paid → Shipped).</p>;
  const states = cls.states ?? [];
  const transitions = cls.transitions ?? [];
  const setStates = (s: string[]) => onChange({ states: s });
  const setTransitions = (t: StateTransition[]) => onChange({ transitions: t });
  const options = ['[*]', ...states.filter((s) => s.trim())];
  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-2">States of <b className="text-ink">{cls.name}</b>. The first state is the initial one; <code>[*]</code> is start/end.</p>
      <div>
        <h4 className={labelCls}>States</h4>
        <ul className="space-y-1">
          {states.map((s, i) => (
            <li key={i} className="flex gap-1">
              <input aria-label={`State ${i + 1}`} className={input} value={s} onChange={(e) => setStates(states.map((x, j) => (j === i ? e.target.value : x)))} />
              <button type="button" className={btn} aria-label={`Remove state ${s}`} onClick={() => {
                setStates(states.filter((_, j) => j !== i));
                setTransitions(transitions.filter((t) => t.from !== s && t.to !== s));
              }}>✕</button>
            </li>
          ))}
        </ul>
        <button type="button" className={`${btn} mt-1`} onClick={() => setStates([...states, `State${states.length + 1}`])}>+ State</button>
      </div>
      <div>
        <h4 className={labelCls}>Transitions</h4>
        <ul className="space-y-1">
          {transitions.map((t, i) => {
            const set = (p: Partial<StateTransition>) => setTransitions(transitions.map((x, j) => (j === i ? { ...x, ...p } : x)));
            return (
              <li key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-1">
                <select aria-label="From state" className={input} value={t.from} onChange={(e) => set({ from: e.target.value })}>{options.map((o) => <option key={o}>{o}</option>)}</select>
                <select aria-label="To state" className={input} value={t.to} onChange={(e) => set({ to: e.target.value })}>{options.map((o) => <option key={o}>{o}</option>)}</select>
                <input aria-label="Event" className={input} placeholder="event" value={t.event ?? ''} onChange={(e) => set({ event: e.target.value })} />
                <button type="button" className={btn} aria-label="Remove transition" onClick={() => setTransitions(transitions.filter((_, j) => j !== i))}>✕</button>
              </li>
            );
          })}
        </ul>
        <button type="button" className={`${btn} mt-1`} disabled={!states.length}
          onClick={() => setTransitions([...transitions, { from: states[0], to: states[1] ?? states[0], event: '' }])}>+ Transition</button>
      </div>
      {states.length > 0 && (
        <div id={`${id}-diagram`} className="rounded-md border border-line p-2">
          <MermaidView source={toStateDiagram(states, transitions)} label={`State diagram of ${cls.name}`} />
        </div>
      )}
    </div>
  );
}

// ---------- utils ----------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'design';
function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
