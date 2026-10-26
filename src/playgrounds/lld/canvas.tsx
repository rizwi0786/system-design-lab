// React Flow building blocks: the class card node, a floating UML edge, and the SVG marker definitions.
import { BaseEdge, EdgeLabelRenderer, Handle, Position, useInternalNode } from '@xyflow/react';
import type { Edge, EdgeProps, InternalNode, Node, NodeProps } from '@xyflow/react';
import type { ClassNode, RelationKind } from './model';
import type { LldSeverity } from './analyze';

export type ClassNodeData = { cls: ClassNode; worst?: LldSeverity };
export type ClassFlowNode = Node<ClassNodeData, 'classNode'>;
export type UmlEdgeData = { kind: RelationKind; label?: string; multiplicity?: string; markerPrefix: string };
export type UmlFlowEdge = Edge<UmlEdgeData, 'uml'>;

const STEREOTYPE: Partial<Record<ClassNode['kind'], string>> = { interface: '«interface»', abstract: '«abstract»', record: '«record»', enum: '«enumeration»' };

const handleCls = '!h-2.5 !w-2.5 !border-2 !border-surface !bg-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100';

function MemberList({ items, empty }: { items: string[]; empty: string }) {
  const list = items.filter((s) => s.trim());
  return (
    <ul className="space-y-0.5 border-t border-line px-2.5 py-1.5 font-mono text-[11px] leading-snug text-ink-2">
      {list.length ? list.map((m, i) => <li key={i} className="truncate" title={m}>{m}</li>) : <li className="italic text-ink-3">{empty}</li>}
    </ul>
  );
}

export function ClassNodeCard({ data, selected }: NodeProps<ClassFlowNode>) {
  const c = data.cls;
  const stereo = STEREOTYPE[c.kind];
  const badge = data.worst === 'error' ? 'bg-bad' : data.worst === 'warning' ? 'bg-warn' : null;
  return (
    <div className={`group relative w-56 rounded-lg border bg-surface text-ink shadow-sm transition-shadow ${selected ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:shadow-md'}`}>
      {(['Top', 'Right', 'Bottom', 'Left'] as const).map((p) => (
        <Handle key={p} id={p.toLowerCase()} type="source" position={Position[p]} className={handleCls} />
      ))}
      <div className={`rounded-t-lg px-2.5 py-1.5 text-center ${c.kind === 'interface' ? 'bg-accent-soft' : 'bg-surface-2'}`}>
        {stereo && <div className="text-[10px] uppercase tracking-wide text-ink-3">{stereo}</div>}
        <div className={`truncate text-sm font-semibold ${c.kind === 'abstract' ? 'italic' : ''}`} title={c.name}>{c.name}</div>
        {badge && <span className={`absolute right-2 top-2 h-2 w-2 rounded-full ${badge}`} aria-label={`has ${data.worst}`} />}
      </div>
      <MemberList items={c.fields} empty={c.kind === 'enum' ? 'no values' : 'no fields'} />
      {c.kind !== 'enum' && <MemberList items={c.methods} empty="no methods" />}
    </div>
  );
}

// ---------- floating edge geometry ----------

function center(n: InternalNode) {
  const w = n.measured.width ?? 224;
  const h = n.measured.height ?? 120;
  return { x: n.internals.positionAbsolute.x + w / 2, y: n.internals.positionAbsolute.y + h / 2, w, h };
}

/** Point where the line from a's centre towards b's centre leaves a's rectangle. */
function borderPoint(a: InternalNode, b: InternalNode) {
  const ca = center(a);
  const cb = center(b);
  const dx = cb.x - ca.x;
  const dy = cb.y - ca.y;
  if (dx === 0 && dy === 0) return { x: ca.x, y: ca.y };
  const sx = dx === 0 ? Infinity : ca.w / 2 / Math.abs(dx);
  const sy = dy === 0 ? Infinity : ca.h / 2 / Math.abs(dy);
  const s = Math.min(sx, sy);
  return { x: ca.x + dx * s, y: ca.y + dy * s };
}

const DASHED: RelationKind[] = ['implements', 'dependency'];
const END_MARKER: Partial<Record<RelationKind, string>> = { inherits: 'triangle', implements: 'triangle', association: 'arrow', dependency: 'arrow' };
const START_MARKER: Partial<Record<RelationKind, string>> = { composition: 'diamond-filled', aggregation: 'diamond-hollow' };

