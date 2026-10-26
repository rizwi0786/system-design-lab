// Toolbar and shortcut sheet shared by the HLD and LLD canvases.
import { useEffect, useRef } from 'react';
import { Icon, cx, type IconName } from '../components/ui';
import { MOD } from './canvasHooks';

export function ToolButton({ icon, label, shortcut, onClick, disabled, pressed }: {
  icon: IconName; label: string; shortcut?: string; onClick: () => void; disabled?: boolean; pressed?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} aria-pressed={pressed}
      title={shortcut ? `${label} (${shortcut})` : label}
      className={cx('inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:pointer-events-none disabled:opacity-35',
        pressed ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

export const ToolDivider = () => <span className="mx-0.5 h-5 w-px bg-line" aria-hidden />;

export interface CanvasTools {
  undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
  duplicate: () => void; remove: () => void; hasSelection: boolean;
  arrange: () => void; fit: () => void;
  snap: boolean; toggleSnap: () => void;
  minimap: boolean; toggleMinimap: () => void;
  fullscreen: boolean; toggleFullscreen: () => void;
  toggleHelp: () => void;
}

export function CanvasToolbar({ t }: { t: CanvasTools }) {
  return (
    <div role="toolbar" aria-label="Canvas tools" className="flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5">
      <ToolButton icon="undo" label="Undo" shortcut={`${MOD}+Z`} onClick={t.undo} disabled={!t.canUndo} />
      <ToolButton icon="redo" label="Redo" shortcut={`${MOD}+Shift+Z`} onClick={t.redo} disabled={!t.canRedo} />
      <ToolDivider />
      <ToolButton icon="copy" label="Duplicate selection" shortcut={`${MOD}+D`} onClick={t.duplicate} disabled={!t.hasSelection} />
      <ToolButton icon="trash" label="Delete selection" shortcut="Del" onClick={t.remove} disabled={!t.hasSelection} />
      <ToolDivider />
      <ToolButton icon="wand" label="Auto-arrange" shortcut="L" onClick={t.arrange} />
      <ToolButton icon="grid" label="Snap to grid" shortcut="G" onClick={t.toggleSnap} pressed={t.snap} />
      <ToolButton icon="minimap" label="Mini-map" shortcut="M" onClick={t.toggleMinimap} pressed={t.minimap} />
      <ToolButton icon="fit" label="Fit view" shortcut="0" onClick={t.fit} />
      <ToolDivider />
      <ToolButton icon="keyboard" label="Keyboard shortcuts" shortcut="?" onClick={t.toggleHelp} />
      <ToolButton icon={t.fullscreen ? 'minimize' : 'maximize'} label={t.fullscreen ? 'Exit full screen' : 'Full screen'} shortcut={t.fullscreen ? 'Esc' : 'F'} onClick={t.toggleFullscreen} pressed={t.fullscreen} />
    </div>
  );
}

const SHORTCUTS: [string, string][] = [
  [`${MOD} Z`, 'Undo'], [`${MOD} Shift Z  ·  ${MOD} Y`, 'Redo'],
  [`${MOD} C  /  ${MOD} V`, 'Copy / paste selection'], [`${MOD} D`, 'Duplicate selection'], [`${MOD} A`, 'Select all'],
  ['Del  ·  Backspace', 'Delete selection'], ['Shift + drag', 'Box-select several items'], [`${MOD} + click`, 'Add to selection'],
  ['L', 'Auto-arrange'], ['G', 'Snap to grid'], ['M', 'Mini-map'], ['0', 'Fit view'], ['F', 'Full screen'], ['Esc', 'Clear selection / exit full screen'], ['?', 'This help'],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={e => e.stopPropagation()}
        onKeyDown={e => { if (e.key === 'Escape' || e.key === '?') { e.stopPropagation(); onClose(); } }}
        className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-lift)] outline-none animate-pop">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold text-ink"><Icon name="keyboard" className="h-4 w-4 text-accent" />Keyboard shortcuts</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label="Close">✕</button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          {SHORTCUTS.map(([k, v]) => (
            <div key={v} className="contents">
              <dt><kbd className="whitespace-nowrap rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink">{k}</kbd></dt>
              <dd className="text-ink-2">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-ink-3">Shortcuts work after you click the canvas, and not while typing in a field.</p>
      </div>
    </div>
  );
}
