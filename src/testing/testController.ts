// src/testing/testController.ts
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import {
  parseCutFile,
  resolveCblPath,
  isExcludedCutPath,
  cutSuitesFromCollectJson,
  CutSuite,
  CUT_DISCOVERY_EXCLUDE_GLOB,
} from '../discovery/cutDiscovery';
import { parseJUnitXml } from './junitParser';
import { mapResults, unattributedFailures, CaseOutcome, UnattributedFailure } from './resultMapper';
import { parseJsonReport, mapJsonReport } from './jsonReport';
import { parseCoverageJson } from './coverageReport';
import { parseTraceJson, formatTraceOutput } from './traceReport';
import { runSuite } from './mockymockRunner';
import { parseMutationJson, survivorsOf, MutantEntry } from './mutationReport';
import { runMutate } from './mutationRunner';
import { runCommand } from '../environment/commandRunner';
import { EnvironmentManager } from '../environment/environmentManager';
import { resolveExecutablePath, supportsTraceFlag, supportsDebugCommand, supportsMutateCommand } from '../environment/checks';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { MockymockDebugConfiguration, buildLintArgs } from '../debug/debugArgs';
import { evaluateLintResult } from '../debug/lintGate';
import { toCrlf, formatRunHeader, formatRunTrailer, createOutputStreamer } from './outputFormatting';

interface FilePlan {
  fileItem: vscode.TestItem;
  /**
   * null = run the whole file (no --case flags, identical to a classic run).
   * Otherwise the actual selected TestItems -- item identity, not labels:
   * two suites in one file can each hold a same-named TESTCASE, and a
   * label-keyed plan would silently select (and mark) both. The CLI's
   * --case flags and the run report are still name-keyed, so a duplicate
   * name can't be disambiguated at execution time -- but the UI must only
   * ever touch the items the user actually selected.
   */
  caseItems: vscode.TestItem[] | null;
}

function messagesForOutcome(outcome: CaseOutcome & { kind: 'failed' }, cutUri: vscode.Uri): vscode.TestMessage[] {
  if (!outcome.details?.length) return [new vscode.TestMessage(outcome.message)];
  return outcome.details.map((detail) => {
    const message =
      detail.expected !== null && detail.actual !== null
        ? vscode.TestMessage.diff(detail.message, detail.expected, detail.actual)
        : new vscode.TestMessage(detail.message);
    if (detail.line !== null) {
      // JSON report lines are 1-based; editor positions are 0-based. Clamped
      // because vscode.Position throws IllegalArgument on a negative line --
      // a single "line": 0 in a report must not error out the whole file.
      message.location = new vscode.Location(cutUri, new vscode.Position(Math.max(0, detail.line - 1), 0));
    }
    return message;
  });
}

