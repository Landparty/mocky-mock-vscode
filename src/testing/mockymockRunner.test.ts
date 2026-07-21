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

  it('forwards an onOutput listener through to the command runner', async () => {
    const fakeRun: CommandRunner = async (cmd, args, onOutput) => {
      onOutput?.('compiling…\n', 'stdout');
      onOutput?.('warning: foo\n', 'stderr');
      return { code: 0, stdout: 'compiling…\n', stderr: 'warning: foo\n' };
    };
    const chunks: Array<{ text: string; stream: string }> = [];
    await runSuite(
      { executablePath: 'mockymock', cblPath: '/p/PROG.cbl', cutPath: '/p/PROG.cut', junitXmlPath: '/tmp/out.xml', copybookPaths: [] },
      fakeRun,
      async () => '<testsuite/>',
      (chunk, stream) => chunks.push({ text: chunk, stream })
    );
    assert.deepStrictEqual(chunks, [
      { text: 'compiling…\n', stream: 'stdout' },
      { text: 'warning: foo\n', stream: 'stderr' },
    ]);
  });
});

describe('buildRunArgs extras', () => {
  it('adds --json-report, --coverage-json, and --case flags', () => {
    const args = buildRunArgs('/p/PROG.cbl', '/p/PROG.cut', '/tmp/out.xml', ['/copy/a'], {
      jsonReportPath: '/tmp/report.json',
      coverageJsonPath: '/tmp/coverage.json',
      caseNames: ['first case', 'second case'],
    });
    assert.deepStrictEqual(args, [
      'run', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--junit-xml', '/tmp/out.xml',
      '--json-report', '/tmp/report.json',
      '--coverage-json', '/tmp/coverage.json',
      '--case', 'first case',
      '--case', 'second case',
      '--copybook-path', '/copy/a',
    ]);
  });

  it('reads back the trace json when the path is set', async () => {
    const files: Record<string, string> = {
      '/tmp/out.xml': '<testsuite/>',
      '/tmp/trace.json': '{"path":[],"mocks":[]}',
    };
    const fakeRun: CommandRunner = async () => ({ code: 0, stdout: '', stderr: '' });
    const result = await runSuite(
      {
        executablePath: 'mockymock',
        cblPath: '/p/PROG.cbl',
        cutPath: '/p/PROG.cut',
        junitXmlPath: '/tmp/out.xml',
        copybookPaths: [],
        traceJsonPath: '/tmp/trace.json',
      },
      fakeRun,
      async (p) => files[p] ?? null
    );
    assert.strictEqual(result.traceJson, '{"path":[],"mocks":[]}');
  });

  it('leaves traceJson null when no trace path was requested', async () => {
    const fakeRun: CommandRunner = async () => ({ code: 0, stdout: '', stderr: '' });
    const result = await runSuite(
      { executablePath: 'mockymock', cblPath: '/p/PROG.cbl', cutPath: '/p/PROG.cut', junitXmlPath: '/tmp/out.xml', copybookPaths: [] },
      fakeRun,
      async () => '<testsuite/>'
    );
    assert.strictEqual(result.traceJson, null);
  });

  it('adds a --trace-json flag when requested', () => {
    const args = buildRunArgs('/p/PROG.cbl', '/p/PROG.cut', '/tmp/out.xml', [], {
      traceJsonPath: '/tmp/trace.json',
      caseNames: ['only case'],
    });
    assert.deepStrictEqual(args, [
      'run', '/p/PROG.cbl', '--cut', '/p/PROG.cut', '--junit-xml', '/tmp/out.xml',
      '--trace-json', '/tmp/trace.json',
      '--case', 'only case',
    ]);
  });

  it('reads back the json report and coverage json when paths are set', async () => {
    const files: Record<string, string> = {
      '/tmp/out.xml': '<testsuite/>',
      '/tmp/report.json': '{"cases":[]}',
      '/tmp/coverage.json': '{"original":{"lines":[]}}',
    };
    const fakeRun: CommandRunner = async () => ({ code: 0, stdout: '', stderr: '' });
    const result = await runSuite(
      {
        executablePath: 'mockymock',
        cblPath: '/p/PROG.cbl',
        cutPath: '/p/PROG.cut',
        junitXmlPath: '/tmp/out.xml',
        copybookPaths: [],
        jsonReportPath: '/tmp/report.json',
        coverageJsonPath: '/tmp/coverage.json',
      },
      fakeRun,
      async (p) => files[p] ?? null
    );
    assert.strictEqual(result.junitXml, '<testsuite/>');
    assert.strictEqual(result.jsonReport, '{"cases":[]}');
    assert.strictEqual(result.coverageJson, '{"original":{"lines":[]}}');
  });

  it('forwards an abort signal through to the command runner', async () => {
    let seenSignal: AbortSignal | undefined;
    const fakeRun: CommandRunner = async (_cmd, _args, _onOutput, signal) => {
      seenSignal = signal;
      return { code: 0, stdout: '', stderr: '' };
    };
    const abort = new AbortController();
    await runSuite(
      { executablePath: 'mockymock', cblPath: '/p/PROG.cbl', cutPath: '/p/PROG.cut', junitXmlPath: '/tmp/out.xml', copybookPaths: [] },
      fakeRun,
      async () => null,
      undefined,
      abort.signal
    );
    assert.strictEqual(seenSignal, abort.signal);
  });
});
