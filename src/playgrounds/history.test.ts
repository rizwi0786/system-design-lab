import { describe, expect, it } from 'vitest';
import { History } from './history';
import { comboOf } from './canvasHooks';

describe('History', () => {
  it('undoes and redoes in order, and a new commit clears redo', () => {
    const h = new History('a');
    h.commit('b'); h.commit('c');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBe('b');
    h.commit('x');
    expect(h.redo()).toBeNull();
    expect(h.past).toEqual(['a', 'b']);
  });

  it('ignores no-op commits and caps its size', () => {
    const h = new History('0', 3);
    expect(h.commit('0')).toBe(false);
    for (const s of ['1', '2', '3', '4']) h.commit(s);
    expect(h.past).toEqual(['1', '2', '3']);
  });
});

describe('comboOf', () => {
  const k = (key: string, o: Partial<KeyboardEventInit> = {}) => comboOf(new KeyboardEvent('keydown', { key, ...o }));
  it('normalises modifier combos', () => {
    expect(k('z', { ctrlKey: true })).toBe('mod+z');
    expect(k('Z', { metaKey: true, shiftKey: true })).toBe('mod+shift+z');
    expect(k('?', { shiftKey: true })).toBe('?');
    expect(k('Escape')).toBe('escape');
    expect(k('f')).toBe('f');
  });
});
