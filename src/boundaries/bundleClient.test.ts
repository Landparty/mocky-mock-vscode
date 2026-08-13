import assert from 'node:assert/strict';
import { buildFixturesArgs, fetchBundle, BundleError } from './bundleClient';
import type { CommandResult } from '../environment/commandRunner';

const okBundle = JSON.stringify({
  bundle_version: 1, program_name: 'WDTEST', seed: 7,
  scenarios: [{ name: 'happy path', intent: 'x', entry: 'MAIN-PARA', fixtures: [] }],
  unresolved: [],
});
const runnerReturning = (r: CommandResult) => async () => r;

describe('buildFixturesArgs', () => {
  it('assembles flags in a stable order', () => {
    assert.deepEqual(
      buildFixturesArgs('C:/w/PROG.cbl', { scenarios: 'all', copybookPaths: ['cpy1', 'cpy2'], seed: 7 }),
      ['fixtures', 'C:/w/PROG.cbl', '--scenarios', 'all', '--seed', '7',
       '--copybook-path', 'cpy1', '--copybook-path', 'cpy2']);
  });
  it('omits absent seed and copybook paths', () => {
    assert.deepEqual(buildFixturesArgs('P.cbl', { scenarios: 'happy', copybookPaths: [] }),
      ['fixtures', 'P.cbl', '--scenarios', 'happy']);
  });
});

describe('fetchBundle', () => {
  it('parses a v1 bundle', async () => {
    const bundle = await fetchBundle(runnerReturning({ code: 0, stdout: okBundle, stderr: '' }),
      'mockymock', 'P.cbl', { scenarios: 'happy', copybookPaths: [] });
    assert.equal(bundle.program_name, 'WDTEST');
  });
  it('rejects non-zero exit with first stderr line', async () => {
    await assert.rejects(
      fetchBundle(runnerReturning({ code: 1, stdout: '', stderr: 'mockymock fixtures: 2 parse error(s)\ndetail' }),
        'mockymock', 'P.cbl', { scenarios: 'happy', copybookPaths: [] }),
      (e: BundleError) => e.message.includes('2 parse error(s)'));
  });
  it('rejects malformed JSON', async () => {
    await assert.rejects(
      fetchBundle(runnerReturning({ code: 0, stdout: 'not json', stderr: '' }),
        'mockymock', 'P.cbl', { scenarios: 'happy', copybookPaths: [] }),
      /not valid JSON/);
  });
  it('fails closed on bundle_version !== 1', async () => {
    // JSON.stringify emits no space after the colon (e.g. `"bundle_version":1`),
    // unlike the pretty-printed form -- match that here or the replace is a no-op.
    const v2 = okBundle.replace('"bundle_version":1', '"bundle_version":2');
    await assert.rejects(
      fetchBundle(runnerReturning({ code: 0, stdout: v2, stderr: '' }),
        'mockymock', 'P.cbl', { scenarios: 'happy', copybookPaths: [] }),
      /bundle_version 2 is not supported/);
  });
  it('fails closed on a v1 document missing the arrays buildViewModel iterates', async () => {
    // Right version, wrong shape: without the check this surfaced later as a
    // raw "bundle.scenarios is not iterable" TypeError in the tree's error node.
    const noScenarios = JSON.stringify({ bundle_version: 1, program_name: 'X', seed: 1, unresolved: [] });
    await assert.rejects(
      fetchBundle(runnerReturning({ code: 0, stdout: noScenarios, stderr: '' }),
        'mockymock', 'P.cbl', { scenarios: 'happy', copybookPaths: [] }),
      /missing scenarios\/fixtures\/unresolved/);
    const badFixtures = JSON.stringify({
      bundle_version: 1, program_name: 'X', seed: 1,
      scenarios: [{ name: 's', intent: 'x', entry: null }], unresolved: [],
    });
    await assert.rejects(
      fetchBundle(runnerReturning({ code: 0, stdout: badFixtures, stderr: '' }),
        'mockymock', 'P.cbl', { scenarios: 'happy', copybookPaths: [] }),
      /missing scenarios\/fixtures\/unresolved/);
  });
});
