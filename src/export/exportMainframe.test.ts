import * as assert from 'assert';
// Imports the pure functions from exportRunner, not from ./exportMainframe:
// exportMainframe.ts imports 'vscode' (for activateExportMainframeCommand),
// which mocha cannot resolve outside a running Extension Host -- same
// reason debugArgs.ts/lintGate.ts stay vscode-free in src/debug. See
// exportRunner.ts for buildExportArgs/runExport themselves.
import { buildExportArgs, runExport } from './exportRunner';
import { CommandRunner } from '../environment/commandRunner';

describe('buildExportArgs', () => {
  it('builds the base export invocation with no copybook paths', () => {
    const args = buildExportArgs('/p/PROG.cbl', '/p/PROG.cut', [], '/p/PROG.mainframe.cbl');
    assert.deepStrictEqual(args, [
      'export', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--output', '/p/PROG.mainframe.cbl',
    ]);
  });

  it('appends a --copybook-path flag per configured path', () => {
    const args = buildExportArgs('/p/PROG.cbl', '/p/PROG.cut', ['/copy/a', '/copy/b'], '/p/PROG.mainframe.cbl');
    assert.deepStrictEqual(args, [
      'export', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--output', '/p/PROG.mainframe.cbl',
      '--copybook-path', '/copy/a', '--copybook-path', '/copy/b',
    ]);
  });
});

describe('runExport', () => {
  it('returns exit code and output on success', async () => {
    const fakeRun: CommandRunner = async (cmd, args) => {
      assert.strictEqual(cmd, 'mockymock');
      assert.ok(args.includes('export'));
      return {
        code: 0,
        stdout: 'mockymock export: wrote mainframe-compilable source (1 test case(s)) -> /p/PROG.mainframe.cbl\n',
        stderr: '',
      };
    };
    const result = await runExport('mockymock', '/p/PROG.cbl', '/p/PROG.cut', [], '/p/PROG.mainframe.cbl', fakeRun);
    assert.strictEqual(result.exitCode, 0);
    assert.match(result.stdout, /wrote mainframe-compilable source/);
  });

  it('surfaces a refusal on nonzero exit', async () => {
    // The real CLI print()s refusal text to stdout, not stderr (confirmed
    // against mockymock's own tests, which assert on capsys.readouterr().out
    // for refusal text) -- this fixture mirrors that real contract.
    const fakeRun: CommandRunner = async () => ({
      code: 1,
      stdout: 'mockymock export: refused (COLUMN_OVERFLOW): line 42 ...\n',
      stderr: '',
    });
    const result = await runExport('mockymock', '/p/PROG.cbl', '/p/PROG.cut', [], '/p/PROG.mainframe.cbl', fakeRun);
    assert.strictEqual(result.exitCode, 1);
    assert.match(result.stdout, /COLUMN_OVERFLOW/);
  });
});
