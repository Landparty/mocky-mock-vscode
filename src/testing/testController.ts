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
        const caseItem = controller.createTestItem(`${uri.toString()}::${suite.name}::${c.name}`, c.name, uri);
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
  watcher.onDidCreate(discoverAndBuild);
  watcher.onDidChange(discoverAndBuild);
  watcher.onDidDelete(removeFile);

  controller.resolveHandler = async (item) => {
    if (!item) {
      await discoverAllCutFiles();
    }
  };
  void discoverAllCutFiles();

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
    const executablePath = config.get<string>('executablePath') || 'mockymock';
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

    let fileAllPassed = true;
    fileItem.children.forEach((suiteItem) => {
      let suiteAllPassed = true;
      suiteItem.children.forEach((caseItem) => {
        const outcome = outcomes.get(caseItem.label);
        if (!outcome || outcome.kind === 'passed') {
          run.passed(caseItem);
        } else {
          suiteAllPassed = false;
          run.failed(caseItem, new vscode.TestMessage(outcome.message));
        }
      });
      if (suiteAllPassed) {
        run.passed(suiteItem);
      } else {
        fileAllPassed = false;
        run.failed(suiteItem, new vscode.TestMessage('one or more cases failed'));
      }
    });
    if (fileAllPassed) {
      run.passed(fileItem);
    } else {
      run.failed(fileItem, new vscode.TestMessage('one or more cases failed'));
    }
  }

  const runHandler = async (request: vscode.TestRunRequest, token: vscode.CancellationToken) => {
    const run = controller.createTestRun(request);
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
      if (fileItem) {
        await runOneFile(fileItem, run);
      }
    }
    run.end();
  };

  controller.createRunProfile('Run', vscode.TestRunProfileKind.Run, runHandler, true);

  return controller;
}
