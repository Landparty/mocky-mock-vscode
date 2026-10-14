// src/navigation/suitePicker.ts
//
// A program can have several suites (PROG.cut, PROG.errors.cut, a suite
// under tests/ ...). When there's more than one to choose from -- or the
// user asked for a new one while some exist -- this lists them, plus a
// last "New Test Suite…" entry that asks for a topic.
import * as path from 'path';
import * as vscode from 'vscode';
import { validateSuiteTopic } from '../discovery/suitePairing';

export const NEW_SUITE = Symbol('new suite');

interface SuiteItem extends vscode.QuickPickItem {
  suite: string | typeof NEW_SUITE;
}

export async function pickSuite(
  cblPath: string,
  suites: string[]
): Promise<string | typeof NEW_SUITE | undefined> {
  const items: SuiteItem[] = suites.map((suite) => ({
    label: `$(beaker) ${path.basename(suite)}`,
    description: vscode.workspace.asRelativePath(path.dirname(suite)),
    suite,
  }));
  items.push({
    label: '$(add) New Test Suite…',
    description: `another suite for ${path.basename(cblPath)}`,
    suite: NEW_SUITE,
  });
  const picked = await vscode.window.showQuickPick(items, {
    title: `Test suites for ${path.basename(cblPath)}`,
    placeHolder: 'Open a suite, or create another one',
  });
  return picked?.suite;
}

// The topic in PROG.<topic>.cut.
export async function askSuiteTopic(cblPath: string): Promise<string | undefined> {
  const stem = path.parse(cblPath).name;
  const topic = await vscode.window.showInputBox({
    title: `New test suite for ${path.basename(cblPath)}`,
    prompt: `Name it by what it covers. The file will be ${stem}.<name>.cut.`,
    placeHolder: 'errors',
    validateInput: validateSuiteTopic,
  });
  return topic?.trim() || undefined;
}
