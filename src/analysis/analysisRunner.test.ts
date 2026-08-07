import * as assert from 'assert';
// Imports the pure functions directly, not from ./analyzeCobol:
// analyzeCobol.ts (vscode-touching command registration, Task 4) imports
// 'vscode', which mocha cannot resolve outside a running Extension Host --
// same split as export/exportRunner.ts vs export/exportMainframe.ts.
import { buildAnalyzeArgs, runAnalyze } from './analysisRunner';
import { CommandRunner } from '../environment/commandRunner';

describe('buildAnalyzeArgs', () => {
  it('builds the base analyze invocation with no copybook paths', () => {
    const args = buildAnalyzeArgs('dead-code', '/p/PROG.cbl', []);
    assert.deepStrictEqual(args, ['analyze', 'dead-code', '/p/PROG.cbl', '--compact']);
  });

  it('appends a --copybook-path flag per configured path', () => {
    const args = buildAnalyzeArgs('program-flow', '/p/PROG.cbl', ['/copy/a', '/copy/b']);
    assert.deepStrictEqual(args, [
      'analyze', 'program-flow', '/p/PROG.cbl', '--compact',
      '--copybook-path', '/copy/a', '--copybook-path', '/copy/b',
    ]);
  });
});

describe('runAnalyze', () => {
  it('returns exit code and output on success', async () => {
    const fakeRun: CommandRunner = async (cmd, args) => {
      assert.strictEqual(cmd, 'mockymock');
      assert.deepStrictEqual(args, ['analyze', 'dead-code', '/p/PROG.cbl', '--compact']);
      return {
        code: 0,
        stdout: '{"source_file":"/p/PROG.cbl","program_id":"PROG","dead_code":[],"summary":{"total_procedures":1,"referenced_procedures":1,"dead_procedures":0}}\n',
        stderr: '',
      };
    };
    const result = await runAnalyze('mockymock', 'dead-code', '/p/PROG.cbl', [], fakeRun);
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /"dead_code":\[\]/);
  });

  it('surfaces stderr on nonzero exit', async () => {
    const fakeRun: CommandRunner = async () => ({
      code: 1,
      stdout: '',
      stderr: 'error: File not found: /p/PROG.cbl\n',
    });
    const result = await runAnalyze('mockymock', 'dead-code', '/p/PROG.cbl', [], fakeRun);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stderr, /File not found/);
  });
});
