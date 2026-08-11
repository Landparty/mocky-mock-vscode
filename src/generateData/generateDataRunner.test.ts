import * as assert from 'assert';
// Imports the pure functions directly, not from ./generateData:
// generateData.ts (vscode-touching command registration, Task 3) imports
// 'vscode', which mocha cannot resolve outside a running Extension Host --
// same split as analysis/analysisRunner.ts vs analysis/analyzeCobol.ts.
import { buildGenerateDataArgs, runGenerateData } from './generateDataRunner';
import { CommandRunner } from '../environment/commandRunner';

describe('buildGenerateDataArgs', () => {
  it('builds the analyze gen-data invocation with a fixed row count', () => {
    const args = buildGenerateDataArgs('/p/CUSTOMER.cpy');
    assert.deepStrictEqual(args, ['analyze', 'gen-data', '/p/CUSTOMER.cpy', '--rows', '10']);
  });
});

describe('runGenerateData', () => {
  it('returns exit code and CSV stdout on success', async () => {
    const fakeRun: CommandRunner = async (cmd, args) => {
      assert.strictEqual(cmd, 'mockymock');
      assert.deepStrictEqual(args, ['analyze', 'gen-data', '/p/CUSTOMER.cpy', '--rows', '10']);
      return {
        code: 0,
        stdout: 'CUST-ID,CUST-NAME\n000001,ALICE\n',
        stderr: '',
      };
    };
    const result = await runGenerateData('mockymock', '/p/CUSTOMER.cpy', fakeRun);
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /CUST-ID,CUST-NAME/);
    assert.strictEqual(result.stderr, '');
  });

  it('surfaces stderr on nonzero exit', async () => {
    const fakeRun: CommandRunner = async () => ({
      code: 1,
      stdout: '',
      stderr: 'error: no level-01 record found\n',
    });
    const result = await runGenerateData('mockymock', '/p/EMPTY.cpy', fakeRun);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /no level-01 record found/);
  });
});
