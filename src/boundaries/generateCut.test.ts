import assert from 'node:assert/strict';
import { sep } from 'node:path';
import { buildGenerateArgs, runGenerate, resolveOutPath, pickErrorMessage, GenerateOptions } from './generateCut';
import { BundleError } from './bundleClient';

const baseOpts: GenerateOptions = {
  cblPath: 'P.cbl',
  outPath: 'P.cut',
  scenarios: 'happy',
  copybookPaths: [],
  placeholders: [],
};

describe('buildGenerateArgs', () => {
  it('assembles the full with-data invocation', () => {
    assert.deepEqual(
      buildGenerateArgs({
        cblPath: 'P.cbl',
        outPath: 'P.cut',
        scenarios: 'branches',
        seed: 7,
        copybookPaths: ['cpy'],
        placeholders: ['--placeholder', 'READ:F'],
      }),
      [
        'generate', 'P.cbl', '--with-data', '--scenarios', 'branches', '--seed', '7',
        '--copybook-path', 'cpy', '--placeholder', 'READ:F', '-o', 'P.cut',
      ]
    );
  });

  it('omits absent seed and copybook paths', () => {
    assert.deepEqual(
      buildGenerateArgs(baseOpts),
      ['generate', 'P.cbl', '--with-data', '--scenarios', 'happy', '-o', 'P.cut']
    );
  });

  it('dedupes --placeholder pairs sharing the same CATEGORY:KEY value', () => {
    // Simulates the same boundary recurring in two paragraphs -- the
    // checkbox link means both emit the same pair from placeholderArgs().
    assert.deepEqual(
      buildGenerateArgs({
        ...baseOpts,
        placeholders: ['--placeholder', 'READ:ORDER-FILE', '--placeholder', 'READ:ORDER-FILE', '--placeholder', 'WRITE:LOG-FILE'],
      }),
      [
        'generate', 'P.cbl', '--with-data', '--scenarios', 'happy',
        '--placeholder', 'READ:ORDER-FILE', '--placeholder', 'WRITE:LOG-FILE', '-o', 'P.cut',
      ]
    );
  });
});

describe('resolveOutPath', () => {
  it('pairs <stem>.cut next to the source', () => {
    // .replaceAll requires ES2021 lib (this repo targets ES2020 -- see
    // tsconfig.json); split/join is the ES2020-safe equivalent and checks
    // the exact same thing: a platform-native separator round-trips.
    assert.equal(
      resolveOutPath('C:/w/src/INVUPDT.cbl'.split('/').join(sep)),
      'C:/w/src/INVUPDT.cut'.split('/').join(sep)
    );
  });
});

describe('pickErrorMessage', () => {
  it('prefers a stdout refusal over a stderr line that is only a warning', () => {
    // The real interleaving: --placeholder-mismatch check runs before the
    // refusal gates, so a harmless stderr warning can precede the actual
    // stdout failure reason on the same failing run.
    assert.equal(
      pickErrorMessage(
        'mockymock generate: refused (UNRESOLVED_COPYBOOK): COPY MISSING not found',
        "mockymock generate: warning: --placeholder READ:F matched no fixture"
      ),
      'mockymock generate: refused (UNRESOLVED_COPYBOOK): COPY MISSING not found'
    );
  });

  it('keeps stderr authoritative when its first line is a real error, not a warning', () => {
    assert.equal(
      pickErrorMessage(
        'mockymock generate: refused (UNRESOLVED_COPYBOOK): COPY MISSING not found',
        "mockymock generate: --placeholder must be CATEGORY:KEY, got 'bogus'"
      ),
      "mockymock generate: --placeholder must be CATEGORY:KEY, got 'bogus'"
    );
  });

  it('prefers the stdout refusal over EVERY stderr line when all of them are warnings, not just the first', () => {
    // A program with two unmatched --placeholder pairs prints two warning
    // lines; checking only stderr's first line would still surface a
    // warning as the failure cause here.
    assert.equal(
      pickErrorMessage(
        'mockymock generate: refused (UNRESOLVED_COPYBOOK): COPY MISSING not found',
        [
          'mockymock generate: warning: --placeholder READ:F matched no fixture',
          'mockymock generate: warning: --placeholder WRITE:G matched no fixture',
        ].join('\n')
      ),
      'mockymock generate: refused (UNRESOLVED_COPYBOOK): COPY MISSING not found'
    );
  });

  it('recognizes a raw parse-error header on stdout too, not just "refused (" lines', () => {
    // cobolparser's own parse failure short-circuits before check_whole_program
    // ever runs, so it never gets the "refused (CODE): ..." formatting the
    // other gates use -- confirmed against mockymock's cli/main.py.
    assert.equal(
      pickErrorMessage(
        'mockymock generate: 2 parse error(s):\n  <ParseError: unexpected token>',
        'mockymock generate: warning: --placeholder READ:F matched no fixture'
      ),
      'mockymock generate: 2 parse error(s):'
    );
  });

  it('falls back to stdout when stderr is empty', () => {
    assert.equal(
      pickErrorMessage('mockymock generate: 2 parse error(s):', ''),
      'mockymock generate: 2 parse error(s):'
    );
  });

  it('falls back to a generic message when both streams are empty', () => {
    assert.equal(pickErrorMessage('', ''), 'mockymock generate failed');
  });
});

