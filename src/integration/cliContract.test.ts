import * as assert from 'assert';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { buildRunArgs } from '../testing/mockymockRunner';
import { buildMutateArgs } from '../testing/mutationRunner';
import { buildExportArgs } from '../export/exportRunner';
import { buildDebugArgs, buildLintArgs } from '../debug/debugArgs';
import { cutSuitesFromCollectJson } from '../discovery/cutDiscovery';
import { parseLintOutput } from '../linting/lintOutput';

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
function cli(args: string[]): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(CLI, args, { encoding: 'utf8' });
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
function longFlags(args: string[]): string[] {
  return [...new Set(args.filter((a) => a.startsWith('--')))];
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

    it('the collect --json discovery call', () => {
      assertFlagsAccepted(['collect'], ['collect', '--cut', CUT, '--json']);
    });


    // The capability probes in environment/checks.ts gate whole features on
    // a substring of these same --help texts; a probe that silently starts
    // returning false disables the feature with no error anywhere.
    it('the capability probes still find their marker strings', () => {
      assert.ok(helpFor(['run']).includes('--trace-json'), 'supportsTraceFlag would now report false');
      assert.ok(helpFor(['debug']).includes('--dap-stdio'), 'supportsDebugCommand would now report false');
      assert.ok(helpFor(['export']).includes('--output'), 'supportsExportCommand would now report false');
      assert.ok(helpFor(['mutate']).includes('--json-report'), 'supportsMutateCommand would now report false');
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



  });
});
