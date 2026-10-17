// Bookkeeping for the Test Explorer's per-file discovery (`mockymock
// collect`), kept free of 'vscode' so it can be unit-tested under mocha.
//
// Overlapping discoveries of one file -- activation still running when the
// user saves, or format-on-save followed by autosave -- can finish out of
// order. Each call takes a generation; only the newest generation for a key
// may touch the tree, or a slow older `collect` puts the file's old content
// back.
export class DiscoveryTracker {
  private readonly generations = new Map<string, number>();

  /** Starts a new generation for `key`, superseding any still in flight. */
  begin(key: string): number {
    const generation = (this.generations.get(key) ?? 0) + 1;
    this.generations.set(key, generation);
    return generation;
  }

  /** True while `generation` is still the newest one for `key`. */
  isCurrent(key: string, generation: number): boolean {
    return this.generations.get(key) === generation;
  }
}
