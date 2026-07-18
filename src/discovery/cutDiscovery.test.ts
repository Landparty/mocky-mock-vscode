import * as assert from 'assert';
import * as path from 'path';
import { parseCutFile, resolveCblPath } from './cutDiscovery';

describe('parseCutFile', () => {
  it('parses a single suite with multiple cases', () => {
    const text = [
      'TESTSUITE "INVUPDT all boundary categories"',
      '',
      'TESTCASE "totals two records then updates and notifies"',
      '    MOCK OPEN INV-FILE',
      '    END-MOCK',
      'TESTCASE "handles empty file"',
      '    MOCK OPEN INV-FILE',
      '    END-MOCK',
    ].join('\n');

    const suites = parseCutFile(text);

    assert.strictEqual(suites.length, 1);
    assert.strictEqual(suites[0].name, 'INVUPDT all boundary categories');
    assert.strictEqual(suites[0].line, 0);
    assert.strictEqual(suites[0].cases.length, 2);
    assert.strictEqual(suites[0].cases[0].name, 'totals two records then updates and notifies');
    assert.strictEqual(suites[0].cases[0].line, 2);
    assert.strictEqual(suites[0].cases[1].name, 'handles empty file');
    assert.strictEqual(suites[0].cases[1].line, 5);
  });

  it('ignores commented-out lines', () => {
    const text = ['TESTSUITE "s"', '*> TESTCASE "not real"', 'TESTCASE "real"'].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites[0].cases.length, 1);
    assert.strictEqual(suites[0].cases[0].name, 'real');
  });

  it('starts a new suite on a second TESTSUITE line', () => {
    const text = ['TESTSUITE "a"', 'TESTCASE "1"', 'TESTSUITE "b"', 'TESTCASE "2"'].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites.length, 2);
    assert.strictEqual(suites[0].cases.length, 1);
    assert.strictEqual(suites[1].cases.length, 1);
  });

  it('returns no suites for text with no TESTSUITE line', () => {
    const suites = parseCutFile('*> just a comment\n');
    assert.strictEqual(suites.length, 0);
  });
});

describe('resolveCblPath', () => {
  it('swaps the .cut extension for .cbl in the same directory', () => {
    const cutPath = path.join('/repo', 'examples', 'invupdt', 'INVUPDT.cut');
    const expected = path.join('/repo', 'examples', 'invupdt', 'INVUPDT.cbl');
    assert.strictEqual(resolveCblPath(cutPath), expected);
  });
});
