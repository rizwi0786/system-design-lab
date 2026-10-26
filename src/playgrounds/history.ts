// Snapshot-based undo/redo shared by the design canvases.
// A snapshot is the canvas's serialized design (JSON string), so history is cheap to compare
// and can never drift from what the canvas would save.

export class History {
  past: string[] = [];
  future: string[] = [];
  present: string;
  private readonly limit: number;
  constructor(present: string, limit = 100) {
    this.present = present;
    this.limit = limit;
  }

  /** Record a new state. Returns false when nothing changed. */
  commit(next: string): boolean {
    if (next === this.present) return false;
    this.past.push(this.present);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
    this.present = next;
    return true;
  }

  undo(): string | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(this.present);
    this.present = prev;
    return prev;
  }

  redo(): string | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(this.present);
    this.present = next;
    return next;
  }
}
