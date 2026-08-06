// src/boundaries/realCli.integration.test.ts
//
// Drives this module's own PURE functions -- fetchBundle's validation,
// buildViewModel, buildGenerateArgs/runGenerate's argv assembly and
// stdout/stderr parsing -- against a REAL `mockymock` CLI process, instead
// of the canned CommandRunner stubs the rest of this directory's
// *.test.ts files use. Those stubs prove the extension's own logic is
// internally consistent; this file proves that logic still matches what
// the CLI actually emits today, which the stubs cannot catch if the
// bundle JSON shape or argv contract drifts.
//
// SKIPPED (not failed) unless MOCKYMOCK_REAL_CLI_DIR points at a mocky-mock
// checkout new enough to have the `fixtures` subcommand (mocky-mock PR #46,
// feature/unify-with-data as of this writing) -- so `npm run test:unit`
// stays green and hermetic with the env var unset. Run for real with
// `npm run test:integration` (see package.json + scripts/run-integration-
// tests.js), which locates a sibling mocky-mock worktree and sets the env
// var for you.
//
// The real CLI is invoked as `python -m mockymock.cli.main <args>` with cwd
// set to MOCKYMOCK_REAL_CLI_DIR, per the task brief -- that worktree's own
// interpreter already has the matching cobol-parser + mockymock installed;
// there is no standalone `mockymock` executable on PATH in this dev
// environment. realCliRunner() below ignores whatever "executable" name
// fetchBundle/runGenerate pass it (they were written for a real binary) and
// always shells out that way -- everything else (buildFixturesArgs'/
// buildGenerateArgs' argv assembly, fetchBundle's parsing, runGenerate's
// stdout/stderr handling) is the real, unstubbed extension code.
import assert from 'node:assert/strict';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import type { CommandResult, CommandRunner } from '../environment/commandRunner';
import { fetchBundle, BundleError } from './bundleClient';
import { buildViewModel, placeholderArgs } from './boundariesModel';
import { buildGenerateArgs, runGenerate } from './generateCut';
import type { FixtureBundle } from './bundleTypes';

const CLI_DIR = process.env.MOCKYMOCK_REAL_CLI_DIR;
const describeReal = CLI_DIR ? describe : describe.skip;

function realCliRunner(cwd: string): CommandRunner {
  return (_executable, args) =>
    new Promise<CommandResult>((resolve) => {
      const child = spawn('python', ['-m', 'mockymock.cli.main', ...args], {
        cwd,
        shell: process.platform === 'win32',
      });
      let stdout = '';
      let stderr = '';
      child.stdout?.on('data', (d) => (stdout += d.toString()));
      child.stderr?.on('data', (d) => (stderr += d.toString()));
      child.on('error', () => resolve({ code: -1, stdout, stderr: stderr || 'command not found' }));
      child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
    });
}

