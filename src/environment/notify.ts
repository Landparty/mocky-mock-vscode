// src/environment/notify.ts
//
// The handful of user-facing notifications every one-shot command shares,
// each with the one button that actually fixes the situation -- so a "CLI
// not found" toast carries a Check Setup button instead of asking the user
// to go find a command by name, and a "wrong file open" toast can open the
// right kind of file. Thin wrappers over vscode.window.show*Message; all
// the wording lives in environment/checks.ts where it's unit-testable.
import * as vscode from 'vscode';
import { CLI_NOT_FOUND_MESSAGE, CLI_PERMISSION_DENIED_MESSAGE, isBundledExecutable } from './checks';

export const RELEASES_URL = 'https://github.com/Landparty/mocky-mock-vscode/releases/latest';
export const WALKTHROUGH_ID = 'lanparty.mockymock-vscode#gettingStarted';

const CHECK_SETUP = 'Check Setup';
const UPDATE_EXTENSION = 'Get Latest Release';
const OPEN_SETTINGS = 'Open Settings';

// For any error whose root cause is the CLI itself (missing, blocked, or
// too old for the feature). Which button to offer follows from the
// message: a CLI that can't run at all is what "Check Setup" fixes; a
// bundled CLI that's simply too old is fixed by updating the extension; a
// user-configured one by pointing the setting somewhere newer.
export async function showCliProblem(message: string, executablePath?: string, extensionPath?: string): Promise<void> {
  const cliUnavailable = message === CLI_NOT_FOUND_MESSAGE || message === CLI_PERMISSION_DENIED_MESSAGE;
  let action: string;
  if (cliUnavailable) {
    action = CHECK_SETUP;
  } else if (executablePath !== undefined && extensionPath !== undefined && isBundledExecutable(executablePath, extensionPath)) {
    action = UPDATE_EXTENSION;
  } else {
    action = OPEN_SETTINGS;
  }
  const choice = await vscode.window.showErrorMessage(message, action);
  if (choice === CHECK_SETUP) {
    await vscode.commands.executeCommand('mockymock.checkEnvironment');
  } else if (choice === UPDATE_EXTENSION) {
    await vscode.env.openExternal(vscode.Uri.parse(RELEASES_URL));
  } else if (choice === OPEN_SETTINGS) {
    await vscode.commands.executeCommand('workbench.action.openSettings', 'mockymock.executablePath');
  }
}

export type WantedFile = 'cobol' | 'copybook' | 'cobol-or-cut';

const WANTED_FILE_WORDING: Record<WantedFile, { noun: string; filters: Record<string, string[]> }> = {
  cobol: { noun: 'a COBOL program (.cbl, .cob or .cobol)', filters: { COBOL: ['cbl', 'cob', 'cobol'] } },
  copybook: { noun: 'a copybook', filters: { Copybook: ['cpy', 'copy', 'cbl', 'cob', 'cobol'] } },
  'cobol-or-cut': {
    noun: 'a COBOL program or its .cut test suite',
    filters: { 'COBOL or .cut': ['cbl', 'cob', 'cobol', 'cut'] },
  },
};

// "Open the right file first" -- with an Open File button that opens the
// picker filtered to the right extensions, so the user never has to
// re-find the command afterwards: the command is re-run on the chosen file
// once it's open. Returns without re-running when the picker is dismissed.
export async function showNeedsFile(actionLabel: string, wanted: WantedFile, rerunCommand: string): Promise<void> {
  const wording = WANTED_FILE_WORDING[wanted];
  const openFile = 'Open File…';
  const choice = await vscode.window.showErrorMessage(
    `mockymock: open ${wording.noun} first, then run "${actionLabel}".`,
    openFile
  );
  if (choice !== openFile) return;
  const picked = await vscode.window.showOpenDialog({ canSelectMany: false, filters: wording.filters });
  if (!picked?.[0]) return;
  await vscode.window.showTextDocument(picked[0]);
  await vscode.commands.executeCommand(rerunCommand);
}
