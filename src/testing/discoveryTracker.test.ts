import * as assert from 'assert';
import { DiscoveryTracker } from './discoveryTracker';

describe('DiscoveryTracker', () => {
  it('lets only the newest of two overlapping discoveries of a file win', () => {
    const tracker = new DiscoveryTracker();
    const slowOld = tracker.begin('file:///PROG.cut');
    const fastNew = tracker.begin('file:///PROG.cut');
    // The fast one finishes first and may build; the slow old one, finishing
    // later, must not put the old content back.
    assert.strictEqual(tracker.isCurrent('file:///PROG.cut', fastNew), true);
    assert.strictEqual(tracker.isCurrent('file:///PROG.cut', slowOld), false);
  });

  it('keeps generations of different files apart', () => {
    const tracker = new DiscoveryTracker();
    const a = tracker.begin('file:///A.cut');
    tracker.begin('file:///B.cut');
    assert.strictEqual(tracker.isCurrent('file:///A.cut', a), true);
  });
});