describeReal('realCli integration (mockymock fixtures / generate --with-data)', function () {
  // A real subprocess running cobol-parser's full AST walk per call, not a
  // stubbed CommandRunner -- generous but bounded.
  this.timeout(60000);

  const cliDir = CLI_DIR as string;
  const runner = realCliRunner(cliDir);
  // Relative to cliDir (the mocky-mock worktree root) -- the CLI resolves
  // the program path against its own cwd, same as a user's terminal would.
  const cblPath = 'examples/fixtures/FIXTUREDEMO.cbl';

  let tmpDir: string;
  let bundle: FixtureBundle;

  before(async () => {
    assert.ok(
      fs.existsSync(cliDir),
      `MOCKYMOCK_REAL_CLI_DIR=${cliDir} does not exist -- point it at a mocky-mock ` +
        'checkout with the `fixtures` subcommand (see README "COBOL Boundaries view")'
    );
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mockymock-boundaries-it-'));
    // Fetched once and reused across (a)/(b)/(c) below -- each call is a
    // real subprocess plus a full cobol-parser AST walk, not a stub.
    bundle = await fetchBundle(runner, 'mockymock', cblPath, { scenarios: 'happy', copybookPaths: [], seed: 7 });
  });

  after(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('(a) fetchBundle parses a real FIXTUREDEMO bundle: version 1, non-empty scenarios, a READ fixture with direction IN', () => {
    assert.equal(bundle.bundle_version, 1);
    assert.equal(bundle.program_name, 'FIXTUREDEMO');
    assert.ok(bundle.scenarios.length > 0, 'expected at least one scenario');
    const readFixture = bundle.scenarios.flatMap((s) => s.fixtures).find((f) => f.category === 'READ');
    assert.ok(readFixture, 'expected a READ fixture in the bundle');
    assert.equal(readFixture!.direction, 'IN');
  });

  it('(b) buildViewModel groups the real bundle into paragraphs with sane directions', () => {
    const model = buildViewModel(bundle, {});
    assert.ok(model.groups.length > 0, 'expected at least one paragraph group');
    const allBoundaries = model.groups.flatMap((g) => g.boundaries);
    // FIXTUREDEMO.cbl touches ACCEPT, OPEN, CLOSE, SQL, CALL, and READ --
    // six distinct boundaries by design (see the program's own header
    // comment in the mocky-mock repo).
    assert.ok(allBoundaries.length >= 6, `expected >= 6 boundaries, got ${allBoundaries.length}`);
    // '' is a real, DELIBERATE value on live output, not a bug this test
    // should treat as "insane": cobol-parser's boundary_inventory.py sets
    // direction="" on every CALL/DYNCALL Boundary ("per-arg; no single
    // statement-level direction" -- that statement's real direction lives
    // per-argument in `call_args`, which bundleTypes.ts's BundleFixture
    // deliberately doesn't model -- out of scope per the design spec).
    // BundleFixture['direction'] includes '' for exactly this case, and
    // boundariesModel's boundaryDescription() renders it badge-less.
    const knownDirections = new Set(['IN', 'OUT', 'BIDIRECTIONAL', 'STATUS_ONLY', '']);
    for (const b of allBoundaries) {
      assert.ok(knownDirections.has(b.direction), `unexpected direction "${b.direction}" on ${b.id}`);
    }
    const readBoundary = allBoundaries.find((b) => b.category === 'READ' && b.key === 'ORDER-FILE');
    assert.ok(readBoundary, 'expected a READ ORDER-FILE boundary node');
    assert.equal(readBoundary!.direction, 'IN');
    assert.equal(readBoundary!.paragraph, 'READ-ORDERS');

    const callBoundary = allBoundaries.find((b) => b.category === 'CALL' && b.key === 'LOGALERT');
    assert.ok(callBoundary, 'expected a CALL LOGALERT boundary node');
    assert.equal(callBoundary!.direction, '');
  });

  it('(c) buildGenerateArgs + runGenerate, run for real with a READ placeholder, downgrades the MOCK body and recomputes the VERIFY count', async () => {
    // boundaryId() format is `${paragraph}/${category}:${key}` --
    // READ ORDER-FILE lives in READ-ORDERS per (b) above.
    const readId = 'READ-ORDERS/READ:ORDER-FILE';
    const model = buildViewModel(bundle, { [readId]: false });
    const placeholders = placeholderArgs(model);
    assert.deepEqual(placeholders, ['--placeholder', 'READ:ORDER-FILE']);

    // MUST be a throwaway path, never resolveOutPath(cblPath) --
    // examples/fixtures/FIXTUREDEMO.cut in the mocky-mock worktree is a
    // checked-in golden with its own byte-identical regression test
    // (tests/regression/test_fixturedemo_golden.py over there); writing
    // through this test would corrupt that suite.
    const outPath = path.join(tmpDir, 'FIXTUREDEMO.cut');
    const options = {
      cblPath,
      outPath,
      scenarios: 'happy' as const,
      seed: 7,
      copybookPaths: [],
      placeholders,
    };

    assert.deepEqual(buildGenerateArgs(options), [
      'generate', cblPath, '--with-data', '--scenarios', 'happy', '--seed', '7',
      '--placeholder', 'READ:ORDER-FILE', '-o', outPath,
    ]);

    const result = await runGenerate(runner, 'mockymock', options);
    // The placeholder DID match a real READ fixture -- no mismatch warning.
    assert.deepEqual(result.warnings, []);
    // FIXTUREDEMO's own GOBACK is routine, informational stdout, captured
    // as a "note" rather than a warning (see generateCut.ts).
    assert.equal(result.notes.length, 2);
    assert.match(result.notes[0], /STOP RUN\/GOBACK site\(s\) detected/);
    assert.match(result.notes[1], /GOBACK in paragraph 'MAIN-PROCESS'/);

    assert.ok(fs.existsSync(outPath), 'expected runGenerate to write the .cut file');
    const cutText = fs.readFileSync(outPath, 'utf8');
    assert.match(cutText, /MOCK READ ORDER-FILE/);
    // Downgraded body: the terminal AT-END moves, not the full row-by-row
    // EVALUATE ladder a non-placeholder generate would produce.
    assert.match(cutText, /MOVE "Y" TO WS-EOF/);
    assert.doesNotMatch(cutText, /UT-READ-ORDER-FILE-TALLY/);
    // Recomputed VERIFY count: the placeholder collapses the read loop
    // (11 calls on a non-placeholder run -- 10 rows + 1 terminal EOF read,
    // confirmed against the checked-in FIXTUREDEMO.cut golden) down to a
    // single terminal read.
    assert.match(cutText, /VERIFY READ ORDER-FILE WAS CALLED 1 TIMES/);
  });

  it('(d) fetchBundle rejects a deliberately bad program with a BundleError carrying the CLI\'s stderr message', async () => {
    const badPath = path.join(tmpDir, 'BAD.cbl');
    fs.writeFileSync(badPath, 'THIS IS NOT COBOL AT ALL\n1 2 3 garbage %%%%\n');
    await assert.rejects(
      fetchBundle(runner, 'mockymock', badPath, { scenarios: 'happy', copybookPaths: [] }),
      (e: unknown) => {
        assert.ok(e instanceof BundleError, 'expected a BundleError');
        assert.match((e as BundleError).message, /parse error\(s\)/);
        return true;
      }
    );
  });

  it('(e) runGenerate rejects the same bad program too, via a differently-shaped stdout-only failure message', async () => {
    // `mockymock fixtures` puts its parse-error header on STDERR (case (d)
    // above); `mockymock generate --with-data` goes through a different
    // failure path (cobol-parser's Python API directly) and puts its own
    // differently-worded header on STDOUT instead, with an empty stderr.
    // pickErrorMessage()'s "refused (" / "N parse error(s):" stdout regex
    // does not match this exact wording ("... did not produce a program
    // AST: [ParseError(...), ...]"), but its fallback -- stderr empty ->
    // first non-empty stdout line -- still surfaces the right message. This
    // confirms that fallback path against the real CLI, not just a
    // hand-written string.
    const badPath = path.join(tmpDir, 'BAD2.cbl');
    fs.writeFileSync(badPath, 'THIS IS NOT COBOL AT ALL\n1 2 3 garbage %%%%\n');
    const outPath = path.join(tmpDir, 'BAD2.cut');
    await assert.rejects(
      runGenerate(runner, 'mockymock', {
        cblPath: badPath, outPath, scenarios: 'happy', copybookPaths: [], placeholders: [],
      }),
      (e: unknown) => {
        assert.ok(e instanceof BundleError, 'expected a BundleError');
        assert.match((e as BundleError).message, /did not produce a program AST/);
        return true;
      }
    );
  });

  it('(f) fetchBundle accepts a real --copybook-path and actually resolves the COPY, not just tolerates the flag', async () => {
    // FIXTUREDEMO.cbl above needs no --copybook-path (its only EXEC SQL
    // INCLUDE resolves to nothing this program reads a layout from), so it
    // can't prove copybookPaths actually gets threaded through and used by
    // the real CLI -- every other case in this file passes copybookPaths:
    // []. mocky-mock's own examples/cpyproc/ is a COPY-based program whose
    // README says it needs exactly this flag.
    const cpyprocBundle = await fetchBundle(runner, 'mockymock', 'examples/cpyproc/CPYPROC.cbl', {
      scenarios: 'happy',
      copybookPaths: ['examples/cpyproc/copybooks'],
      seed: 7,
    });
    assert.equal(cpyprocBundle.bundle_version, 1);
    assert.equal(cpyprocBundle.program_name, 'CPYPROC');
    // If the copybook path were wrong or ignored, the COPY'd fields
    // wouldn't resolve and would show up here instead of silently
    // vanishing -- an empty list is the CLI actually having found and
    // expanded the copybook, not merely accepting the flag.
    assert.deepEqual(cpyprocBundle.unresolved, []);
    const callFixture = cpyprocBundle.scenarios.flatMap((s) => s.fixtures).find((f) => f.category === 'CALL');
    assert.ok(callFixture, 'expected a CALL fixture in CPYPROC');
    // The copybook-defined fields actually made it into the resolved layout.
    assert.deepEqual(
      callFixture!.layout.map((f) => f.name),
      ['ORD-AMOUNT', 'WS-DISCOUNT-PCT']
    );
  });

  it('(g) buildViewModel recovers WRITE and SQL-mutation boundaries from a real bundle as output-only, and leaves a bare CALL-arg stub alone', async () => {
    // examples/invupdt/INVUPDT.cbl writes a report record and issues a SQL
    // UPDATE -- both OUT-direction, so (confirmed against a real run) they
    // never appear in `fixtures` at all; each surfaces only as a
    // kind="stub" Expectation with ref="CATEGORY:KEY". It also CALLs MQPUT
    // with a bidirectional MQ-COMPCODE argument, whose own stub is keyed by
    // the bare argument name (no colon) -- that one must NOT become an
    // outputOnly entry, since there's no category/key to attribute it to.
    const invupdtBundle = await fetchBundle(runner, 'mockymock', 'examples/invupdt/INVUPDT.cbl', {
      scenarios: 'happy',
      copybookPaths: [],
      seed: 7,
    });
    const fixtureKeys = invupdtBundle.scenarios.flatMap((s) => s.fixtures).map((f) => `${f.category}:${f.key}`);
    assert.ok(!fixtureKeys.includes('WRITE:RPT-REC'), 'WRITE:RPT-REC must not appear as a fixture');
    assert.ok(!fixtureKeys.includes('SQL:UPDATE'), 'SQL:UPDATE must not appear as a fixture');

    const model = buildViewModel(invupdtBundle, {});
    const outputOnlyIds = model.outputOnly.map((b) => b.id);
    assert.ok(outputOnlyIds.includes('output:WRITE:RPT-REC'), 'expected WRITE:RPT-REC recovered as output-only');
    assert.ok(outputOnlyIds.includes('output:SQL:UPDATE'), 'expected SQL:UPDATE recovered as output-only');
    // The bidirectional CALL:MQPUT boundary itself IS a real fixture (it has
    // other, non-OUT arguments) -- confirm it's a normal checkbox node, not
    // also duplicated into outputOnly.
    assert.ok(fixtureKeys.includes('CALL:MQPUT'), 'expected CALL:MQPUT as a real fixture');
    assert.ok(!outputOnlyIds.some((id) => id.includes('MQPUT')), 'CALL:MQPUT must not also appear in outputOnly');
    assert.equal(model.outputOnly.length, 2, `expected exactly 2 output-only entries, got: ${outputOnlyIds}`);
  });
});
