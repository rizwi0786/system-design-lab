import { createContext, memo, useContext } from 'react';
import { Handle, Position, type Node, type NodeProps } from '@xyflow/react';
import { NodeIcon } from './icons';
import { NODE_META, type HldNodeType, type HldPropValue } from './types';

export type HldNodeData = { type: HldNodeType; label: string; props: Record<string, HldPropValue> };
export type HldFlowNode = Node<HldNodeData, 'hld'>;

/** Node ids highlighted by the selected finding (kept out of node data so it never gets saved). */
export const HighlightContext = createContext<ReadonlySet<string>>(new Set());

function badges(d: HldNodeData): string[] {
  const out: string[] = [];
  const p = d.props;
  if (typeof p.instances === 'number') out.push(`×${p.instances}`);
  if (typeof p.replicas === 'number') out.push(`${p.replicas} repl.`);
  if (p.multiAz === true) out.push('multi-AZ');
  if (typeof p.rps === 'number') out.push(`${p.rps} rps`);
  if (typeof p.ttlSeconds === 'number') out.push(`TTL ${p.ttlSeconds}s`);
  if (typeof p.region === 'string' && p.region) out.push(p.region);
  return out;
}

function HldNodeViewImpl({ id, data, selected }: NodeProps<HldFlowNode>) {
  const highlighted = useContext(HighlightContext).has(id);
  const meta = NODE_META[data.type];
  const ring = selected
    ? 'border-accent ring-2 ring-accent/40'
    : highlighted
      ? 'border-warn ring-2 ring-warn/50'
      : 'border-line';
  return (
    <div
      className={`min-w-[150px] max-w-[200px] rounded-lg border bg-surface px-3 py-2 text-left shadow-sm ${ring}`}
      aria-label={`${meta.label}: ${data.label}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-line !bg-surface-2" />
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent">
          <NodeIcon type={data.type} size={16} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium leading-tight text-ink">{data.label || meta.label}</div>
          <div className="truncate text-[11px] leading-tight text-ink-3">{meta.label}</div>
        </div>
      </div>
      {badges(data).length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {badges(data).map((b) => (
            <span key={b} className="rounded bg-surface-2 px-1.5 py-px text-[10px] text-ink-2">
              {b}
            </span>
          ))}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-line !bg-accent" />
    </div>
  );
}

export const HldNodeView = memo(HldNodeViewImpl);
