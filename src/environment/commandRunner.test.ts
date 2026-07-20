import * as assert from 'assert';
import { runCommand, quoteArgForWindowsShell } from './commandRunner';

describe('quoteArgForWindowsShell', () => {
  it('leaves a plain argument untouched', () => {
    assert.strictEqual(quoteArgForWindowsShell('/p/PROG.cbl'), '/p/PROG.cbl');
  });

  it('quotes an argument containing a space', () => {
    assert.strictEqual(quoteArgForWindowsShell('C:\\Users\\Sam Dion\\PROG.cbl'), '"C:\\Users\\Sam Dion\\PROG.cbl"');
  });
});

describe('runCommand', () => {
  it('resolves with the buffered stdout/stderr and exit code', async () => {
    const result = await runCommand(process.execPath, ['-e', "process.stdout.write('out'); process.exitCode = 0;"]);
    assert.strictEqual(result.code, 0);
    assert.strictEqual(result.stdout, 'out');
  });

  it('reports a non-zero exit code and stderr content', async () => {
    const result = await runCommand(process.execPath, [
      '-e',
      "process.stderr.write('boom'); process.exitCode = 3;",
    ]);
    assert.strictEqual(result.code, 3);
    assert.strictEqual(result.stderr, 'boom');
  });

  it('streams stdout/stderr chunks to onOutput as they arrive, in addition to buffering them', async () => {
    const chunks: Array<{ text: string; stream: string }> = [];
    const result = await runCommand(
      process.execPath,
      ['-e', "process.stdout.write('a'); process.stderr.write('b'); process.stdout.write('c');"],
      (text, stream) => chunks.push({ text, stream })
    );
    assert.strictEqual(result.stdout, 'ac');
    assert.strictEqual(result.stderr, 'b');
    assert.strictEqual(
      chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join(''),
      'ac'
    );
    assert.strictEqual(
      chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join(''),
      'b'
    );
  });

  it('resolves with a non-zero code and an explanatory stderr when the command cannot be spawned', async () => {
    // On Windows (shell:true) this surfaces as cmd.exe's "not recognized" with a
    // shell-dependent exit code; elsewhere (shell:false) spawn's 'error' event fires and
    // this module resolves it as code -1. Either way: never a success code, and never silent.
    const result = await runCommand('this-command-does-not-exist-anywhere', []);
    assert.notStrictEqual(result.code, 0);
    assert.ok(result.stderr.length > 0);
  });
});
