import * as assert from 'assert';
import * as path from 'path';
import {
  parseCutFile,
  resolveCblPath,
  resolveCutPath,
  isExcludedCutPath,
  cutSuitesFromCollectJson,
} from './cutDiscovery';

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

  it('resolves a sibling .cob or .cobol when that is what exists on disk', () => {
    const cutPath = path.join('/repo', 'examples', 'invupdt', 'INVUPDT.cut');
    const cob = path.join('/repo', 'examples', 'invupdt', 'INVUPDT.cob');
    const cobol = path.join('/repo', 'examples', 'invupdt', 'INVUPDT.cobol');
    assert.strictEqual(resolveCblPath(cutPath, (p) => p === cob), cob);
    assert.strictEqual(resolveCblPath(cutPath, (p) => p === cobol), cobol);
  });

  it('prefers .cbl when more than one candidate exists, and defaults to .cbl when none does', () => {
    const cutPath = path.join('/repo', 'PROG.cut');
    const cbl = path.join('/repo', 'PROG.cbl');
    assert.strictEqual(resolveCblPath(cutPath, () => true), cbl);
    assert.strictEqual(resolveCblPath(cutPath, () => false), cbl);
  });
});

describe('resolveCutPath', () => {
  // Built with path.join (like the resolveCblPath test above) rather than a
  // literal '/p/PROG.cbl' string: resolveCutPath's own path.parse/path.join
  // round-trip normalizes to the platform separator, so a hardcoded
  // forward-slash expectation fails on win32 even though the swap is
  // correct (verified empirically on this machine: path.join('/p',
  // 'PROG.cut') -> '\p\PROG.cut').
  it('swaps a .cbl path for its sibling .cut', () => {
    const cblPath = path.join('/p', 'PROG.cbl');
    const expected = path.join('/p', 'PROG.cut');
    assert.strictEqual(resolveCutPath(cblPath), expected);
  });
});

describe('isExcludedCutPath', () => {
  it('excludes a path under a .claude/worktrees checkout', () => {
    assert.strictEqual(
      isExcludedCutPath('/repo/.claude/worktrees/some-branch/examples/invupdt/INVUPDT.cut'),
      true
    );
  });

  it('excludes a path under a top-level .worktrees checkout', () => {
    assert.strictEqual(isExcludedCutPath('/repo/.worktrees/some-branch/examples/invupdt/INVUPDT.cut'), true);
  });

  it('excludes a path under a plain worktrees/ directory', () => {
    assert.strictEqual(isExcludedCutPath('/repo/worktrees/some-branch/examples/invupdt/INVUPDT.cut'), true);
  });

  it('excludes a path under node_modules', () => {
    assert.strictEqual(isExcludedCutPath('/repo/node_modules/some-package/fixture.cut'), true);
  });

  it('does not exclude a real example path', () => {
    assert.strictEqual(isExcludedCutPath('/repo/examples/invupdt/INVUPDT.cut'), false);
  });

  it('does not exclude a path that merely contains "worktrees" as a substring, not a whole segment', () => {
    assert.strictEqual(isExcludedCutPath('/repo/my-worktrees-notes/INVUPDT.cut'), false);
  });

  it('works with Windows-style backslash separators', () => {
    assert.strictEqual(
      isExcludedCutPath('C:\\repo\\.claude\\worktrees\\some-branch\\examples\\invupdt\\INVUPDT.cut'),
      true
    );
  });
});

describe('parseCutFile TAGS', () => {
  it('parses tags on a TESTCASE line', () => {
    const text = ['TESTSUITE "s"', 'TESTCASE "a" TAGS "slow" "io"', 'TESTCASE "b"'].join('\n');
    const suites = parseCutFile(text);
    assert.deepStrictEqual(suites[0].cases[0].tags, ['slow', 'io']);
    assert.deepStrictEqual(suites[0].cases[1].tags, []);
  });
});

