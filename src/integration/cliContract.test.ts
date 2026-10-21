import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { buildRunArgs } from '../testing/mockymockRunner';
import { buildMutateArgs } from '../testing/mutationRunner';
import { buildExportArgs } from '../export/exportRunner';
import { buildDebugArgs, buildLintArgs } from '../debug/debugArgs';
import { cutSuitesFromCollectJson } from '../discovery/cutDiscovery';
import { parseLintOutput, parseLintWarnings } from '../linting/lintOutput';
import { buildGenerateArgs, buildInitArgs } from '../newTestSuite/cutTemplate';
import { BoundaryInfo, boundaryKeyCandidates } from '../completion/cutCompletionLogic';
import { parseDoctorJson } from '../environment/doctorReport';

// Everything this extension does, it does by spawning the mockymock CLI and
// parsing what comes back. Every OTHER test in this repo checks that against
// a hand-written fixture string -- which pins the extension's own behavior
// but says nothing about whether the CLI still accepts those flags or still
// emits that shape. A renamed flag or a reshaped JSON key upstream would
// leave this whole suite green and the extension broken in the user's hands.
//
// So: run the REAL CLI and feed its REAL output through the extension's own
// parsers. Skipped (not failed) when mockymock isn't installed, so a
// contributor without the Python side set up can still run `npm run
// test:unit` -- but on a machine that has it (and in any CI job that
// installs it), this is the test that actually holds the two repos together.
//
// Set MOCKYMOCK_CLI to point at a specific executable; otherwise `mockymock`
// is resolved from PATH.
const CLI = process.env.MOCKYMOCK_CLI ?? 'mockymock';

