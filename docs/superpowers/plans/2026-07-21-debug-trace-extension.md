# VS Code Debug (Execution Trace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Debug (Execution Trace)" Test Explorer profile that runs one `.cut` TESTCASE with `mockymock run --trace-json`, then shows the executed path through the original `.cbl` and the mocks that fired, in order, in the Test Results output panel.

**Architecture:** A third `vscode.TestRunProfileKind.Debug` profile on the existing `mockymock` TestController (alongside Run and Coverage). It requires the selection to resolve to exactly one test case — the sibling `mocky-mock` CLI itself refuses `--trace` otherwise, since the suite compiles as one binary and the trace file carries no per-case markers. Before invoking the CLI, a preflight (`mockymock run --help`, checking for `--trace-json` in the printed help) detects an installed CLI that predates the flag and degrades with a clear message instead of letting an "unrecognized arguments" argparse failure masquerade as a test failure. The trace JSON (`report/trace.py`'s versioned contract on the `mocky-mock` side) is parsed by a new pure module and rendered into the same output channel `formatRunHeader`/`formatRunTrailer` already use — no new UI surface (webview/decorations); this extension has none today and the existing Coverage profile's gutter highlighting is VS Code's own Test Coverage API, which has no equivalent for "ordered execution path", so that stays out of scope for this pass.

**Tech Stack:** TypeScript, VS Code Testing API, mocha (`npm run test:unit`, no VS Code host required for anything except `testController.ts` itself).

## Global Constraints

- **The trace-JSON contract is defined by the sibling `mocky-mock` repo** at `mockymock/report/trace.py` (`TRACE_JSON_VERSION = 1`), branch `claude/debug-function-e2596f`. This plan's manual verification step needs that branch's CLI installed — see Task 4's verification note.
- **Debug requires exactly one resolved test case.** Mirrors the CLI's own `--trace` refusal (`run --trace` without exactly one `--case` and no `--tag` exits 1) — the suite runs as a single binary and the trace file carries no case markers.
- **Parsing is tolerant, matching `jsonReport.ts`/`coverageReport.ts`**: a structurally alien document returns `null`, never throws. A missing/unparseable trace degrades to a clear message; it never fails the case's own pass/fail verdict.
- **Graceful CLI-version degradation is required**, matching `discoverSuites`'s existing fallback for `collect`. Passing an unrecognized flag makes the *entire* `mockymock run` invocation fail (argparse exit 2), so the trace flag's availability must be checked *before* it is used, not discovered by the run failing.
- Run unit tests with `npm run test:unit` (mocha via `ts-node/register`, spec `src/**/*.test.ts`, no `vscode` import needed or possible in these files). Typecheck with `npm run compile`.
- `testController.ts` has zero unit tests today (it depends on the `vscode` module, unavailable outside a running Extension Host) — this plan does not change that. Its only verification is `npm run compile` plus a manual F5 launch, exactly as every prior change to this file was verified.

---

### Task 1: Trace-JSON parser and console-style renderer

**Files:**
- Create: `src/testing/traceReport.ts`
- Test: `src/testing/traceReport.test.ts`

**Interfaces:**
- Produces:
  - `interface TracePathEntry { line: number; statement: string | null; paragraph: string | null }`
  - `interface TraceMockHit { order: number; label: string }`
  - `interface TraceReport { version: number; cutFile: string; programFile: string; caseName: string; caseLine: number | null; path: TracePathEntry[]; mocks: TraceMockHit[]; truncated: boolean }`
  - `parseTraceJson(text: string): TraceReport | null`
  - `formatTraceOutput(report: TraceReport): string` (no CRLF conversion — callers apply `toCrlf` themselves, matching every other producer in this directory)

- [ ] **Step 1: Write the failing tests**

```typescript
import * as assert from 'assert';
import { parseTraceJson, formatTraceOutput, TraceReport } from './traceReport';

const SAMPLE = JSON.stringify({
  version: 1,
  cutFile: 't.cut',
  programFile: 'P.cbl',
  case: { name: 'posts a credit', line: 12 },
  path: [
    { line: 45, statement: 'MOVE' },
    { line: 88, paragraph: 'CALC-INTEREST' },
  ],
  mocks: [
    { order: 1, label: "CALL 'CUSTLOOK'" },
    { order: 2, label: 'READ ACCT-FILE' },
  ],
  truncated: false,
});

describe('parseTraceJson', () => {
  it('parses the full contract shape', () => {
    const report = parseTraceJson(SAMPLE);
    assert.ok(report);
    assert.strictEqual(report!.caseName, 'posts a credit');
    assert.strictEqual(report!.caseLine, 12);
    assert.deepStrictEqual(report!.path[0], { line: 45, statement: 'MOVE', paragraph: null });
    assert.deepStrictEqual(report!.path[1], { line: 88, statement: null, paragraph: 'CALC-INTEREST' });
    assert.deepStrictEqual(report!.mocks, [
      { order: 1, label: "CALL 'CUSTLOOK'" },
      { order: 2, label: 'READ ACCT-FILE' },
    ]);
    assert.strictEqual(report!.truncated, false);
  });

  it('returns null for malformed or alien documents', () => {
    assert.strictEqual(parseTraceJson('not json'), null);
    assert.strictEqual(parseTraceJson('{"version":1}'), null);
  });

  it('is tolerant of a missing case object', () => {
    const report = parseTraceJson(JSON.stringify({ path: [], mocks: [] }));
    assert.ok(report);
    assert.strictEqual(report!.caseName, '');
    assert.strictEqual(report!.caseLine, null);
  });

  it('skips path/mock entries missing their required fields', () => {
    const report = parseTraceJson(
      JSON.stringify({
        path: [{ line: 1, statement: 'MOVE' }, { statement: 'no line' }],
        mocks: [{ order: 1, label: 'ok' }, { label: 'no order' }],
      })
    );
    assert.ok(report);
    assert.strictEqual(report!.path.length, 1);
    assert.strictEqual(report!.mocks.length, 1);
  });
});

describe('formatTraceOutput', () => {
  const report: TraceReport = {
    version: 1,
    cutFile: 't.cut',
    programFile: 'P.cbl',
    caseName: 'posts a credit',
    caseLine: 12,
    path: [{ line: 45, statement: 'MOVE', paragraph: null }],
    mocks: [{ order: 1, label: "CALL 'CUSTLOOK'" }],
    truncated: false,
  };

  it('lists mocks in order and the statement count', () => {
    const text = formatTraceOutput(report);
    assert.match(text, /posts a credit/);
    assert.match(text, /1\. CALL 'CUSTLOOK'/);
    assert.match(text, /statements executed: 1/);
  });

  it('says so when no mocks fired', () => {
    const text = formatTraceOutput({ ...report, mocks: [] });
    assert.match(text, /mocks fired: none/);
  });

  it('flags truncation', () => {
    const text = formatTraceOutput({ ...report, truncated: true });
    assert.match(text, /truncated/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --grep "parseTraceJson|formatTraceOutput"`
Expected: FAIL — `Cannot find module './traceReport'`.

- [ ] **Step 3: Write the implementation**

```typescript
// Parses `mockymock run --trace-json` output (see the sibling mocky-mock
// repo's docs/2026-07-21-debug-trace-design.md). Two channels compose: the
// executed path (remapped onto the ORIGINAL .cbl's lines -- splicer
// insertions excluded) and the mock firing timeline. They cannot come from
// one source: the mock dispatch blocks ARE the splicer-inserted lines the
// path's remap excludes. Tolerant parsing mirrors jsonReport.ts/
// coverageReport.ts: a structurally alien document returns null and the
// caller degrades, rather than throwing.

export interface TracePathEntry {
  line: number;
  statement: string | null;
  paragraph: string | null;
}

export interface TraceMockHit {
  order: number;
  label: string;
}

export interface TraceReport {
  version: number;
  cutFile: string;
  programFile: string;
  caseName: string;
  caseLine: number | null;
  path: TracePathEntry[];
  mocks: TraceMockHit[];
  truncated: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseTraceJson(text: string): TraceReport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof doc !== 'object' || doc === null) return null;
  const root = doc as Record<string, unknown>;
  if (!Array.isArray(root.path) || !Array.isArray(root.mocks)) return null;

  const caseRaw = (root.case ?? {}) as Record<string, unknown>;

  const path: TracePathEntry[] = [];
  for (const entry of root.path) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const line = asNumberOrNull(item.line);
    if (line === null) continue;
    path.push({ line, statement: asString(item.statement), paragraph: asString(item.paragraph) });
  }

  const mocks: TraceMockHit[] = [];
  for (const entry of root.mocks) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const order = asNumberOrNull(item.order);
    const label = asString(item.label);
    if (order === null || label === null) continue;
    mocks.push({ order, label });
  }

  return {
    version: asNumberOrNull(root.version) ?? 0,
    cutFile: asString(root.cutFile) ?? '',
    programFile: asString(root.programFile) ?? '',
    caseName: asString(caseRaw.name) ?? '',
    caseLine: asNumberOrNull(caseRaw.line),
    path,
    mocks,
    truncated: root.truncated === true,
  };
}

// Rendered into the Test Results output panel next to the pass/fail line --
// the same idiom formatRunHeader/formatRunTrailer already use in
// outputFormatting.ts. No custom webview or gutter decorations: this
// extension has none today, and VS Code's Test Coverage API (used by the
// Coverage profile) has no equivalent concept for an ORDERED execution
// path, so that stays out of scope here. CRLF conversion is the caller's
// job, matching every other producer in this directory.
export function formatTraceOutput(report: TraceReport): string {
  const lines: string[] = [`--- execution trace: ${report.caseName} ---`];
  if (report.mocks.length) {
    lines.push('mocks fired, in order:');
    for (const mock of report.mocks) lines.push(`  ${mock.order}. ${mock.label}`);
  } else {
    lines.push('mocks fired: none');
  }
  lines.push(`statements executed: ${report.path.length}`);
  if (report.truncated) {
    lines.push('(path truncated -- see mockymock run --trace for the full listing)');
  }
  for (const entry of report.path) {
    const what = entry.paragraph !== null ? `paragraph  ${entry.paragraph}` : `           ${entry.statement ?? ''}`;
    lines.push(`  line ${String(entry.line).padStart(6)}  ${what}`);
  }
  return lines.join('\n') + '\n';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --grep "parseTraceJson|formatTraceOutput"`
Expected: PASS, 7 passing.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run compile`
Expected: no errors.

```bash
git add src/testing/traceReport.ts src/testing/traceReport.test.ts
git commit -m "feat(testing): add trace-JSON parser and console-style renderer"
```

---

### Task 2: CLI capability preflight for `--trace-json`

**Files:**
- Modify: `src/environment/checks.ts`
- Test: `src/environment/checks.test.ts`

**Interfaces:**
- Consumes: `CommandRunner` (from `./commandRunner`, already imported in `checks.ts`).
- Produces: `supportsTraceFlag(run: CommandRunner, executablePath: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Append to `src/environment/checks.test.ts` (the file already imports `CommandResult`, `CommandRunner`, and defines `fakeRunner` — reuse both):

```typescript
import { supportsTraceFlag } from './checks';

describe('supportsTraceFlag', () => {
  it('returns true when --help lists --trace-json', async () => {
    const ok = await supportsTraceFlag(
      fakeRunner({ code: 0, stdout: 'usage: mockymock run ...\n  --trace-json PATH  ...\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, true);
  });

  it('returns false for a CLI predating the flag', async () => {
    const ok = await supportsTraceFlag(
      fakeRunner({ code: 0, stdout: 'usage: mockymock run ...\n  --coverage-json PATH  ...\n', stderr: '' }),
      'mockymock'
    );
    assert.strictEqual(ok, false);
  });

  it('returns false when the command cannot be run at all', async () => {
    const ok = await supportsTraceFlag(fakeRunner({ code: -1, stdout: '', stderr: 'command not found' }), 'mockymock');
    assert.strictEqual(ok, false);
  });
});
```

(Add the `supportsTraceFlag` name to the existing `import { ... } from './checks'` at the top of the file instead of a second import statement, if you're editing rather than appending — either compiles identically.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --grep supportsTraceFlag`
Expected: FAIL — `supportsTraceFlag is not a function` / import error.

- [ ] **Step 3: Implement**

Add to `src/environment/checks.ts`, after `checkCommandAvailable`:

```typescript
// `mockymock run --trace-json PATH` is a flag argparse may not recognize on
// an older installed CLI -- and an unrecognized flag fails the ENTIRE `run`
// invocation (argparse exit 2), not just that flag. Probing with `--help`
// first is cheap and always succeeds regardless of the command's OTHER
// required arguments (argparse's --help short-circuits before validating
// `program`/`--cut`), so this is a safe capability check to run before ever
// using the flag for real -- exactly the discoverSuites-style "check first,
// degrade gracefully" pattern, applied to a flag instead of a subcommand.
export async function supportsTraceFlag(run: CommandRunner, executablePath: string): Promise<boolean> {
  const result = await run(executablePath, ['run', '--help']);
  return result.code === 0 && result.stdout.includes('--trace-json');
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit -- --grep supportsTraceFlag`
Expected: PASS, 3 passing.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run compile`

```bash
git add src/environment/checks.ts src/environment/checks.test.ts
git commit -m "feat(environment): add supportsTraceFlag capability preflight"
```

---

### Task 3: `--trace-json` plumbing in the run-args builder and runner

**Files:**
- Modify: `src/testing/mockymockRunner.ts`
- Test: `src/testing/mockymockRunner.test.ts`

**Interfaces:**
- Produces: `RunArgExtras.traceJsonPath?: string`, `RunSuiteOptions.traceJsonPath?: string`, `MockymockRunResult.traceJson: string | null`.

- [ ] **Step 1: Write the failing tests**

Append to `src/testing/mockymockRunner.test.ts`:

```typescript
describe('buildRunArgs trace', () => {
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
});

describe('runSuite trace', () => {
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
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test:unit -- --grep "trace"`
Expected: FAIL — `traceJsonPath` does not exist on the options type (TypeScript compile error surfaced through ts-node), or `traceJson` is `undefined` not matching the assertion.

- [ ] **Step 3: Implement**

In `src/testing/mockymockRunner.ts`, update `RunArgExtras`:

```typescript
export interface RunArgExtras {
  jsonReportPath?: string;
  coverageJsonPath?: string;
  traceJsonPath?: string;
  caseNames?: string[];
}
```

Update `buildRunArgs` (insert right after the `coverageJsonPath` block, before the `caseNames` loop):

```typescript
  if (extras.coverageJsonPath) {
    args.push('--coverage-json', extras.coverageJsonPath);
  }
  if (extras.traceJsonPath) {
    args.push('--trace-json', extras.traceJsonPath);
  }
  for (const name of extras.caseNames ?? []) {
```

Update `RunSuiteOptions`:

```typescript
export interface RunSuiteOptions {
  executablePath: string;
  cblPath: string;
  cutPath: string;
  junitXmlPath: string;
  copybookPaths: string[];
  /** Temp path for --json-report; when set, the result carries its content. */
  jsonReportPath?: string;
  /** Temp path for --coverage-json; when set, the result carries its content. */
  coverageJsonPath?: string;
  /** Temp path for --trace-json; when set, the result carries its content. */
  traceJsonPath?: string;
  /** Restrict the run to these TESTCASE names (mockymock run --case ...). */
  caseNames?: string[];
}
```

Update `MockymockRunResult`:

```typescript
export interface MockymockRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  junitXml: string | null;
  jsonReport: string | null;
  coverageJson: string | null;
  traceJson: string | null;
}
```

Update `runSuite`'s body:

```typescript
export async function runSuite(
  options: RunSuiteOptions,
  run: CommandRunner,
  readFileIfExists: (path: string) => Promise<string | null>,
  onOutput?: OutputListener,
  signal?: AbortSignal
): Promise<MockymockRunResult> {
  const args = buildRunArgs(options.cblPath, options.cutPath, options.junitXmlPath, options.copybookPaths, {
    jsonReportPath: options.jsonReportPath,
    coverageJsonPath: options.coverageJsonPath,
    traceJsonPath: options.traceJsonPath,
    caseNames: options.caseNames,
  });
  const result = await run(options.executablePath, args, onOutput, signal);
  const junitXml = await readFileIfExists(options.junitXmlPath);
  const jsonReport = options.jsonReportPath ? await readFileIfExists(options.jsonReportPath) : null;
  const coverageJson = options.coverageJsonPath ? await readFileIfExists(options.coverageJsonPath) : null;
  const traceJson = options.traceJsonPath ? await readFileIfExists(options.traceJsonPath) : null;
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, junitXml, jsonReport, coverageJson, traceJson };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS, full suite (existing `mockymockRunner.test.ts` tests plus the 2 new ones), no regressions.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run compile`

```bash
git add src/testing/mockymockRunner.ts src/testing/mockymockRunner.test.ts
git commit -m "feat(testing): plumb --trace-json through buildRunArgs and runSuite"
```

---

### Task 4: Debug (Execution Trace) profile on the Test Controller

**Files:**
- Modify: `src/testing/testController.ts`

**Interfaces:**
- Consumes: `parseTraceJson`, `formatTraceOutput` (Task 1); `supportsTraceFlag` (Task 2); the extended `runSuite`/`RunSuiteOptions`/`MockymockRunResult` (Task 3).
- No new exports — this task only registers a third run profile, and extracts one existing closure into a top-level function for reuse.

No new unit tests: this file already has zero (it requires the `vscode` module, which mocha's `ts-node/register` cannot resolve outside a running Extension Host — the whole file's coverage today is `npm run compile` plus manual verification, and this task does not change that precedent).

- [ ] **Step 1: Extract `messagesFor` into a top-level, reusable function**

`runOneFile` currently defines `messagesFor` as an inline closure over `fileItem` (around line 349). Extract it above `activateTestController` so both `runOneFile` and the new debug handler can call it without duplicating the expected/actual diff logic:

```typescript
function messagesForOutcome(outcome: CaseOutcome & { kind: 'failed' }, cutUri: vscode.Uri): vscode.TestMessage[] {
  if (!outcome.details?.length) return [new vscode.TestMessage(outcome.message)];
  return outcome.details.map((detail) => {
    const message =
      detail.expected !== null && detail.actual !== null
        ? vscode.TestMessage.diff(detail.message, detail.expected, detail.actual)
        : new vscode.TestMessage(detail.message);
    if (detail.line !== null) {
      // JSON report lines are 1-based; editor positions are 0-based.
      message.location = new vscode.Location(cutUri, new vscode.Position(detail.line - 1, 0));
    }
    return message;
  });
}
```

Delete the old inline `messagesFor` function inside `runOneFile`, and change its one call site from:

```typescript
          run.failed(caseItem, messagesFor(outcome));
```

to:

```typescript
          run.failed(caseItem, messagesForOutcome(outcome, fileItem.uri!));
```

- [ ] **Step 2: Add the imports this task needs**

At the top of `testController.ts`, alongside the existing imports:

```typescript
import { parseJsonReport, mapJsonReport } from './jsonReport';
```

is already present — leave it. Add two new import lines near the existing `parseCoverageJson`/`resolveExecutablePath` imports:

```typescript
import { parseTraceJson, formatTraceOutput } from './traceReport';
```

and change:

```typescript
import { resolveExecutablePath } from '../environment/checks';
```

to:

```typescript
import { resolveExecutablePath, supportsTraceFlag } from '../environment/checks';
```

- [ ] **Step 3: Add the debug-trace handler**

Insert this new function inside `activateTestController`, directly after `runOneFile` (it is a sibling closure over the same `controller`, `environmentManager`, `fileItems`-derived helpers, and `runCommand`):

```typescript
  // "Debug (Execution Trace)": runs exactly ONE selected test case with
  // --trace-json and renders the executed path + mock timeline into the
  // Test Results panel. Mirrors runOneFile's plumbing (temp files, output
  // streaming, pass/fail mapping) but scoped to a single case, because the
  // sibling mockymock CLI itself refuses --trace unless exactly one case is
  // selected -- the suite compiles as a single binary and the trace file
  // carries no per-case markers, so an unscoped trace cannot be attributed.
  async function runDebugTrace(
    run: vscode.TestRun,
    token: vscode.CancellationToken,
    plans: FilePlan[]
  ) {
    const allSelected = plans.flatMap(selectedCaseItems);
    if (allSelected.length !== 1) {
      const message =
        'mockymock: "Debug (Execution Trace)" needs exactly one selected test case -- ' +
        'the suite runs as a single binary, so an unscoped trace cannot be attributed to ' +
        'one case. Select a single TESTCASE and try again.';
      for (const item of allSelected) {
        run.started(item);
        run.errored(item, new vscode.TestMessage(message));
      }
      return;
    }

    const [caseItem] = allSelected;
    const plan = plans.find((p) => selectedCaseItems(p).includes(caseItem))!;
    run.started(caseItem);

    const ready = await environmentManager.ensureReady();
    if (!ready.ok) {
      run.appendOutput(toCrlf(`${ready.message}\n`), undefined, caseItem);
      run.errored(caseItem, new vscode.TestMessage(ready.message));
      return;
    }
    if (token.isCancellationRequested) {
      run.skipped(caseItem);
      return;
    }

    const cutUri = plan.fileItem.uri!;
    const cutPath = cutUri.fsPath;
    const cblPath = resolveCblPath(cutPath);
    const executablePath = resolveConfiguredExecutable(cutUri);

    const supportsTrace = await supportsTraceFlag(runCommand, executablePath);
    if (!supportsTrace) {
      const message =
        `mockymock at "${executablePath}" is too old to support execution tracing ` +
        '(needs --trace-json). Upgrade mockymock and try again.';
      run.appendOutput(toCrlf(`${message}\n`), undefined, caseItem);
      run.errored(caseItem, new vscode.TestMessage(message));
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(cutUri);
    const config = vscode.workspace.getConfiguration('mockymock', cutUri);
    const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
      workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
    );

    const stamp = `mockymock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const junitXmlPath = path.join(os.tmpdir(), `${stamp}.xml`);
    const jsonReportPath = path.join(os.tmpdir(), `${stamp}.json`);
    const traceJsonPath = path.join(os.tmpdir(), `${stamp}-trace.json`);

    const abort = new AbortController();
    const cancelListener = token.onCancellationRequested(() => abort.abort());

    run.appendOutput(formatRunHeader(path.basename(cutPath)), undefined, caseItem);
    let result;
    try {
      result = await runSuite(
        {
          executablePath,
          cblPath,
          cutPath,
          junitXmlPath,
          copybookPaths,
          jsonReportPath,
          traceJsonPath,
          caseNames: [caseItem.label],
        },
        runCommand,
        async (p) => {
          try {
            return await fs.readFile(p, 'utf8');
          } catch {
            return null;
          }
        },
        createOutputStreamer((text) => run.appendOutput(text, undefined, caseItem)),
        abort.signal
      );
    } finally {
      cancelListener.dispose();
    }
    run.appendOutput(formatRunTrailer(result.exitCode), undefined, caseItem);
    await fs.unlink(junitXmlPath).catch(() => undefined);
    await fs.unlink(jsonReportPath).catch(() => undefined);
    await fs.unlink(traceJsonPath).catch(() => undefined);

    if (token.isCancellationRequested) {
      run.skipped(caseItem);
      return;
    }

    const processFailureMessage = `mockymock run did not produce results:\n${result.stderr || result.stdout}`;
    const jsonReport = result.jsonReport ? parseJsonReport(result.jsonReport) : null;
    const outcomes = jsonReport
      ? mapJsonReport([caseItem.label], jsonReport, processFailureMessage)
      : mapResults(
          [caseItem.label],
          result.junitXml ? parseJUnitXml(result.junitXml) : null,
          result.junitXml ? undefined : processFailureMessage
        );
    const outcome = outcomes.get(caseItem.label);
    if (!outcome || outcome.kind === 'passed') {
      run.passed(caseItem);
    } else if (outcome.kind === 'failed') {
      run.failed(caseItem, messagesForOutcome(outcome, cutUri));
    } else {
      run.errored(caseItem, new vscode.TestMessage(outcome.message));
    }

    if (result.traceJson) {
      const trace = parseTraceJson(result.traceJson);
      if (trace) {
        run.appendOutput(toCrlf(formatTraceOutput(trace)), undefined, caseItem);
      } else {
        run.appendOutput(toCrlf('mockymock: execution trace could not be parsed\n'), undefined, caseItem);
      }
    } else {
      run.appendOutput(toCrlf('mockymock: no execution trace produced\n'), undefined, caseItem);
    }
  }
```

- [ ] **Step 4: Register the profile**

After the existing `coverageProfile` block near the end of `activateTestController` (just before `return controller;`), add:

```typescript
  const debugProfile = controller.createRunProfile(
    'Debug (Execution Trace)',
    vscode.TestRunProfileKind.Debug,
    async (request, token) => {
      const run = controller.createTestRun(request);
      try {
        await runDebugTrace(run, token, planRuns(request));
      } finally {
        run.end();
      }
    },
    true
  );
  context.subscriptions.push(debugProfile);
```

- [ ] **Step 5: Typecheck**

Run: `npm run compile`
Expected: no errors. (This is the only automated check available for this file — see the constraint above.)

- [ ] **Step 6: Manual verification**

This step cannot be automated (no VS Code UI driver is available in this environment) and mirrors how every prior Test Explorer feature in this extension was verified. **First**, make sure the `mockymock` CLI on `PATH` (or `mockymock.executablePath`) is built from the `mocky-mock` branch that has `--trace-json` (`claude/debug-function-e2596f` as of this writing) — a stale globally-`uv tool install`-ed CLI is a known, previously-hit gotcha (see this project's OKF/memory notes) and would make `supportsTraceFlag` correctly, but confusingly, report "too old."

1. `npm run compile`, then press F5 to launch the Extension Development Host against a workspace containing `.cut` files with mocks (`../mocky-mock/examples/real-world/ACCTPRG` is the richest fixture — 5 mocks fire in the first case).
2. Open the Test Explorer view, expand `ACCTPRG.cut`.
3. Confirm a debug (bug) icon now appears next to a single TESTCASE, its suite, and its file, alongside the existing Run/Coverage icons.
4. Click the debug icon on exactly one TESTCASE. Confirm: the Test Results panel shows the normal run header/trailer, the case goes green (or red, matching a plain Run of the same case), and an `--- execution trace: <case name> ---` block appears listing the mocks fired in order and the executed statement path.
5. Click the debug icon on the whole file (multiple cases). Confirm every selected case errors with the "needs exactly one selected test case" message and no `mockymock` process is spawned (no compile/run output appears).
6. Temporarily set `mockymock.executablePath` to a build/copy that predates `--trace-json` (or `git stash` the CLI branch's trace commits and reinstall), repeat step 4, and confirm the case errors with the "too old to support execution tracing" message rather than a confusing generic failure.

- [ ] **Step 7: Commit**

```bash
git add src/testing/testController.ts
git commit -m "feat(testing): add Debug (Execution Trace) test run profile"
```

---

### Task 5: Documentation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a feature bullet**

In the feature bullet list (the block containing "Coverage profile.", "Continuous run.", etc.), add:

```markdown
- **Debug (Execution Trace).** The debug icon on a single `TESTCASE` runs
  `mockymock run --trace-json` and prints the executed path through your
  `.cbl` plus the mocks that fired, in order, into the Test Results panel.
  Needs exactly one selected case (the CLI itself refuses an unscoped
  trace) and a `mockymock` new enough for `--trace-json` — an older CLI
  degrades to a clear "too old" message instead of a confusing generic
  failure.
```

- [ ] **Step 2: Update the Requirements section's CLI-version note**

Find:

```markdown
- The `mockymock` CLI (auto-installed via `uv` on first run if missing).
  Single-test runs, tags, lint, JSON reports, and coverage mapping need a
  CLI new enough to have `collect`/`lint`/`--case`/`--json-report`/
  `--coverage-json`; older CLIs degrade gracefully (whole-file runs, JUnit
  results, regex discovery).
```

Replace with:

```markdown
- The `mockymock` CLI (auto-installed via `uv` on first run if missing).
  Single-test runs, tags, lint, JSON reports, and coverage mapping need a
  CLI new enough to have `collect`/`lint`/`--case`/`--json-report`/
  `--coverage-json`; older CLIs degrade gracefully (whole-file runs, JUnit
  results, regex discovery). Debug (Execution Trace) additionally needs
  `--trace-json`; an older CLI degrades to a clear message on the one
  affected profile rather than failing anything else.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document Debug (Execution Trace) profile"
```

---

## Self-Review

**Spec coverage:** Debug profile registration + single-case gate → Task 4. Preflight/graceful degradation → Task 2 (check) + Task 4 (use). Trace-JSON contract consumption → Task 1. `--trace-json` plumbing through the existing runner → Task 3. Rendering into the existing output-channel idiom (no new UI surface) → Task 1 (`formatTraceOutput`) + Task 4 (calls it). Documentation → Task 5. Manual verification, since this file has no automated test path → Task 4 Step 6, including the specific stale-CLI gotcha this project has hit before.

**Placeholder scan:** No TBD/TODO markers; every step has literal code or an exact command with expected output.

**Type consistency:** `TraceReport`/`TracePathEntry`/`TraceMockHit` (Task 1) are the exact shapes `runDebugTrace` (Task 4) consumes via `parseTraceJson`/`formatTraceOutput`. `RunSuiteOptions.traceJsonPath` / `MockymockRunResult.traceJson` (Task 3) match the field names `runDebugTrace` reads (`traceJsonPath` passed in, `result.traceJson` read back). `supportsTraceFlag(run: CommandRunner, executablePath: string): Promise<boolean>` (Task 2) matches its one call site's arguments (`runCommand, executablePath`) in Task 4. `messagesForOutcome(outcome, cutUri)` (Task 4 Step 1) matches both call sites (the refactored one in `runOneFile`, and the new one in `runDebugTrace`).

**Known scope boundary, stated rather than hidden:** no gutter/decoration highlighting of the executed path in the editor — VS Code's Test Coverage API (used by the existing Coverage profile) has no equivalent for an *ordered* path, and this extension has no webview infrastructure to build a bespoke one. The Test Results output panel rendering is the v1 bar; a richer visual view is a candidate future increment, not built here.
