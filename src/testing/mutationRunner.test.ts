import * as assert from 'assert';
import { buildMutateArgs, runMutate } from './mutationRunner';
import { CommandRunner } from '../environment/commandRunner';

describe('buildMutateArgs', () => {
  it('builds the minimal invocation', () => {
    assert.deepStrictEqual(buildMutateArgs('PROG.cbl', 'PROG.cut', '/tmp/m.json', []), [
      'mutate',
      'PROG.cbl',
      '--cut',
      'PROG.cut',
      '--json-report',
      '/tmp/m.json',
    ]);
  });

  it('appends one --copybook-path per configured directory', () => {
    const args = buildMutateArgs('PROG.cbl', 'PROG.cut', '/tmp/m.json', ['/copy/a', '/copy/b']);
    assert.deepStrictEqual(args.slice(6), ['--copybook-path', '/copy/a', '--copybook-path', '/copy/b']);
  });
});

describe('runMutate', () => {
  const options = {
    executablePath: 'mockymock',
    cblPath: 'PROG.cbl',
    cutPath: 'PROG.cut',
    jsonReportPath: '/tmp/m.json',
    copybookPaths: [],
  };

  it('invokes the runner with the built args and reads the report file', async () => {
    let seenCommand = '';
    let seenArgs: string[] = [];
    const runner: CommandRunner = async (command, args) => {
      seenCommand = command;
      seenArgs = args;
      return { code: 0, stdout: 'mutation score: 100.0%\n', stderr: '' };
    };
    const result = await runMutate(options, runner, async (p) =>
      p === '/tmp/m.json' ? '{"mutants": []}' : null
    );
    assert.strictEqual(seenCommand, 'mockymock');
    assert.deepStrictEqual(seenArgs, buildMutateArgs('PROG.cbl', 'PROG.cut', '/tmp/m.json', []));
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.stdout, 'mutation score: 100.0%\n');
    assert.strictEqual(result.jsonReport, '{"mutants": []}');
  });

  it('carries a null report through when the CLI produced none', async () => {
    const runner: CommandRunner = async () => ({ code: 1, stdout: '', stderr: 'mockymock mutate: boom' });
    const result = await runMutate(options, runner, async () => null);
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.stderr, 'mockymock mutate: boom');
    assert.strictEqual(result.jsonReport, null);
  });
});
