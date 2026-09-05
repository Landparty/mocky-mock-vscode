import * as assert from 'assert';
import { isCobolPath } from './cobolPaths';

describe('isCobolPath', () => {
  it('accepts the three COBOL program extensions', () => {
    assert.strictEqual(isCobolPath('/w/PROG.cbl'), true);
    assert.strictEqual(isCobolPath('/w/PROG.cob'), true);
    assert.strictEqual(isCobolPath('/w/PROG.cobol'), true);
  });

  it('is case-insensitive, as Windows and mainframe-sourced filenames require', () => {
    assert.strictEqual(isCobolPath('/w/PROG.CBL'), true);
    assert.strictEqual(isCobolPath('/w/PROG.CoBoL'), true);
  });

  it('rejects copybooks, test suites, and unrelated files', () => {
    assert.strictEqual(isCobolPath('/w/PROG.cpy'), false);
    assert.strictEqual(isCobolPath('/w/PROG.cut'), false);
    assert.strictEqual(isCobolPath('/w/README.md'), false);
    assert.strictEqual(isCobolPath('/w/cbl'), false);
  });
});
