// src/boundaries/refreshGuard.ts
//
// Pure sequencing guard split out of boundariesTreeProvider.ts (which
// imports `vscode` and so cannot be exercised directly by mocha -- repo
// convention: pure logic lives outside vscode-importing files, see
// checks.ts vs environmentManager.ts). No `vscode` import here.
//
// Fixes the "persistence-key race": BoundariesTreeProvider.refresh(cblPath)
// sets its "which path are we pointed at" field synchronously, but the
// fetched model only lands after an `await`. A checkbox toggle landing in
// that window must never write to the NEW path's persisted-overrides key
// while mutating the OLD path's still-live model. RefreshGuard makes "which
// (cblPath, model) pair is live" an atomic, explicitly-committed fact:
// begin() is called synchronously when a refresh starts; commit() is called
// once its async work resolves, and only actually applies if no newer
// begin() happened in between. Consumers (setSeeded) read `.cblPath` /
// `.model`, which only ever reflect the last *committed* pair -- never a
// merely-requested one.
export class RefreshGuard<TModel> {
  private seq = 0;
  private _cblPath: string | undefined;
  private _model: TModel | undefined;

  get cblPath(): string | undefined {
    return this._cblPath;
  }

  get model(): TModel | undefined {
    return this._model;
  }

  // Call synchronously at the start of a refresh. The returned token is
  // opaque; pass it back to commit() once the refresh's async work resolves.
  begin(): number {
    this.seq += 1;
    return this.seq;
  }

  // Call once the async work for `token` resolves. Returns true and commits
  // (cblPath, model) as the new live pair iff `token` is still current (no
  // later begin() has happened since) -- otherwise this result is stale and
  // is dropped, leaving the previously committed pair untouched.
  commit(token: number, cblPath: string | undefined, model: TModel | undefined): boolean {
    if (token !== this.seq) {
      return false;
    }
    this._cblPath = cblPath;
    this._model = model;
    return true;
  }
}
