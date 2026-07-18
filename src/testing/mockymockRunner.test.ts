import * as assert from 'assert';
import { buildRunArgs, runSuite } from './mockymockRunner';
import { CommandRunner } from '../environment/commandRunner';

describe('buildRunArgs', () => {
  it('builds the base run invocation with no copybook paths', () => {
    const args = buildRunArgs('/p/PROG.cbl', '/p/PROG.cut', '/tmp/out.xml', []);
    assert.deepStrictEqual(args, ['run', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--junit-xml', '/tmp/out.xml']);
  });

  it('appends a --copybook-path flag per configured path', () => {
    const args = buildRunArgs('/p/PROG.cbl', '/p/PROG.cut', '/tmp/out.xml', ['/copy/a', '/copy/b']);
    assert.deepStrictEqual(args, [
      'run', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--junit-xml', '/tmp/out.xml',
      '--copybook-path', '/copy/a', '--copybook-path', '/copy/b',
    ]);
  });
});

describe('runSuite', () => {
  it('returns the parsed junit xml when the file was produced', async () => {
    const fakeRun: CommandRunner = async (cmd, args) => {
      assert.strictEqual(cmd, 'mockymock');
      assert.ok(args.includes('run'));
      return { code: 0, stdout: 'ok', stderr: '' };
    };
    const result = await runSuite(
      { executablePath: 'mockymock', cblPath: '/p/PROG.cbl', cutPath: '/p/PROG.cut', junitXmlPath: '/tmp/out.xml', copybookPaths: [] },
      fakeRun,
      async () => '<testsuite/>'
    );
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(result.junitXml, '<testsuite/>');
  });

  it('returns a null junitXml when the run refused before producing one', async () => {
    const fakeRun: CommandRunner = async () => ({ code: 1, stdout: '', stderr: 'mockymock run: refused (PARSE_WARNING): ...' });
    const result = await runSuite(
      { executablePath: 'mockymock', cblPath: '/p/PROG.cbl', cutPath: '/p/PROG.cut', junitXmlPath: '/tmp/out.xml', copybookPaths: [] },
      fakeRun,
      async () => null
    );
    assert.strictEqual(result.exitCode, 1);
    assert.strictEqual(result.junitXml, null);
    assert.match(result.stderr, /refused/);
  });
});
