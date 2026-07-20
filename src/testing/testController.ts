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
import { mapResults, CaseOutcome } from './resultMapper';
import { parseJsonReport, mapJsonReport } from './jsonReport';
import { parseCoverageJson } from './coverageReport';
import { runSuite } from './mockymockRunner';
import { runCommand } from '../environment/commandRunner';
import { EnvironmentManager } from '../environment/environmentManager';
import { resolveExecutablePath } from '../environment/checks';
import { toCrlf, formatRunHeader, formatRunTrailer, createOutputStreamer } from './outputFormatting';

interface FilePlan {
  fileItem: vscode.TestItem;
  /** null = run the whole file (no --case flags, identical to a classic run). */
  caseNames: string[] | null;
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
      vscode.workspace.getConfiguration('mockymock', uri).get<string>('executablePath')
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

  async function discoverAllCutFiles() {
    const uris = await vscode.workspace.findFiles('**/*.cut', CUT_DISCOVERY_EXCLUDE_GLOB);
    await Promise.all(uris.map(discoverAndBuild));
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
    const partial = new Map<string, Set<string>>();

    function addCase(caseItem: vscode.TestItem) {
      if (excludedIds.has(caseItem.id)) return;
      const uriString = caseItem.uri!.toString();
      let names = partial.get(uriString);
      if (!names) {
        names = new Set();
        partial.set(uriString, names);
      }
      names.add(caseItem.label);
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
        plans.push({ fileItem, caseNames: null });
      } else {
        const keep = allCaseItemsOf(fileItem)
          .filter((c) => !excludedIds.has(c.id) && !(c.parent && excludedIds.has(c.parent.id)))
          .map((c) => c.label);
        if (keep.length) plans.push({ fileItem, caseNames: keep });
      }
    }
    for (const [uriString, names] of partial) {
      if (wholeFiles.has(uriString)) continue;
      const fileItem = fileItems.get(uriString);
      if (!fileItem || excludedIds.has(fileItem.id)) continue;
      const allNames = allCaseItemsOf(fileItem).map((c) => c.label);
      const isEverything = allNames.length === names.size && allNames.every((n) => names.has(n));
      plans.push({ fileItem, caseNames: isEverything ? null : [...names] });
    }
    return plans;
  }

  function selectedCaseItems(plan: FilePlan): vscode.TestItem[] {
    const all = allCaseItemsOf(plan.fileItem);
    if (plan.caseNames === null) return all;
    const wanted = new Set(plan.caseNames);
    return all.filter((c) => wanted.has(c.label));
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
    const wholeFile = plan.caseNames === null;

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
    const stamp = `mockymock-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const junitXmlPath = path.join(os.tmpdir(), `${stamp}.xml`);
    const jsonReportPath = path.join(os.tmpdir(), `${stamp}.json`);
    const coverageJsonPath = withCoverage ? path.join(os.tmpdir(), `${stamp}-coverage.json`) : undefined;
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(fileItem.uri!);
    const config = vscode.workspace.getConfiguration('mockymock', fileItem.uri);
    const executablePath = resolveExecutablePath(config.get<string>('executablePath'));
    const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
      workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
    );

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
          caseNames: plan.caseNames ?? undefined,
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
    }
    run.appendOutput(formatRunTrailer(result.exitCode), undefined, fileItem);
    await fs.unlink(junitXmlPath).catch(() => undefined);
    await fs.unlink(jsonReportPath).catch(() => undefined);
    if (coverageJsonPath) await fs.unlink(coverageJsonPath).catch(() => undefined);

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
    const jsonReport = result.jsonReport ? parseJsonReport(result.jsonReport) : null;
    if (jsonReport) {
      outcomes = mapJsonReport(selectedNames, jsonReport, processFailureMessage);
    } else {
      const junitSuite = result.junitXml ? parseJUnitXml(result.junitXml) : null;
      outcomes = mapResults(selectedNames, junitSuite, junitSuite ? undefined : processFailureMessage);
    }

    function messagesFor(outcome: CaseOutcome & { kind: 'failed' }): vscode.TestMessage[] {
      if (!outcome.details?.length) return [new vscode.TestMessage(outcome.message)];
      const cutUri = fileItem.uri!;
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
          run.failed(caseItem, messagesFor(outcome));
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
    if (wholeFile) {
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
            (l) => new vscode.StatementCoverage(l.covered ? 1 : 0, new vscode.Position(l.line - 1, 0))
          )
        );
        run.addCoverage(fileCoverage);
      }
    }
  }

  function makeRunHandler(withCoverage: boolean) {
    return async (request: vscode.TestRunRequest, token: vscode.CancellationToken) => {
      // Continuous mode: don't run now — re-fire a normal run for the same
      // selection whenever a .cut (or its paired .cbl) changes, until the
      // user turns the eye icon off (token cancellation).
      if (request.continuous) {
        const continuousWatcher = vscode.workspace.createFileSystemWatcher('**/*.{cut,cbl}');
        const rerun = (uri: vscode.Uri) => {
          if (isExcludedCutPath(uri.fsPath)) return;
          const cutFsPath = uri.fsPath.endsWith('.cbl')
            ? uri.fsPath.replace(/\.cbl$/, '.cut')
            : uri.fsPath;
          const cutUri = vscode.Uri.file(cutFsPath).toString();
          if (!fileItems.has(cutUri)) return;
          const relevant =
            !request.include || request.include.some((item) => item.uri?.toString() === cutUri);
          if (!relevant) return;
          const include = request.include?.length ? request.include : undefined;
          void handler(new vscode.TestRunRequest(include, request.exclude, request.profile), token);
        };
        continuousWatcher.onDidChange(rerun);
        continuousWatcher.onDidCreate(rerun);
        token.onCancellationRequested(() => continuousWatcher.dispose());
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
              if (plan.caseNames === null) run.errored(plan.fileItem, new vscode.TestMessage(message));
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

  return controller;
}
