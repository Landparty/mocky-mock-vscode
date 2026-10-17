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

describe('DiscoveryTracker.idle', () => {
  it('waits for running discoveries, including ones started while waiting', async () => {
    const tracker = new DiscoveryTracker();
    const events: string[] = [];
    let finishFirst!: () => void;
    let finishSecond!: () => void;
    void tracker.track(new Promise<void>((r) => (finishFirst = r)).then(() => events.push('first')));
    const idle = tracker.idle().then(() => events.push('idle'));
    await Promise.resolve();
    void tracker.track(new Promise<void>((r) => (finishSecond = r)).then(() => events.push('second')));
    finishFirst();
    await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual(events, ['first']);
    finishSecond();
    await idle;
    assert.deepStrictEqual(events, ['first', 'second', 'idle']);
  });

  it('resolves at once with nothing running, and after a failed discovery', async () => {
    const tracker = new DiscoveryTracker();
    await tracker.idle();
    void tracker.track(Promise.reject(new Error('collect failed'))).catch(() => undefined);
    await tracker.idle();
  });
});
