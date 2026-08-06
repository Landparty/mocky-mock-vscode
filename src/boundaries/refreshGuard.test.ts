import assert from 'node:assert/strict';
import { RefreshGuard } from './refreshGuard';

describe('RefreshGuard', () => {
  it('commits sequential refreshes in order', () => {
    const guard = new RefreshGuard<string>();

    const tokenA = guard.begin();
    assert.equal(guard.commit(tokenA, 'A.cbl', 'model-A'), true);
    assert.equal(guard.cblPath, 'A.cbl');
    assert.equal(guard.model, 'model-A');

    const tokenB = guard.begin();
    assert.equal(guard.commit(tokenB, 'B.cbl', 'model-B'), true);
    assert.equal(guard.cblPath, 'B.cbl');
    assert.equal(guard.model, 'model-B');
  });

  it('drops a stale commit when a newer refresh has already begun', () => {
    const guard = new RefreshGuard<string>();

    const tokenA = guard.begin();
    const tokenB = guard.begin(); // B starts before A's async work resolves
    assert.equal(guard.commit(tokenB, 'B.cbl', 'model-B'), true);

    // A's fetch resolves late; its commit must be rejected and must not
    // touch the (B.cbl, model-B) pair B already committed.
    assert.equal(guard.commit(tokenA, 'A.cbl', 'model-A'), false);
    assert.equal(guard.cblPath, 'B.cbl');
    assert.equal(guard.model, 'model-B');
  });

  it('reproduces the persistence-key race scenario: a toggle during an in-flight refresh must resolve against the still-live prior pair, not the requested one', () => {
    const guard = new RefreshGuard<string>();

    // A's refresh has already landed -- its model is live.
    const tokenA = guard.begin();
    guard.commit(tokenA, 'A.cbl', 'model-A');

    // A refresh for B is requested (begin() called synchronously) but its
    // async fetch has not resolved yet -- exactly the window where the old
    // provider code's `this.currentCblPath` had already flipped to B while
    // `this._model` was still A's.
    guard.begin();

    // A checkbox toggle happens right now. The persistence-key decision
    // must read the guard's still-committed pair -- A's -- never a path
    // that merely began a refresh.
    assert.equal(guard.cblPath, 'A.cbl');
    assert.equal(guard.model, 'model-A');
  });

  it('a no-op begin() with no matching commit leaves the previous pair untouched indefinitely', () => {
    const guard = new RefreshGuard<string>();
    const tokenA = guard.begin();
    guard.commit(tokenA, 'A.cbl', 'model-A');

    guard.begin(); // requested, never committed (e.g. refresh() threw before reaching commit)

    assert.equal(guard.cblPath, 'A.cbl');
    assert.equal(guard.model, 'model-A');
  });
});
