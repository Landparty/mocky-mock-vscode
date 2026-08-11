import * as assert from 'assert';
import { hasCobolTabOpen, isCobolPath, shouldClearOnEditorChange } from './viewRefreshPolicy';

describe('shouldClearOnEditorChange', () => {
  it('never clears when the new active editor is a .cbl/.cob (that path is handled by fetching)', () => {
    assert.strictEqual(shouldClearOnEditorChange(true, true), false);
    assert.strictEqual(shouldClearOnEditorChange(false, true), false);
  });

  it('pins the tree when a model is already committed and the new editor is not COBOL', () => {
    // e.g. the extension's own showTextDocument() on a freshly generated
    // .cut right after "Generate .cut" -- must not blank the tree.
    assert.strictEqual(shouldClearOnEditorChange(true, false), false);
  });

  it('clears to the welcome state when no model has ever been committed', () => {
    assert.strictEqual(shouldClearOnEditorChange(false, false), true);
  });

  it('clears to the welcome state after an errored refresh (which commits no model)', () => {
    // BoundariesTreeProvider.refresh()'s error path commits (undefined,
    // undefined) on modelGuard, so "hasModel" is false here too -- same
    // branch as "never loaded", by design.
    assert.strictEqual(shouldClearOnEditorChange(false, false), true);
  });
});

describe('isCobolPath', () => {
  it('accepts .cbl, .cob, and .cobol, case-insensitively', () => {
    assert.ok(isCobolPath('/repo/FOO.cbl'));
    assert.ok(isCobolPath('/repo/foo.COB'));
    assert.ok(isCobolPath('/repo/foo.Cobol'));
  });

  it('rejects everything else, including the paired .cut', () => {
    assert.strictEqual(isCobolPath('/repo/foo.cut'), false);
    assert.strictEqual(isCobolPath('/repo/README.md'), false);
  });
});

describe('hasCobolTabOpen', () => {
  it('is false with no open tabs', () => {
    assert.strictEqual(hasCobolTabOpen([]), false);
  });

  it('is false when open tabs are all non-COBOL', () => {
    assert.strictEqual(hasCobolTabOpen(['/repo/foo.cut', '/repo/README.md']), false);
  });

  it('is true when at least one open tab is COBOL, regardless of position', () => {
    assert.strictEqual(hasCobolTabOpen(['/repo/foo.cbl']), true);
    assert.strictEqual(hasCobolTabOpen(['/repo/README.md', '/repo/foo.cbl', '/repo/foo.cut']), true);
  });
});