// Docker-free subcommands only. `run`/`debug`/`mutate` need the GnuCOBOL
// container to do anything real, so this file exercises their ARGUMENT
// contract (via --help, which argparse short-circuits before validating
// anything) and leaves their execution to the manual/CI integration path.
function cli(args: string[], cwd?: string): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(CLI, args, { encoding: 'utf8', cwd });
  return {
    code: result.status ?? -1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function cliAvailable(): boolean {
  try {
    return cli(['--version']).code === 0;
  } catch {
    return false;
  }
}

const EXAMPLE_DIR = path.join(process.cwd(), 'examples', 'invupdt');
const CBL = path.join(EXAMPLE_DIR, 'INVUPDT.cbl');
const CUT = path.join(EXAMPLE_DIR, 'INVUPDT.cut');

// The long flags an arg-builder actually emits. Values are skipped: a value
// can legitimately start with "--" only if a path does, which none here do.
// A `--flag=value` argument (--case=NAME) counts as its flag.
function longFlags(args: string[]): string[] {
  return [...new Set(args.filter((a) => a.startsWith('--')).map((a) => a.split('=')[0]))];
}

describe('mockymock CLI contract (live)', function () {
  // argparse --help on a cold Python interpreter is comfortably slower than
  // mocha's 5s default once a dozen of them run in sequence.
  this.timeout(60_000);

  before(function () {
    if (!cliAvailable()) {
      this.skip();
    }
  });

  // Cache each subcommand's --help once; every flag assertion reads from it.
  const helpCache = new Map<string, string>();
  function helpFor(subcommand: string[]): string {
    const key = subcommand.join(' ');
    let help = helpCache.get(key);
    if (help === undefined) {
      const result = cli([...subcommand, '--help']);
      assert.strictEqual(
        result.code,
        0,
        `\`mockymock ${key} --help\` exited ${result.code}; the extension calls this subcommand.\n${result.stderr}`
      );
      help = result.stdout;
      helpCache.set(key, help);
    }
    return help;
  }

  function assertFlagsAccepted(subcommand: string[], args: string[]): void {
    const help = helpFor(subcommand);
    for (const flag of longFlags(args)) {
      assert.ok(
        help.includes(flag),
        `\`mockymock ${subcommand.join(' ')}\` no longer documents ${flag}, which this extension passes on every invocation`
      );
    }
  }

  describe('argument builders match the installed CLI', () => {
    it('buildRunArgs (with every optional channel enabled)', () => {
      const args = buildRunArgs(CBL, CUT, '/tmp/j.xml', ['/copybooks'], {
        jsonReportPath: '/tmp/r.json',
        coverageJsonPath: '/tmp/c.json',
        traceJsonPath: '/tmp/t.json',
        caseNames: ['a case'],
      });
      assert.strictEqual(args[0], 'run');
      assertFlagsAccepted(['run'], args);
    });

    it('buildMutateArgs', () => {
      const args = buildMutateArgs(CBL, CUT, '/tmp/m.json', ['/copybooks']);
      assert.strictEqual(args[0], 'mutate');
      assertFlagsAccepted(['mutate'], args);
    });

    it('buildExportArgs', () => {
      const args = buildExportArgs(CBL, CUT, ['/copybooks'], '/tmp/out.cbl');
      assert.strictEqual(args[0], 'export');
      assertFlagsAccepted(['export'], args);
    });

    it('buildLintArgs', () => {
      const args = buildLintArgs({ program: CBL, cut: CUT, copybookPaths: ['/copybooks'] });
      assert.strictEqual(args[0], 'lint');
      assertFlagsAccepted(['lint'], args);
    });

    it('buildDebugArgs', () => {
      const args = buildDebugArgs({ program: CBL, cut: CUT, case: 'a case', copybookPaths: ['/copybooks'] });
      assert.strictEqual(args[0], 'debug');
      assertFlagsAccepted(['debug'], args);
    });

    // Probed, not pinned: the extension passes these only to a CLI whose
    // `lint --help` lists them (supportsExtraCopybookPath /
    // supportsLintCaseFlag), so an older pinned CLI skips this.
    it('--extra-copybook-path and lint --case, where the CLI has them', function () {
      if (!helpFor(['lint']).includes('--extra-copybook-path')) this.skip();
      const extra = ['/zapp'];
      assertFlagsAccepted(['lint'], buildLintArgs({ program: CBL, cut: CUT, extraCopybookPaths: extra }, 'a case'));
      assertFlagsAccepted(['run'], buildRunArgs(CBL, CUT, '/tmp/j.xml', [], { extraCopybookPaths: extra }));
      assertFlagsAccepted(['mutate'], buildMutateArgs(CBL, CUT, '/tmp/m.json', [], extra));
      assertFlagsAccepted(['export'], buildExportArgs(CBL, CUT, [], '/tmp/out.cbl', extra));
      assertFlagsAccepted(['debug'], buildDebugArgs({ program: CBL, cut: CUT, case: 'a case', extraCopybookPaths: extra }));
      assertFlagsAccepted(['generate'], buildGenerateArgs(CBL, '/tmp/P.cut', [], false, extra));
      assertFlagsAccepted(['init'], buildInitArgs(CBL, '/tmp/P.cut', [], extra));
      assertFlagsAccepted(['collect'], ['--extra-copybook-path', '/zapp']);
    });

    it('the collect --json discovery call', () => {
      assertFlagsAccepted(['collect'], ['collect', '--cut', CUT, '--json']);
    });

    it('the collect --boundaries call cutCompletionProvider makes', () => {
      assertFlagsAccepted(['collect'], ['collect', CBL, '--cut', CUT, '--json', '--boundaries']);
    });

    it('the generate --fill call lintCodeActionProvider makes', () => {
      assertFlagsAccepted(['generate'], ['generate', CBL, '--fill', CUT, '--copybook-path', '/copybooks']);
    });

    it('the New Test Suite calls (init, then generate)', function () {
      assertFlagsAccepted(['init'], buildInitArgs(CBL, '/tmp/o.cut', ['/copybooks']));
      assertFlagsAccepted(['generate'], buildGenerateArgs(CBL, '/tmp/o.cut', ['/copybooks']));
      if (!helpFor(['generate']).includes('--per-paragraph')) this.skip(); // CLI predates scenario-default generate
      assertFlagsAccepted(['generate'], buildGenerateArgs(CBL, '/tmp/o.cut', ['/copybooks'], true));
    });

    it('the explain --json call cutHoverProvider makes', () => {
      assertFlagsAccepted(['explain'], ['explain', 'UNRESOLVED_COPYBOOK', '--json']);
    });

    // The capability probes in environment/checks.ts gate whole features on
    // a substring of these same --help texts; a probe that silently starts
    // returning false disables the feature with no error anywhere.
    it('the capability probes still find their marker strings', () => {
      assert.ok(helpFor(['run']).includes('--trace-json'), 'supportsTraceFlag would now report false');
      assert.ok(helpFor(['debug']).includes('--dap-stdio'), 'supportsDebugCommand would now report false');
      assert.ok(helpFor(['export']).includes('--output'), 'supportsExportCommand would now report false');
      assert.ok(helpFor(['mutate']).includes('--json-report'), 'supportsMutateCommand would now report false');
      assert.ok(helpFor(['init']).includes('--output'), 'supportsInitCommand would now report false');
    });
  });

  describe("the extension's parsers accept the CLI's real output", () => {
    it('cutSuitesFromCollectJson parses a real `collect --json`', () => {
      const result = cli(['collect', '--cut', CUT, '--json']);
      assert.strictEqual(result.code, 0, result.stderr);
      const suites = cutSuitesFromCollectJson(result.stdout);
      assert.ok(suites, 'collect --json output no longer parses into suites');
      assert.ok(suites.length > 0, 'expected at least one suite from the invupdt example');
      const [suite] = suites;
      assert.ok(suite.name.length > 0);
      assert.ok(suite.cases.length > 0, 'expected the example suite to report its TESTCASEs');
      for (const testCase of suite.cases) {
        assert.ok(testCase.name.length > 0);
        assert.ok(Number.isInteger(testCase.line), 'every discovered case needs a line to anchor its TestItem');
      }
    });

    it('parseLintOutput parses a real clean lint', () => {
      const result = cli(['lint', CBL, '--cut', CUT]);
      assert.strictEqual(result.code, 0, `the bundled example should lint clean:\n${result.stdout}${result.stderr}`);
      assert.deepStrictEqual(parseLintOutput(result.stdout), [], 'a clean lint must produce no problems');
    });

    it('parseLintWarnings parses a real NO_ASSERTION warning, which never fails lint', function () {
      if (!helpFor(['generate']).includes('--per-paragraph')) this.skip(); // CLI predates the warning
      // The example suite with every EXPECT/VERIFY dropped: still valid,
      // but every case now asserts nothing.
      const bare = fs
        .readFileSync(CUT, 'utf8')
        .split(/\r?\n/)
        .filter((line) => !/^\s*(EXPECT|VERIFY)\b/.test(line))
        .join('\n');
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mm-noassert-'));
      const cut = path.join(dir, 'INVUPDT.cut');
      fs.writeFileSync(cut, bare);
      const result = cli(['lint', CBL, '--cut', cut]);
      assert.strictEqual(result.code, 0, `a warning must not fail lint:\n${result.stdout}${result.stderr}`);
      assert.deepStrictEqual(parseLintOutput(result.stdout), [], 'a warning must not parse as a problem');
      const warnings = parseLintWarnings(result.stdout);
      assert.ok(warnings.length > 0, `warning output no longer parses:\n${result.stdout}`);
      for (const warning of warnings) {
        assert.strictEqual(warning.code, 'NO_ASSERTION');
        assert.ok(warning.line !== null && bare.split('\n')[warning.line - 1].startsWith('TESTCASE'));
      }
    });

    it('parseLintOutput parses a real refusal, with its code', () => {
      // A .cbl whose COPY member cannot be resolved is the cheapest genuine
      // refusal that needs no Docker.
      const missing = path.join(process.cwd(), 'src', 'integration', 'fixtures', 'UNRESOLVED.cbl');
      const result = cli(['lint', missing, '--cut', CUT]);
      assert.notStrictEqual(result.code, 0, 'expected an unresolved COPY to be refused');
      const problems = parseLintOutput(result.stdout);
      assert.ok(problems.length > 0, `refusal output no longer parses:\n${result.stdout}`);
      assert.ok(
        problems.some((p) => p.code === 'UNRESOLVED_COPYBOOK'),
        `expected an UNRESOLVED_COPYBOOK code, got: ${problems.map((p) => p.code).join(', ')}`
      );
    });

    it('cutCompletionProvider parses a real `collect --boundaries`', () => {
      const result = cli(['collect', CBL, '--cut', CUT, '--json', '--boundaries']);
      assert.strictEqual(result.code, 0, result.stderr);
      const payload = JSON.parse(result.stdout) as { boundaries?: BoundaryInfo[] };
      const boundaries = payload.boundaries ?? [];
      assert.ok(boundaries.length > 0, 'expected at least one boundary from the invupdt example');
      for (const b of boundaries) {
        assert.strictEqual(typeof b.category, 'string');
        assert.strictEqual(typeof b.label, 'string');
        assert.strictEqual(typeof b.paragraph, 'string');
        assert.ok(Number.isInteger(b.line));
      }
      const openBoundaries = boundaries.filter((b) => b.category === 'OPEN');
      assert.ok(openBoundaries.length > 0, 'expected the example to have at least one OPEN boundary');
      assert.ok(
        boundaryKeyCandidates(boundaries, 'open').length > 0,
        'boundaryKeyCandidates found no keys for a category real output has boundaries for'
      );
      // The CLI renders the exact header the DSL parses; the extension
      // inserts it verbatim rather than re-deriving the quoting rules.
      for (const b of boundaries) {
        assert.ok(b.directive === null || typeof b.directive === 'string');
      }
    });

    it('parseDoctorJson parses a real `doctor --json`, including the project checks Check Setup reports', () => {
      // doctor exits 1 when Docker is down; its JSON is the contract either way.
      const result = cli(['doctor', '--json']);
      const report = parseDoctorJson(result.stdout);
      assert.ok(report, `doctor --json output no longer parses:\n${result.stdout}${result.stderr}`);
      const ids = report.checks.map((c) => c.id);
      for (const id of ['cobol_parser', 'config_file']) {
        assert.ok(ids.includes(id), `expected a '${id}' check, got: ${ids.join(', ')}`);
      }
    });

    // runCommandIn spawns every file-scoped call from the .cut's folder on
    // the strength of this: the CLI finds the project config by walking up
    // from its working directory.
    describe('project config (mockymock.toml) found from the working directory', () => {
      let project: string;
      let cbl: string;
      let cut: string;

      before(() => {
        project = fs.mkdtempSync(path.join(os.tmpdir(), 'mockymock-contract-'));
        const src = path.join(project, 'src');
        fs.mkdirSync(src);
        const example = path.join(process.cwd(), 'examples', 'real-world', 'ACCTPRG');
        cbl = path.join(src, 'ACCTPRG.cbl');
        cut = path.join(src, 'ACCTPRG.cut');
        fs.copyFileSync(path.join(example, 'ACCTPRG.cbl'), cbl);
        fs.copyFileSync(path.join(example, 'ACCTPRG.cut'), cut);
        fs.cpSync(path.join(example, 'copybooks'), path.join(project, 'cpy'), { recursive: true });
      });

      after(() => fs.rmSync(project, { recursive: true, force: true }));

      it("applies the config's copybook_path when run from the .cut's folder", () => {
        fs.writeFileSync(path.join(project, 'mockymock.toml'), 'copybook_path = ["cpy"]\n');
        const result = cli(['lint', cbl, '--cut', cut], path.dirname(cut));
        assert.strictEqual(result.code, 0, `expected the config's copybook_path to resolve COPY:\n${result.stdout}`);
      });

      it('reports a malformed config as a lint problem, not silence', () => {
        fs.writeFileSync(path.join(project, 'mockymock.toml'), 'copybook_path = 42\n');
        const result = cli(['lint', cbl, '--cut', cut], path.dirname(cut));
        assert.notStrictEqual(result.code, 0);
        assert.ok(
          parseLintOutput(result.stdout).length > 0,
          `a config error must surface as a problem:\n${result.stdout}${result.stderr}`
        );
      });
    });

    it('cutHoverProvider parses a real `explain --json`', () => {
      const result = cli(['explain', 'UNRESOLVED_COPYBOOK', '--json']);
      assert.strictEqual(result.code, 0, result.stderr);
      const payload = JSON.parse(result.stdout) as { explanation?: string };
      assert.ok(
        typeof payload.explanation === 'string' && payload.explanation.length > 0,
        `expected a non-empty explanation, got:\n${result.stdout}`
      );
    });
  });
});