export function UmlEdge({ id, source, target, data, selected }: EdgeProps<UmlFlowEdge>) {
  const s = useInternalNode(source);
  const t = useInternalNode(target);
  if (!s || !t || !data) return null;
  const color = selected ? 'var(--color-accent)' : 'var(--color-ink-2)';
  let path: string;
  let p1: { x: number; y: number };
  let p2: { x: number; y: number };
  if (source === target) {
    const c = center(s);
    p1 = { x: c.x + c.w / 2, y: c.y - 20 };
    p2 = { x: c.x + c.w / 2 - 30, y: c.y - c.h / 2 };
    path = `M ${p1.x} ${p1.y} C ${p1.x + 60} ${p1.y - 10}, ${p2.x + 10} ${p2.y - 60}, ${p2.x} ${p2.y}`;
  } else {
    p1 = borderPoint(s, t);
    p2 = borderPoint(t, s);
    path = `M ${p1.x} ${p1.y} L ${p2.x} ${p2.y}`;
  }
  const end = END_MARKER[data.kind];
  const start = START_MARKER[data.kind];
  const sel = selected ? '-sel' : '';
  const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const near = { x: p1.x + (p2.x - p1.x) * 0.82, y: p1.y + (p2.y - p1.y) * 0.82 };
  return (
    <>
      <BaseEdge id={id} path={path} interactionWidth={18}
        markerEnd={end ? `url(#${data.markerPrefix}-${end}${sel})` : undefined}
        markerStart={start ? `url(#${data.markerPrefix}-${start}${sel})` : undefined}
        style={{ stroke: color, strokeWidth: selected ? 2 : 1.5, strokeDasharray: DASHED.includes(data.kind) ? '6 4' : undefined }} />
      <EdgeLabelRenderer>
        {data.label && (
          <div className="nodrag nopan pointer-events-none absolute rounded bg-surface px-1 text-[11px] text-ink-2"
            style={{ transform: `translate(-50%, -50%) translate(${mid.x}px, ${mid.y}px)` }}>{data.label}</div>
        )}
        {data.multiplicity && (
          <div className="nodrag nopan pointer-events-none absolute font-mono text-[11px] text-ink-3"
            style={{ transform: `translate(-50%, -130%) translate(${near.x}px, ${near.y}px)` }}>{data.multiplicity}</div>
        )}
      </EdgeLabelRenderer>
    </>
  );
}

/** UML marker definitions. Ids are `${prefix}-${name}` and `${prefix}-${name}-sel` (accent colour). */
export function UmlMarkerDefs({ prefix }: { prefix: string }) {
  const variants: [string, string][] = [['', 'var(--color-ink-2)'], ['-sel', 'var(--color-accent)']];
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        {variants.map(([suffix, stroke]) => (
          <g key={suffix}>
            <marker id={`${prefix}-triangle${suffix}`} viewBox="0 0 16 14" refX="15" refY="7" markerWidth="16" markerHeight="14" markerUnits="userSpaceOnUse" orient="auto" overflow="visible">
              <path d="M1,1 L15,7 L1,13 Z" fill="var(--color-surface)" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
            </marker>
            <marker id={`${prefix}-arrow${suffix}`} viewBox="0 0 14 12" refX="13" refY="6" markerWidth="14" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto" overflow="visible">
              <path d="M1,1 L13,6 L1,11" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
            <marker id={`${prefix}-diamond-filled${suffix}`} viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto" overflow="visible">
              <path d="M1,6 L9,1 L17,6 L9,11 Z" fill={stroke} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
            </marker>
            <marker id={`${prefix}-diamond-hollow${suffix}`} viewBox="0 0 18 12" refX="1" refY="6" markerWidth="18" markerHeight="12" markerUnits="userSpaceOnUse" orient="auto" overflow="visible">
              <path d="M1,6 L9,1 L17,6 L9,11 Z" fill="var(--color-surface)" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
            </marker>
          </g>
        ))}
      </defs>
    </svg>
  );
}

/** Small inline legend sample of a relation line (used in the relation picker). */
export function RelationGlyph({ kind, prefix }: { kind: RelationKind; prefix: string }) {
  const end = END_MARKER[kind];
  const start = START_MARKER[kind];
  return (
    <svg width="56" height="14" aria-hidden="true" className="shrink-0">
      <path d="M 4 7 L 50 7" stroke="var(--color-ink-2)" strokeWidth="1.5" strokeDasharray={DASHED.includes(kind) ? '5 3' : undefined}
        markerEnd={end ? `url(#${prefix}-${end})` : undefined} markerStart={start ? `url(#${prefix}-${start})` : undefined} />
    </svg>
  );
}
