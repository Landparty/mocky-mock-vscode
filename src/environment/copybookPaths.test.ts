import * as assert from 'assert';
import { mergeCopybookPaths } from './copybookPaths';

describe('mergeCopybookPaths', () => {
  it('puts zapp.yml-derived paths first, followed by setting-derived paths', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/z/COPYBOOK'], ['/s/COPYBOOK']), ['/z/COPYBOOK', '/s/COPYBOOK']);
  });

  it('dedupes a path declared in both sources', () => {
    assert.deepStrictEqual(mergeCopybookPaths(['/shared/COPYBOOK'], ['/shared/COPYBOOK']), ['/shared/COPYBOOK']);
  });
});
