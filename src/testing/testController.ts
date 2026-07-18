// src/testing/testController.ts
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { parseCutFile, resolveCblPath } from '../discovery/cutDiscovery';
import { parseJUnitXml } from './junitParser';
import { mapResults } from './resultMapper';
import { runSuite } from './mockymockRunner';
import { runCommand } from '../environment/commandRunner';
import { EnvironmentManager } from '../environment/environmentManager';
import { resolveExecutablePath } from '../environment/checks';

export function activateTestController(
  context: vscode.ExtensionContext,
  environmentManager: EnvironmentManager
): vscode.TestController {
  const controller = vscode.tests.createTestController('mockymock', 'mockymock');
  context.subscriptions.push(controller);

  const fileItems = new Map<string, vscode.TestItem>();

  async function discoverAndBuild(uri: vscode.Uri) {
    let text: string;
    try {
      text = await fs.readFile(uri.fsPath, 'utf8');
    } catch {
      return;
    }
    const suites = parseCutFile(text);

    const fileItem = controller.createTestItem(uri.toString(), path.basename(uri.fsPath), uri);
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
    const uris = await vscode.workspace.findFiles('**/*.cut', '**/node_modules/**');
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

  async function runOneFile(fileItem: vscode.TestItem, run: vscode.TestRun) {
    fileItem.children.forEach((suiteItem) => {
      run.started(suiteItem);
      suiteItem.children.forEach((caseItem) => run.started(caseItem));
    });
    run.started(fileItem);

    const ready = await environmentManager.ensureReady();
    if (!ready.ok) {
      fileItem.children.forEach((suiteItem) => {
        suiteItem.children.forEach((caseItem) => run.errored(caseItem, new vscode.TestMessage(ready.message)));
        run.errored(suiteItem, new vscode.TestMessage(ready.message));
      });
      run.errored(fileItem, new vscode.TestMessage(ready.message));
      return;
    }

    const cutPath = fileItem.uri!.fsPath;
    const cblPath = resolveCblPath(cutPath);
    const junitXmlPath = path.join(os.tmpdir(), `mockymock-${Date.now()}-${Math.random().toString(36).slice(2)}.xml`);
    const config = vscode.workspace.getConfiguration('mockymock');
    const executablePath = resolveExecutablePath(config.get<string>('executablePath'));
    const copybookPaths = config.get<string[]>('copybookPaths') ?? [];

    const result = await runSuite(
      { executablePath, cblPath, cutPath, junitXmlPath, copybookPaths },
      runCommand,
      async (p) => {
        try {
          return await fs.readFile(p, 'utf8');
        } catch {
          return null;
        }
      }
    );
    await fs.unlink(junitXmlPath).catch(() => undefined);

    const allCaseNames: string[] = [];
    fileItem.children.forEach((suiteItem) => {
      suiteItem.children.forEach((caseItem) => allCaseNames.push(caseItem.label));
    });

    const junitSuite = result.junitXml ? parseJUnitXml(result.junitXml) : null;
    const processFailureMessage = junitSuite
      ? undefined
      : `mockymock run did not produce results:\n${result.stderr || result.stdout}`;
    const outcomes = mapResults(allCaseNames, junitSuite, processFailureMessage);

    let fileHasFailed = false;
    let fileHasErrored = false;
    fileItem.children.forEach((suiteItem) => {
      let suiteHasFailed = false;
      let suiteHasErrored = false;
      suiteItem.children.forEach((caseItem) => {
        const outcome = outcomes.get(caseItem.label);
        if (!outcome || outcome.kind === 'passed') {
          run.passed(caseItem);
        } else if (outcome.kind === 'failed') {
          suiteHasFailed = true;
          run.failed(caseItem, new vscode.TestMessage(outcome.message));
        } else {
          // 'errored' (mockymock refused/failed to compile, no JUnit produced) or
          // 'not-run' (this case never ran because an earlier sibling crashed mid-suite)
          suiteHasErrored = true;
          run.errored(caseItem, new vscode.TestMessage(outcome.message));
        }
      });
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
    if (fileHasFailed) {
      run.failed(fileItem, new vscode.TestMessage('one or more cases failed'));
    } else if (fileHasErrored) {
      run.errored(fileItem, new vscode.TestMessage('one or more cases could not run'));
    } else {
      run.passed(fileItem);
    }
  }

  const runHandler = async (request: vscode.TestRunRequest, token: vscode.CancellationToken) => {
    const run = controller.createTestRun(request);
    try {
      const requestedFileUris = new Set<string>();
      if (request.include) {
        for (const item of request.include) {
          if (item.uri) requestedFileUris.add(item.uri.toString());
        }
      } else {
        for (const uri of fileItems.keys()) requestedFileUris.add(uri);
      }

      for (const uriString of requestedFileUris) {
        if (token.isCancellationRequested) break;
        const fileItem = fileItems.get(uriString);
        if (!fileItem) continue;
        try {
          await runOneFile(fileItem, run);
        } catch (err) {
          // Never leave a "started" item without a terminal state: if runOneFile threw
          // (e.g. a bad JUnit XML parse) after marking items started, mark this file's
          // whole tree as errored and move on to the next file.
          const message = err instanceof Error ? err.message : String(err);
          fileItem.children.forEach((suiteItem) => {
            suiteItem.children.forEach((caseItem) => run.errored(caseItem, new vscode.TestMessage(message)));
            run.errored(suiteItem, new vscode.TestMessage(message));
          });
          run.errored(fileItem, new vscode.TestMessage(message));
        }
      }
    } finally {
      run.end();
    }
  };

  const runProfile = controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, runHandler, true);
  context.subscriptions.push(runProfile);

  return controller;
}