describe('runGenerate', () => {
  it('collects stderr warning lines on success', async () => {
    const r = await runGenerate(
      async () => ({ code: 0, stdout: '', stderr: 'mockymock generate: warning: boundary key mismatch -- ...\n' }),
      'mockymock',
      baseOpts
    );
    assert.equal(r.warnings.length, 1);
    assert.deepEqual(r.notes, []);
  });

  it('reports zero warnings when stderr has no warning lines', async () => {
    const r = await runGenerate(
      async () => ({ code: 0, stdout: '', stderr: 'mockymock generate: wrote P.cut\n' }),
      'mockymock',
      baseOpts
    );
    assert.deepEqual(r.warnings, []);
  });

  it('surfaces an unsupported-boundaries report from stdout as notes on success', async () => {
    const stdout = [
      'mockymock generate: wrote 3 test case(s) -> P.cut',
      'mockymock generate: 2 boundary point(s) detected that are not mockable (test cases reaching them will be refused):',
      "  - SORT in paragraph 'MAIN-PARA' (line 40)",
      "  - dynamic CALL in paragraph 'MAIN-PARA' (line 55) -- no resolvable target",
    ].join('\n') + '\n';
    const r = await runGenerate(async () => ({ code: 0, stdout, stderr: '' }), 'mockymock', baseOpts);
    assert.deepEqual(r.notes, [
      'mockymock generate: 2 boundary point(s) detected that are not mockable (test cases reaching them will be refused):',
      "- SORT in paragraph 'MAIN-PARA' (line 40)",
      "- dynamic CALL in paragraph 'MAIN-PARA' (line 55) -- no resolvable target",
    ]);
  });

  it('parses the drawn seed out of the stdout banner', async () => {
    // Confirmed shape from a real run without --seed:
    //   mockymock generate: data-driven from a fixture bundle (seed=958313668)
    // The CLI prints this whether or not --seed was passed explicitly.
    const stdout = [
      'mockymock generate: data-driven from a fixture bundle (seed=958313668)',
      'mockymock generate: wrote 3 test case(s) -> P.cut',
    ].join('\n') + '\n';
    const r = await runGenerate(async () => ({ code: 0, stdout, stderr: '' }), 'mockymock', baseOpts);
    assert.equal(r.seed, 958313668);
  });

  it('reports a null seed when stdout has no (seed=N) line', async () => {
    const r = await runGenerate(
      async () => ({ code: 0, stdout: 'mockymock generate: wrote P.cut\n', stderr: '' }),
      'mockymock',
      baseOpts
    );
    assert.equal(r.seed, null);
  });

  it('throws on non-zero exit', async () => {
    await assert.rejects(
      runGenerate(async () => ({ code: 1, stdout: '', stderr: 'boom' }), 'mockymock', baseOpts),
      /boom/
    );
  });

  it('throws a BundleError on non-zero exit', async () => {
    await assert.rejects(
      runGenerate(async () => ({ code: 1, stdout: '', stderr: 'boom' }), 'mockymock', baseOpts),
      (e: unknown) => e instanceof BundleError
    );
  });

  it('prefers a stdout refusal over a stderr warning when both are present, and keeps both in the detail', async () => {
    const stdout = 'mockymock generate: refused (UNRESOLVED_COPYBOOK): COPY MISSING not found';
    const stderr = 'mockymock generate: warning: --placeholder READ:F matched no fixture';
    const err = await runGenerate(async () => ({ code: 1, stdout, stderr }), 'mockymock', baseOpts).catch(
      (e: unknown) => e
    );
    assert.ok(err instanceof BundleError);
    assert.equal((err as BundleError).message, stdout);
    // Nothing from a failing run is discarded: both streams are still
    // present in the detail even though the warning didn't win the message.
    assert.match((err as BundleError).stderr ?? '', /refused \(UNRESOLVED_COPYBOOK\)/);
    assert.match((err as BundleError).stderr ?? '', /--placeholder READ:F matched no fixture/);
  });
});
