import assert from 'node:assert/strict';
import { sep } from 'node:path';
import { buildGenerateArgs, runGenerate, resolveOutPath, GenerateOptions } from './generateCut';
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

describe('runGenerate', () => {
  it('collects stderr warning lines on success', async () => {
    const r = await runGenerate(
      async () => ({ code: 0, stdout: '', stderr: 'mockymock generate: warning: boundary key mismatch -- ...\n' }),
      'mockymock',
      baseOpts
    );
    assert.equal(r.warnings.length, 1);
  });

  it('reports zero warnings when stderr has no warning lines', async () => {
    const r = await runGenerate(
      async () => ({ code: 0, stdout: '', stderr: 'mockymock generate: wrote P.cut\n' }),
      'mockymock',
      baseOpts
    );
    assert.deepEqual(r.warnings, []);
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
});
