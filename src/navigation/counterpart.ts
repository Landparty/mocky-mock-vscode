// src/navigation/counterpart.ts
//
// One click between a program and its test suite. Two context keys drive
// the editor title bar: on a program with a suite, the beaker becomes
// "Open Test Suite" (instead of offering to create one that already
// exists); on a suite, a button jumps back to its program.
import * as vscode from 'vscode';
import { counterpartOf } from './counterpartLogic';

export const OPEN_TEST_SUITE_COMMAND = 'mockymock.openTestSuite';
export const OPEN_PROGRAM_COMMAND = 'mockymock.openProgram';
const HAS_SUITE_KEY = 'mockymock.activeProgramHasSuite';
const HAS_PROGRAM_KEY = 'mockymock.activeSuiteHasProgram';

function targetUri(uri: unknown): vscode.Uri | undefined {
  if (uri instanceof vscode.Uri) return uri;
  return vscode.window.activeTextEditor?.document.uri;
}

async function openCounterpart(uri: unknown, wanted: 'suite' | 'program'): Promise<void> {
  const target = targetUri(uri);
  const pair = target?.scheme === 'file' ? counterpartOf(target.fsPath) : undefined;
  if (!pair || pair.kind !== wanted) {
    const noun = wanted === 'suite' ? 'a COBOL program' : 'a .cut test suite';
    void vscode.window.showErrorMessage(`mockymock: open ${noun} first.`);
    return;
  }
  if (!pair.exists) {
    if (wanted === 'suite') {
      // Nothing to open yet -- the helpful move is to make one.
      if (target && vscode.window.activeTextEditor?.document.uri.fsPath !== target.fsPath) {
        await vscode.window.showTextDocument(target);
      }
      await vscode.commands.executeCommand('mockymock.newTestSuite');
    } else {
      void vscode.window.showErrorMessage(
        `mockymock: no program named like this suite was found next to it (looked for ${vscode.workspace.asRelativePath(pair.path)} and its .cob/.cobol variants).`
      );
    }
    return;
  }
  await vscode.window.showTextDocument(vscode.Uri.file(pair.path));
}

export function activateCounterpartNavigation(context: vscode.ExtensionContext): void {
  const refresh = () => {
    const uri = vscode.window.activeTextEditor?.document.uri;
    const pair = uri?.scheme === 'file' ? counterpartOf(uri.fsPath) : undefined;
    void vscode.commands.executeCommand('setContext', HAS_SUITE_KEY, pair?.kind === 'suite' && pair.exists);
    void vscode.commands.executeCommand('setContext', HAS_PROGRAM_KEY, pair?.kind === 'program' && pair.exists);
  };

  // A suite created (or deleted) while its program is open should flip the
  // title-bar button straight away, not on the next editor switch.
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.{cut,cbl,cob,cobol}', false, true, false);
  watcher.onDidCreate(refresh);
  watcher.onDidDelete(refresh);

  context.subscriptions.push(
    watcher,
    vscode.window.onDidChangeActiveTextEditor(refresh),
    vscode.commands.registerCommand('mockymock.openTestSuite', (uri?: vscode.Uri) => openCounterpart(uri, 'suite')),
    vscode.commands.registerCommand('mockymock.openProgram', (uri?: vscode.Uri) => openCounterpart(uri, 'program'))
  );
  refresh();
}