export function activateTestController(
  context: vscode.ExtensionContext,
  environmentManager: EnvironmentManager
): vscode.TestController {
  const controller = vscode.tests.createTestController('mockymock', 'mockymock');
  context.subscriptions.push(controller);

  const fileItems = new Map<string, vscode.TestItem>();
  const testTags = new Map<string, vscode.TestTag>();
  // FileCoverage -> per-line detail, filled during a Coverage-profile run and
  // served back from loadDetailedCoverage. WeakMap so a finished run's
  // coverage objects don't pin their details forever.
  const coverageDetails = new WeakMap<vscode.FileCoverage, vscode.StatementCoverage[]>();

  // Surviving mutants from the most recent "Mutation Test" run, painted as
  // warnings on the ORIGINAL .cbl. Any edit to a flagged file clears its
  // entries wholesale: mutant line numbers are positions in the file as it
  // was when the run started, and one keystroke can shift all of them.
  const mutationDiagnostics = vscode.languages.createDiagnosticCollection('mockymock-mutation');
  context.subscriptions.push(mutationDiagnostics);
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (mutationDiagnostics.has(e.document.uri)) mutationDiagnostics.delete(e.document.uri);
    })
  );

  function survivorDiagnostic(m: MutantEntry): vscode.Diagnostic {
    // 1-based report line -> 0-based editor line, clamped like
    // messagesForOutcome's location so a "line": 0 can't throw.
    const line = Math.max(0, m.line - 1);
    const diagnostic = new vscode.Diagnostic(
      new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER),
      `surviving mutant [${m.operator}] ${m.description}: every test still passes when this line becomes "${m.mutated.trim()}"`,
      vscode.DiagnosticSeverity.Warning
    );
    diagnostic.source = 'mockymock mutation';
    return diagnostic;
  }

  function getTag(tag: string): vscode.TestTag {
    let existing = testTags.get(tag);
    if (!existing) {
      existing = new vscode.TestTag(tag);
      testTags.set(tag, existing);
    }
    return existing;
  }

  function resolveConfiguredExecutable(uri: vscode.Uri): string {
    return resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock', uri).get<string>('executablePath'),
      context.extensionPath
    );
  }

  // Authoritative discovery: ask the CLI itself (`mockymock collect --json`,
  // the same parser `run` uses — sees through anything the regex can't).
  // Falls back to the regex scan whenever the CLI is missing, too old for
  // `collect`, or the file doesn't parse — discovery must never require a
  // working environment just to show the tree.
  async function discoverSuites(uri: vscode.Uri, text: string): Promise<CutSuite[]> {
    const executablePath = resolveConfiguredExecutable(uri);
    const result = await runCommand(executablePath, ['collect', '--cut', uri.fsPath, '--json']);
    if (result.code === 0) {
      const suites = cutSuitesFromCollectJson(result.stdout);
      if (suites) return suites;
    }
    return parseCutFile(text);
  }

  async function discoverAndBuild(uri: vscode.Uri) {
    if (isExcludedCutPath(uri.fsPath)) return;
    let text: string;
    try {
      text = await fs.readFile(uri.fsPath, 'utf8');
    } catch {
      return;
    }
    const suites = await discoverSuites(uri, text);

    const fileItem = controller.createTestItem(uri.toString(), path.basename(uri.fsPath), uri);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    const relativeDir = path.dirname(
      workspaceFolder ? path.relative(workspaceFolder.uri.fsPath, uri.fsPath) : uri.fsPath
    );
    if (relativeDir !== '.') fileItem.description = relativeDir;
    const suiteItems = suites.map((suite) => {
      const suiteItem = controller.createTestItem(`${uri.toString()}::${suite.name}`, suite.name, uri);
      suiteItem.range = new vscode.Range(suite.line, 0, suite.line, 0);
      const caseItems = suite.cases.map((c) => {
        const caseItem = controller.createTestItem(
          `${uri.toString()}::${suite.name}::${c.name}::${c.line}`,
          c.name,
          uri
        );
        caseItem.range = new vscode.Range(c.line, 0, c.line, 0);
        if (c.tags.length) {
          caseItem.tags = c.tags.map(getTag);
        }
        return caseItem;
      });
      suiteItem.children.replace(caseItems);
      return suiteItem;
    });
    fileItem.children.replace(suiteItems);

    fileItems.set(uri.toString(), fileItem);
    controller.items.add(fileItem);
  }

  function removeFile(uri: vscode.Uri) {
    controller.items.delete(uri.toString());
    fileItems.delete(uri.toString());
  }

  // Bounded worker pool, not Promise.all over everything: each
  // discoverAndBuild spawns a `mockymock collect` process (a Nuitka onefile
  // binary that unpacks itself on start), so an uncapped map over a
  // 200-.cut workspace would launch 200 concurrent processes at activation.
  const DISCOVERY_CONCURRENCY = 4;
  async function discoverAllCutFiles() {
    const uris = await vscode.workspace.findFiles('**/*.cut', CUT_DISCOVERY_EXCLUDE_GLOB);
    let next = 0;
    async function worker() {
      while (next < uris.length) {
        await discoverAndBuild(uris[next++]);
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(DISCOVERY_CONCURRENCY, Math.max(uris.length, 1)) }, () => worker())
    );
  }

  const watcher = vscode.workspace.createFileSystemWatcher('**/*.cut');
  context.subscriptions.push(watcher);
  watcher.onDidCreate((uri) => {
    void discoverAndBuild(uri).catch(() => undefined);
  });
  watcher.onDidChange((uri) => {
    void discoverAndBuild(uri).catch(() => undefined);
  });
  watcher.onDidDelete(removeFile);

  controller.resolveHandler = async (item) => {
    if (!item) {
      await discoverAllCutFiles().catch(() => undefined);
    }
  };
  void discoverAllCutFiles().catch(() => undefined);

  function allCaseItemsOf(fileItem: vscode.TestItem): vscode.TestItem[] {
    const cases: vscode.TestItem[] = [];
    fileItem.children.forEach((suiteItem) => {
      suiteItem.children.forEach((caseItem) => cases.push(caseItem));
    });
    return cases;
  }

  // Translate a TestRunRequest's include/exclude sets into one plan per .cut
  // file. Selecting the file (or every one of its cases) runs the whole file
  // with no --case flags — byte-identical CLI invocation to the pre-selection
  // behavior; any narrower selection becomes explicit --case flags.
  function planRuns(request: vscode.TestRunRequest): FilePlan[] {
    const excludedIds = new Set((request.exclude ?? []).map((item) => item.id));
    const wholeFiles = new Set<string>();
    const partial = new Map<string, Set<vscode.TestItem>>();

    function addCase(caseItem: vscode.TestItem) {
      if (excludedIds.has(caseItem.id)) return;
      const uriString = caseItem.uri!.toString();
      let items = partial.get(uriString);
      if (!items) {
        items = new Set();
        partial.set(uriString, items);
      }
      items.add(caseItem);
    }

    function addSuite(suiteItem: vscode.TestItem) {
      if (excludedIds.has(suiteItem.id)) return;
      suiteItem.children.forEach(addCase);
    }

    if (!request.include) {
      for (const uriString of fileItems.keys()) wholeFiles.add(uriString);
    } else {
      for (const item of request.include) {
        if (excludedIds.has(item.id) || !item.uri) continue;
        const uriString = item.uri.toString();
        if (fileItems.get(uriString) === item) {
          wholeFiles.add(uriString);
        } else if (item.parent && fileItems.get(uriString) === item.parent) {
          addSuite(item);
        } else {
          addCase(item);
        }
      }
    }

    const plans: FilePlan[] = [];
    for (const uriString of wholeFiles) {
      const fileItem = fileItems.get(uriString);
      if (!fileItem || excludedIds.has(fileItem.id)) continue;
      const excludedHere = allCaseItemsOf(fileItem).filter(
        (c) => excludedIds.has(c.id) || (c.parent && excludedIds.has(c.parent.id))
      );
      if (excludedHere.length === 0) {
        plans.push({ fileItem, caseItems: null });
      } else {
        const keep = allCaseItemsOf(fileItem).filter(
          (c) => !excludedIds.has(c.id) && !(c.parent && excludedIds.has(c.parent.id))
        );
        if (keep.length) plans.push({ fileItem, caseItems: keep });
      }
    }
    for (const [uriString, items] of partial) {
      if (wholeFiles.has(uriString)) continue;
      const fileItem = fileItems.get(uriString);
      if (!fileItem || excludedIds.has(fileItem.id)) continue;
      const all = allCaseItemsOf(fileItem);
      const isEverything = all.length === items.size && all.every((c) => items.has(c));
      plans.push({ fileItem, caseItems: isEverything ? null : [...items] });
    }
    return plans;
  }

  function selectedCaseItems(plan: FilePlan): vscode.TestItem[] {
    return plan.caseItems === null ? allCaseItemsOf(plan.fileItem) : plan.caseItems;
  }

  function forEachSelectedSuite(
    plan: FilePlan,
    selected: Set<vscode.TestItem>,
    visit: (suiteItem: vscode.TestItem, cases: vscode.TestItem[]) => void
  ) {
    plan.fileItem.children.forEach((suiteItem) => {
      const cases: vscode.TestItem[] = [];
      suiteItem.children.forEach((caseItem) => {
        if (selected.has(caseItem)) cases.push(caseItem);
      });
      if (cases.length) visit(suiteItem, cases);
    });
  }

  async function runOneFile(
    plan: FilePlan,
    run: vscode.TestRun,
    token: vscode.CancellationToken,
    withCoverage: boolean
  ) {
    const { fileItem } = plan;
    const selected = new Set(selectedCaseItems(plan));
    const wholeFile = plan.caseItems === null;

    forEachSelectedSuite(plan, selected, (suiteItem, cases) => {
      run.started(suiteItem);
      for (const caseItem of cases) run.started(caseItem);
    });
    if (wholeFile) run.started(fileItem);

    function failEverything(kind: 'errored', message: string) {
      forEachSelectedSuite(plan, selected, (suiteItem, cases) => {
        for (const caseItem of cases) run[kind](caseItem, new vscode.TestMessage(message));
        run[kind](suiteItem, new vscode.TestMessage(message));
      });
      if (wholeFile) run[kind](fileItem, new vscode.TestMessage(message));
    }

    const ready = await environmentManager.ensureReady();
    if (!ready.ok) {
      run.appendOutput(toCrlf(`${ready.message}\n`), undefined, fileItem);
      failEverything('errored', ready.message);
      return;
    }
    if (token.isCancellationRequested) {
      for (const caseItem of selected) run.skipped(caseItem);
      return;
    }

    const cutPath = fileItem.uri!.fsPath;
    const cblPath = resolveCblPath(cutPath);
    // mkdtemp, not predictable names in the shared tmpdir: an unguessable
    // per-run directory closes the classic pre-creation/symlink surface, and
    // one recursive rm in the finally below replaces per-file unlinks that
    // used to sit AFTER the try/finally -- where any throw out of runSuite
    // orphaned every report file.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockymock-'));
    const junitXmlPath = path.join(tmpDir, 'report.xml');
    const jsonReportPath = path.join(tmpDir, 'report.json');
    const coverageJsonPath = withCoverage ? path.join(tmpDir, 'coverage.json') : undefined;
    const { executablePath, copybookPaths } = resolveInvocationConfig(context, fileItem.uri!);

    const abort = new AbortController();
    const cancelListener = token.onCancellationRequested(() => abort.abort());

    run.appendOutput(formatRunHeader(path.basename(cutPath)), undefined, fileItem);
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
          coverageJsonPath,
          // The CLI's --case flags are name-keyed; deduped so a same-labeled
          // case in two suites doesn't emit the flag twice.
          caseNames: plan.caseItems ? [...new Set(plan.caseItems.map((c) => c.label))] : undefined,
        },
        runCommand,
        async (p) => {
          try {
            return await fs.readFile(p, 'utf8');
          } catch {
            return null;
          }
        },
        createOutputStreamer((text) => run.appendOutput(text, undefined, fileItem)),
        abort.signal
      );
    } finally {
      cancelListener.dispose();
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
    run.appendOutput(formatRunTrailer(result.exitCode), undefined, fileItem);

    if (token.isCancellationRequested) {
      for (const caseItem of selected) run.skipped(caseItem);
      return;
    }

    const selectedNames = [...selected].map((c) => c.label);
    const processFailureMessage = `mockymock run did not produce results:\n${result.stderr || result.stdout}`;

    // Prefer the JSON report (locations + expected/actual); fall back to the
    // JUnit XML for a CLI predating --json-report; fall back to the process
    // output when neither was produced (refusal / compile failure).
    let outcomes: Map<string, CaseOutcome>;
    // FAIL lines mockymock couldn't attribute to any known case id (a
    // MOCK/VERIFY firing after its case already ended, or a framework/binary
    // mismatch) — these don't belong to any TestItem, so nothing above would
    // ever surface them; the run would otherwise look all-green.
    let orphans: UnattributedFailure[];
    const jsonReport = result.jsonReport ? parseJsonReport(result.jsonReport) : null;
    if (jsonReport) {
      outcomes = mapJsonReport(selectedNames, jsonReport, processFailureMessage);
      orphans = jsonReport.orphanFailures;
    } else {
      const junitSuite = result.junitXml ? parseJUnitXml(result.junitXml) : null;
      outcomes = mapResults(selectedNames, junitSuite, junitSuite ? undefined : processFailureMessage);
      orphans = unattributedFailures(selectedNames, junitSuite);
    }

    let fileHasFailed = false;
    let fileHasErrored = false;
    forEachSelectedSuite(plan, selected, (suiteItem, cases) => {
      let suiteHasFailed = false;
      let suiteHasErrored = false;
      for (const caseItem of cases) {
        const outcome = outcomes.get(caseItem.label);
        if (!outcome || outcome.kind === 'passed') {
          run.passed(caseItem);
        } else if (outcome.kind === 'failed') {
          suiteHasFailed = true;
          run.failed(caseItem, messagesForOutcome(outcome, fileItem.uri!));
        } else {
          // 'errored' (refusal/compile failure/crash) or 'not-run' (an
          // earlier sibling crashed mid-suite before this case started).
          suiteHasErrored = true;
          run.errored(caseItem, new vscode.TestMessage(outcome.message));
        }
      }
      if (suiteHasFailed) {
        fileHasFailed = true;
        run.failed(suiteItem, new vscode.TestMessage('one or more cases failed'));
      } else if (suiteHasErrored) {
        fileHasErrored = true;
        run.errored(suiteItem, new vscode.TestMessage('one or more cases could not run'));
      } else {
        run.passed(suiteItem);
      }
    });
    if (orphans.length) {
      const detail = orphans.map((o) => `case ${o.caseId}: ${o.message}`).join('\n');
      const summary = `mockymock reported ${orphans.length} failure(s) not attributed to a known test case:\n${detail}`;
      run.appendOutput(toCrlf(`\n${summary}\n`), undefined, fileItem);
      // Not part of the wholeFile/case-item rollup above (there is no
      // TestItem an orphan belongs to) — always flag it on the file itself,
      // started or not, so it can never be masked by an otherwise-green run.
      if (!wholeFile) run.started(fileItem);
      run.errored(fileItem, new vscode.TestMessage(summary));
    } else if (wholeFile) {
      if (fileHasFailed) {
        run.failed(fileItem, new vscode.TestMessage('one or more cases failed'));
      } else if (fileHasErrored) {
        run.errored(fileItem, new vscode.TestMessage('one or more cases could not run'));
      } else {
        run.passed(fileItem);
      }
    }

    if (withCoverage && result.coverageJson) {
      const coverage = parseCoverageJson(result.coverageJson);
      if (coverage) {
        const fileCoverage = new vscode.FileCoverage(
          vscode.Uri.file(cblPath),
          new vscode.TestCoverageCount(coverage.totalCovered, coverage.totalExecutable)
        );
        coverageDetails.set(
          fileCoverage,
          coverage.lines.map(
            // Clamped for the same reason as messagesForOutcome's location:
            // a "line": 0 in the coverage JSON must not throw out of runOneFile.
            (l) => new vscode.StatementCoverage(l.covered ? 1 : 0, new vscode.Position(Math.max(0, l.line - 1), 0))
          )
        );
        run.addCoverage(fileCoverage);
      }
    }
  }

  // "Mutation Test": run `mockymock mutate` for a .cut file -- every mutant
  // is one full compile+run in the Docker sandbox, so this profile streams
  // the CLI's per-mutant progress lines live and runs files SEQUENTIALLY
  // (no maxParallelRuns pool: each mutant already serializes compiles inside
  // the shared mockymock-cobc container, and a mutation pass is minutes, not
  // seconds). The CLI has no --case flag -- the suite compiles as a single
  // binary and every mutant faces all of it -- so any narrower selection
  // collapses to the whole file, with a note in the output. Verdicts land on
  // the FILE item only: mutation scores the suite, not individual cases.
  async function runMutationFile(plan: FilePlan, run: vscode.TestRun, token: vscode.CancellationToken) {
    const { fileItem } = plan;
    run.started(fileItem);
    if (plan.caseItems !== null) {
      run.appendOutput(
        toCrlf('mockymock: mutation testing always runs the whole .cut suite against each mutant -- case selection widened to the file\n'),
        undefined,
        fileItem
      );
    }

    const ready = await environmentManager.ensureReady();
    if (!ready.ok) {
      run.appendOutput(toCrlf(`${ready.message}\n`), undefined, fileItem);
      run.errored(fileItem, new vscode.TestMessage(ready.message));
      return;
    }
    if (token.isCancellationRequested) {
      run.skipped(fileItem);
      return;
    }

    const cutPath = fileItem.uri!.fsPath;
    const cblPath = resolveCblPath(cutPath);
    const { executablePath, copybookPaths } = resolveInvocationConfig(context, fileItem.uri!);

    const supportsMutate = await supportsMutateCommand(runCommand, executablePath);
    if (!supportsMutate) {
      const message =
        `mockymock at "${executablePath}" is too old to support mutation testing ` +
        '(needs the mutate subcommand). Upgrade mockymock and try again.';
      run.appendOutput(toCrlf(`${message}\n`), undefined, fileItem);
      run.errored(fileItem, new vscode.TestMessage(message));
      return;
    }

    // Same per-run temp directory + finally cleanup as runOneFile.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockymock-'));
    const jsonReportPath = path.join(tmpDir, 'mutation.json');

    const abort = new AbortController();
    const cancelListener = token.onCancellationRequested(() => abort.abort());

    run.appendOutput(formatRunHeader(path.basename(cutPath)), undefined, fileItem);
    let result;
    try {
      result = await runMutate(
        { executablePath, cblPath, cutPath, jsonReportPath, copybookPaths },
        runCommand,
        async (p) => {
          try {
            return await fs.readFile(p, 'utf8');
          } catch {
            return null;
          }
        },
        createOutputStreamer((text) => run.appendOutput(text, undefined, fileItem)),
        abort.signal
      );
    } finally {
      cancelListener.dispose();
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
    run.appendOutput(formatRunTrailer(result.exitCode), undefined, fileItem);

    if (token.isCancellationRequested) {
      run.skipped(fileItem);
      return;
    }

    // The streamed CLI output already carries the per-mutant progress lines,
    // survivor diffs, and score -- the JSON report is only for the verdict,
    // TestMessages, and diagnostics.
    const report = result.jsonReport ? parseMutationJson(result.jsonReport) : null;
    if (!report) {
      const message = `mockymock mutate did not produce a report:\n${result.stderr || result.stdout}`;
      run.errored(fileItem, new vscode.TestMessage(message));
      return;
    }

    const cblUri = vscode.Uri.file(cblPath);
    const survivors = survivorsOf(report);
    mutationDiagnostics.set(cblUri, survivors.map(survivorDiagnostic));

    if (survivors.length) {
      const scoreText = report.score !== null ? `${(report.score * 100).toFixed(1)}%` : 'n/a';
      const messages = survivors.map((m) => {
        const message = vscode.TestMessage.diff(
          `surviving mutant [${m.operator}] ${m.description} -- the tests never noticed this change (mutation score ${scoreText})`,
          m.original,
          m.mutated
        );
        message.location = new vscode.Location(cblUri, new vscode.Position(Math.max(0, m.line - 1), 0));
        return message;
      });
      run.failed(fileItem, messages);
    } else if (result.exitCode !== 0) {
      // Exit 1 with a report but no survivors: refusal-style problems the
      // CLI printed to the streamed output (mutation itself never gates the
      // exit code without --fail-under, which this profile does not pass).
      run.errored(fileItem, new vscode.TestMessage(`mockymock mutate exited ${result.exitCode}:\n${result.stderr || result.stdout}`));
    } else {
      run.passed(fileItem);
    }
  }

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
    const { executablePath, copybookPaths } = resolveInvocationConfig(context, cutUri);

    const supportsTrace = await supportsTraceFlag(runCommand, executablePath);
    if (!supportsTrace) {
      const message =
        `mockymock at "${executablePath}" is too old to support execution tracing ` +
        '(needs --trace-json). Upgrade mockymock and try again.';
      run.appendOutput(toCrlf(`${message}\n`), undefined, caseItem);
      run.errored(caseItem, new vscode.TestMessage(message));
      return;
    }

    // Same per-run temp directory + finally cleanup as runOneFile.
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mockymock-'));
    const junitXmlPath = path.join(tmpDir, 'report.xml');
    const jsonReportPath = path.join(tmpDir, 'report.json');
    const traceJsonPath = path.join(tmpDir, 'trace.json');

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
      await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
    }
    run.appendOutput(formatRunTrailer(result.exitCode), undefined, caseItem);

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

  // "Debug (Interactive)": starts a real DAP session (mockymock debug
  // --dap-stdio) for exactly one selected test case, handing control to
  // VS Code's own debug UI (breakpoints, step controls, Variables/Call
  // Stack views) rather than scripting a pass/fail verdict the way every
  // other profile does -- there is no JUnit/JSON report to scrape from an
  // interactive session the user is driving. The TestRun stays open
  // (never marked passed/failed) until the debug session actually ends,
  // so the Test Results panel accurately reflects "still debugging".
  async function runInteractiveDebug(run: vscode.TestRun, token: vscode.CancellationToken, plans: FilePlan[]) {
    const allSelected = plans.flatMap(selectedCaseItems);
    if (allSelected.length !== 1) {
      const message =
        'mockymock: "Debug (Interactive)" needs exactly one selected test case -- ' +
        'the suite runs as a single binary, so a debug session cannot be attributed to ' +
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
    const { executablePath, copybookPaths } = resolveInvocationConfig(context, cutUri);

    const supportsDebug = await supportsDebugCommand(runCommand, executablePath);
    if (!supportsDebug) {
      const message =
        `mockymock at "${executablePath}" is too old to support interactive debugging ` +
        '(needs the debug subcommand). Upgrade mockymock and try again.';
      run.appendOutput(toCrlf(`${message}\n`), undefined, caseItem);
      run.errored(caseItem, new vscode.TestMessage(message));
      return;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(cutUri);

    // `mockymock debug --dap-stdio` runs these same static checks, but on
    // failure it prints plain text and exits non-zero before ever speaking
    // DAP -- run `lint` first with the exact program/cut/copybookPaths the
    // debug session itself will use, so a static problem surfaces as a
    // clear error here instead of a generic "debug adapter process
    // terminated unexpectedly" dialog.
    const lintResult = await runCommand(executablePath, buildLintArgs({ program: cblPath, cut: cutPath, copybookPaths }));
    const lintGate = evaluateLintResult(lintResult);
    if (lintGate.blocked) {
      run.appendOutput(toCrlf(`${lintGate.message}\n`), undefined, caseItem);
      run.errored(caseItem, new vscode.TestMessage(lintGate.message));
      return;
    }

    const sessionName = `mockymock: ${caseItem.label}`;
    const debugConfig: MockymockDebugConfiguration & vscode.DebugConfiguration = {
      type: 'mockymock-cobol',
      request: 'launch',
      name: sessionName,
      program: cblPath,
      cut: cutPath,
      case: caseItem.label,
      executablePath,
      copybookPaths,
    };

    const started = await vscode.debug.startDebugging(workspaceFolder, debugConfig);
    if (!started) {
      const message = 'mockymock: failed to start the interactive debug session (see the Debug Console for details)';
      run.appendOutput(toCrlf(`${message}\n`), undefined, caseItem);
      run.errored(caseItem, new vscode.TestMessage(message));
      return;
    }

    run.appendOutput(toCrlf(`mockymock: interactive debug session started for "${caseItem.label}"\n`), undefined, caseItem);
    // No scripted verdict for an interactive session -- "skipped" reads as
    // "not scored," which is accurate here, and leaves the item in a
    // terminal-but-neutral state rather than a misleading pass/fail.
    run.skipped(caseItem);

    // The run stays open until the interactive session actually ends (or
    // the user cancels from the Test Results panel) -- the caller's finally
    // block ends it once this returns.
    await new Promise<void>((resolve) => {
      const cancelListener = token.onCancellationRequested(() => finish());
      const terminateListener = vscode.debug.onDidTerminateDebugSession((session) => {
        if (session.name === sessionName) finish();
      });
      function finish() {
        cancelListener.dispose();
        terminateListener.dispose();
        resolve();
      }
    });
  }

  function makeRunHandler(withCoverage: boolean) {
    return async (request: vscode.TestRunRequest, token: vscode.CancellationToken) => {
      // Continuous mode: don't run now — re-fire a normal run for the same
      // selection whenever a .cut (or its paired COBOL source) changes, until
      // the user turns the eye icon off (token cancellation).
      if (request.continuous) {
        const continuousWatcher = vscode.workspace.createFileSystemWatcher('**/*.{cut,cbl,cob,cobol}');
        // Debounced + single-flight: the watcher fires on every save, and a
        // fast save sequence (or format-on-save's double write) used to stack
        // overlapping full runs -- overlapping compiles inside the shared
        // mockymock-cobc container. One trailing rerun is kept if changes
        // arrive while a run is in flight.
        let rerunTimer: ReturnType<typeof setTimeout> | undefined;
        let running = false;
        let pendingRerun = false;
        async function fireRerun(): Promise<void> {
          if (token.isCancellationRequested) return;
          if (running) {
            pendingRerun = true;
            return;
          }
          running = true;
          try {
            const include = request.include?.length ? request.include : undefined;
            await handler(new vscode.TestRunRequest(include, request.exclude, request.profile), token);
          } finally {
            running = false;
            if (pendingRerun) {
              pendingRerun = false;
              scheduleRerun();
            }
          }
        }
        function scheduleRerun(): void {
          if (rerunTimer) clearTimeout(rerunTimer);
          rerunTimer = setTimeout(() => void fireRerun(), 300);
        }
        const rerun = (uri: vscode.Uri) => {
          if (isExcludedCutPath(uri.fsPath)) return;
          const cutFsPath = uri.fsPath.endsWith('.cut')
            ? uri.fsPath
            : uri.fsPath.replace(/\.(cbl|cob|cobol)$/i, '.cut');
          const cutUri = vscode.Uri.file(cutFsPath).toString();
          if (!fileItems.has(cutUri)) return;
          const relevant =
            !request.include || request.include.some((item) => item.uri?.toString() === cutUri);
          if (!relevant) return;
          scheduleRerun();
        };
        continuousWatcher.onDidChange(rerun);
        continuousWatcher.onDidCreate(rerun);
        // Registered BOTH on the cancellation token (eye icon toggled off)
        // and in context.subscriptions (deactivate/reload with the watcher
        // still live) -- the latter was missing and leaked the watcher.
        const disposable = {
          dispose: () => {
            continuousWatcher.dispose();
            if (rerunTimer) clearTimeout(rerunTimer);
          },
        };
        token.onCancellationRequested(() => disposable.dispose());
        context.subscriptions.push(disposable);
        return;
      }
      await handler(request, token);
    };

    async function handler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
      const run = controller.createTestRun(request);
      try {
        const plans = planRuns(request);
        const configured =
          vscode.workspace.getConfiguration('mockymock').get<number>('maxParallelRuns') ?? 1;
        const parallelism = Math.max(1, Math.floor(configured));

        let next = 0;
        async function worker() {
          while (next < plans.length && !token.isCancellationRequested) {
            const plan = plans[next++];
            try {
              await runOneFile(plan, run, token, withCoverage);
            } catch (err) {
              // Never leave a "started" item without a terminal state: if
              // runOneFile threw after marking items started, error out the
              // selection and move on to the next file.
              const message = err instanceof Error ? err.message : String(err);
              run.appendOutput(toCrlf(`${message}\n`), undefined, plan.fileItem);
              const selected = new Set(selectedCaseItems(plan));
              forEachSelectedSuite(plan, selected, (suiteItem, cases) => {
                for (const caseItem of cases) run.errored(caseItem, new vscode.TestMessage(message));
                run.errored(suiteItem, new vscode.TestMessage(message));
              });
              if (plan.caseItems === null) run.errored(plan.fileItem, new vscode.TestMessage(message));
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(parallelism, Math.max(plans.length, 1)) }, () => worker())
        );
      } finally {
        run.end();
      }
    }
  }

  const runProfile = controller.createRunProfile(
    'Run',
    vscode.TestRunProfileKind.Run,
    makeRunHandler(false),
    true,
    undefined,
    true // supportsContinuousRun
  );
  context.subscriptions.push(runProfile);

  const coverageProfile = controller.createRunProfile(
    'Run with Coverage',
    vscode.TestRunProfileKind.Coverage,
    makeRunHandler(true),
    true
  );
  coverageProfile.loadDetailedCoverage = async (_testRun, fileCoverage) =>
    coverageDetails.get(fileCoverage as vscode.FileCoverage) ?? [];
  context.subscriptions.push(coverageProfile);

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
    false
  );
  context.subscriptions.push(debugProfile);

  // A second profile of the same kind: VS Code shows both in the dropdown
  // next to the Test Explorer's bug icon. This one -- the real interactive
  // session (breakpoints, stepping, Watch/Variables) -- is the default now
  // that it's proven out; "Debug (Execution Trace)" (fast, read-only,
  // always available, no live gdb session) stays one click away for when
  // a full interactive session isn't needed. See
  // docs/2026-07-22-dap-debugger-design.md in the sibling mocky-mock repo.
  const interactiveDebugProfile = controller.createRunProfile(
    'Debug (Interactive)',
    vscode.TestRunProfileKind.Debug,
    async (request, token) => {
      const run = controller.createTestRun(request);
      try {
        await runInteractiveDebug(run, token, planRuns(request));
      } finally {
        run.end();
      }
    },
    true
  );
  context.subscriptions.push(interactiveDebugProfile);

  // A second Run-kind profile: shows up in the Test Explorer's run-button
  // dropdown next to "Run". Not the default, no continuous mode -- a
  // mutation pass costs one compile+run per mutant and is minutes long, so
  // it must only ever run when explicitly chosen.
  const mutationProfile = controller.createRunProfile(
    'Mutation Test',
    vscode.TestRunProfileKind.Run,
    async (request, token) => {
      const run = controller.createTestRun(request);
      try {
        for (const plan of planRuns(request)) {
          if (token.isCancellationRequested) break;
          try {
            await runMutationFile(plan, run, token);
          } catch (err) {
            // Never leave a "started" item without a terminal state: same
            // guard as makeRunHandler's worker for "Run"/"Run with
            // Coverage" -- if runMutationFile throws after run.started(),
            // error the file out and move on to the next one instead of
            // leaving a permanent spinner and abandoning the rest of the
            // selection.
            const message = err instanceof Error ? err.message : String(err);
            run.appendOutput(toCrlf(`${message}\n`), undefined, plan.fileItem);
            run.errored(plan.fileItem, new vscode.TestMessage(message));
          }
        }
      } finally {
        run.end();
      }
    },
    false
  );
  context.subscriptions.push(mutationProfile);

  return controller;
}
