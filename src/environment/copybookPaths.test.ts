import * as assert from 'assert';
import { mergeCopybookPaths, resolveAgainstWorkspaceRoot } from './copybookPaths';

describe('mergeCopybookPaths', () => {
  it('puts primary (setting-derived) paths first, followed by secondary (zapp.yml-derived) paths', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/s/COPYBOOK'], ['/z/COPYBOOK']), ['/s/COPYBOOK', '/z/COPYBOOK']);
  });

  it('dedupes a path declared in both sources, keeping the primary one', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/shared/COPYBOOK'], ['/shared/COPYBOOK']), ['/shared/COPYBOOK']);
  });

  it('dedupes paths that differ only by a trailing separator', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/shared/COPYBOOK/'], ['/shared/COPYBOOK']), ['/shared/COPYBOOK/']);
  });

  it('dedupes case-differing paths on win32', () => {
    const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      assert.deepStrictEqual(mergeCopybookPaths(['C:\\ws\\COPYBOOK'], ['C:\\ws\\copybook']), ['C:\\ws\\COPYBOOK']);
    } finally {
      Object.defineProperty(process, 'platform', originalPlatform!);
    }
  });
});

describe('resolveAgainstWorkspaceRoot', () => {
  it('joins a relative path against the root', () => {
    assert.strictEqual(resolveAgainstWorkspaceRoot('COPYBOOK', '/ws'), require('path').join('/ws', 'COPYBOOK'));
  });

  it('passes an absolute path through unchanged', () => {
    const absolute = require('path').resolve('/somewhere/COPYBOOK');
    assert.strictEqual(resolveAgainstWorkspaceRoot(absolute, '/ws'), absolute);
  });
});
