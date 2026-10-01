export interface CursorState {
  /** Stable per-source identifier, e.g. "pointer" or "hand-0". */
  readonly id: string;
  /** Normalised device coordinates, -1..1 with +y up. */
  x: number;
  y: number;
  pressed: boolean;
  visible: boolean;
}

export interface CursorSource {
  readonly cursors: readonly CursorState[];
  dispose(): void;
}

/** Uses the visible cursors of the first source that has any (hands take priority over the mouse). */
export class CombinedCursor implements CursorSource {
  constructor(private readonly sources: () => (CursorSource | null)[]) {}

  get cursors(): CursorState[] {
    for (const source of this.sources()) {
      const visible = source?.cursors.filter((cursor) => cursor.visible) ?? [];
      if (visible.length > 0) return visible;
    }
    return [];
  }

  dispose() {}
}