describe('parseCutFile USING PROVIDER', () => {
  // Mirrors examples/statelkup/STATELKUP.cut in the mocky-mock repo. The
  // expected names/lines are pinned to real `mockymock collect --json`
  // output for that file (names "base [row N: <first value>]", each case
  // anchored at its ROW line) — the fallback must agree with collect or
  // result mapping breaks: reports only ever contain expanded names.
  const statelkup = [
    'TESTSUITE "STATELKUP state name lookup"',
    '',
    '*> comment',
    '*> comment',
    '*> comment',
    'PROVIDER StateNames',
    '    HEADER Abbreviation, Name',
    '    ROW "AZ", "Arizona"',
    '    ROW "KY", "Kentucky"',
    '    ROW "XX", "*Undefined*"',
    '',
    'TESTCASE "1000-LOOKUP-STATE resolves a state name" USING PROVIDER StateNames',
    '    MOVE {Abbreviation} TO WS-STATE-CODE',
    '    PERFORM 1000-LOOKUP-STATE',
    '    EXPECT WS-STATE-NAME TO BE {Name}',
  ].join('\n');

  it('expands a provider-bound TESTCASE into one case per ROW, matching collect', () => {
    const suites = parseCutFile(statelkup);
    assert.strictEqual(suites.length, 1);
    assert.deepStrictEqual(
      suites[0].cases.map((c) => ({ name: c.name, line: c.line })),
      [
        { name: '1000-LOOKUP-STATE resolves a state name [row 1: AZ]', line: 7 },
        { name: '1000-LOOKUP-STATE resolves a state name [row 2: KY]', line: 8 },
        { name: '1000-LOOKUP-STATE resolves a state name [row 3: XX]', line: 9 },
      ]
    );
  });

  it('carries TAGS onto every expanded case', () => {
    const text = [
      'TESTSUITE "s"',
      'PROVIDER P',
      '    HEADER A',
      '    ROW "x"',
      '    ROW "y"',
      'TESTCASE "c" TAGS "slow" USING PROVIDER P',
    ].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites[0].cases.length, 2);
    assert.deepStrictEqual(suites[0].cases[0].tags, ['slow']);
    assert.deepStrictEqual(suites[0].cases[1].tags, ['slow']);
  });

  it('does not split the first ROW value at a comma inside quotes', () => {
    const text = [
      'TESTSUITE "s"',
      'PROVIDER P',
      '    HEADER A, B',
      '    ROW "SMITH, JR.", "X"',
      'TESTCASE "c" USING PROVIDER P',
    ].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites[0].cases[0].name, 'c [row 1: SMITH, JR.]');
  });

  it('strips one layer of single quotes from the display value', () => {
    const text = [
      'TESTSUITE "s"',
      'PROVIDER P',
      '    HEADER A',
      "    ROW 'AZ'",
      'TESTCASE "c" USING PROVIDER P',
    ].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites[0].cases[0].name, 'c [row 1: AZ]');
  });

  it('keeps an unquoted first value verbatim', () => {
    const text = [
      'TESTSUITE "s"',
      'PROVIDER P',
      '    HEADER A, B',
      '    ROW 42, 43',
      'TESTCASE "c" USING PROVIDER P',
    ].join('\n');
    const suites = parseCutFile(text);
    assert.strictEqual(suites[0].cases[0].name, 'c [row 1: 42]');
  });

  it('falls back to the unexpanded case when the PROVIDER was never declared', () => {
    const text = ['TESTSUITE "s"', 'TESTCASE "c" USING PROVIDER Ghost'].join('\n');
    const suites = parseCutFile(text);
    assert.deepStrictEqual(
      suites[0].cases.map((c) => c.name),
      ['c']
    );
  });

  it('falls back to the unexpanded case when the PROVIDER has no rows', () => {
    const text = [
      'TESTSUITE "s"',
      'PROVIDER Empty',
      '    HEADER A',
      'TESTCASE "c" USING PROVIDER Empty',
    ].join('\n');
    const suites = parseCutFile(text);
    assert.deepStrictEqual(
      suites[0].cases.map((c) => c.name),
      ['c']
    );
  });

  it('ignores commented-out ROW lines', () => {
    const text = [
      'TESTSUITE "s"',
      'PROVIDER P',
      '    HEADER A',
      '    ROW "real"',
      '*>  ROW "not real"',
      'TESTCASE "c" USING PROVIDER P',
    ].join('\n');
    const suites = parseCutFile(text);
    assert.deepStrictEqual(
      suites[0].cases.map((c) => c.name),
      ['c [row 1: real]']
    );
  });

  it('leaves ordinary TESTCASEs in the same file untouched', () => {
    const text = [
      'TESTSUITE "s"',
      'PROVIDER P',
      '    HEADER A',
      '    ROW "x"',
      'TESTCASE "plain"',
      'TESTCASE "param" USING PROVIDER P',
    ].join('\n');
    const suites = parseCutFile(text);
    assert.deepStrictEqual(
      suites[0].cases.map((c) => c.name),
      ['plain', 'param [row 1: x]']
    );
  });
});

describe('cutSuitesFromCollectJson', () => {
  it('converts collect output to CutSuite[] with 0-based lines', () => {
    const json = JSON.stringify({
      version: 1,
      cutFile: '/p/PROG.cut',
      suite: { name: 'demo', line: 1 },
      cases: [
        { name: 'first', line: 3, tags: ['fast'] },
        { name: 'second', line: 6, tags: [] },
      ],
    });
    const suites = cutSuitesFromCollectJson(json);
    assert.ok(suites);
    assert.strictEqual(suites.length, 1);
    assert.strictEqual(suites[0].name, 'demo');
    assert.strictEqual(suites[0].line, 0);
    assert.deepStrictEqual(suites[0].cases[0], { name: 'first', line: 2, tags: ['fast'] });
    assert.deepStrictEqual(suites[0].cases[1], { name: 'second', line: 5, tags: [] });
  });

  it('returns null for the collect error document and for junk', () => {
    assert.strictEqual(cutSuitesFromCollectJson(JSON.stringify({ version: 1, error: 'boom' })), null);
    assert.strictEqual(cutSuitesFromCollectJson('junk'), null);
  });
});
