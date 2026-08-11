import * as vscode from 'vscode';
import { runCommand } from '../environment/commandRunner';
import { describeRefreshError, resolveExecutablePath, supportsAnalyzeCommand } from '../environment/checks';
import { firstNonEmptyLine } from '../environment/textUtils';
import { looksLikeCobolCandidate, looksLikeCopybook } from './copybookDetection';
import { runGenerateData } from './generateDataRunner';

// package.json's `contributes.menus.editor/title[].when` reads this exact
// string -- keep it in one place so the manifest and this file's
// setContext call can't drift apart (a typo in either silently hides the
// icon forever, with no error anywhere).
export const COPYBOOK_ICON_CONTEXT_KEY = 'mockymock.activeEditorIsCopybook';

const CONTEXT_UPDATE_DEBOUNCE_MS = 300;

let generateDataOutputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!generateDataOutputChannel) {
    generateDataOutputChannel = vscode.window.createOutputChannel('mockymock: Generate Data');
  }
  return generateDataOutputChannel;
}

function computeIsCopybook(document: vscode.TextDocument): boolean {
  if (document.uri.scheme !== 'file') {
    return false;
  }
  if (!looksLikeCobolCandidate(document.uri.fsPath, document.languageId)) {
    return false;
  }
  return looksLikeCopybook(document.getText());
}

// One-shot palette/icon action (like mockymock.analyzeCobol), requiring an
// active copybook editor. Icon visibility is driven by
// COPYBOOK_ICON_CONTEXT_KEY, recomputed on active-editor change and a
// debounced text-change of the active document -- so typing an
// IDENTIFICATION DIVISION into what used to look like a copybook hides the
// icon again without a manual refresh.
export function activateGenerateDataCommand(context: vscode.ExtensionContext): void {
  // generateDataOutputChannel is a module-level singleton (see
  // getOutputChannel), so disposing it can't be a plain
  // `context.subscriptions.push(channel)` -- that would leave the module
  // variable pointing at a disposed object after deactivation, silently
  // no-op-ing appendLine on a later activate() in the same host. Null it
  // out alongside disposal instead (same pattern as analyzeCobol.ts).
  context.subscriptions.push({
    dispose: () => {
      generateDataOutputChannel?.dispose();
      generateDataOutputChannel = undefined;
    },
  });

  let debounceTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleContextUpdate(): void {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      const editor = vscode.window.activeTextEditor;
      const isCopybook = editor !== undefined && computeIsCopybook(editor.document);
      void vscode.commands.executeCommand('setContext', COPYBOOK_ICON_CONTEXT_KEY, isCopybook);
    }, CONTEXT_UPDATE_DEBOUNCE_MS);
  }
  context.subscriptions.push({
    dispose: () => {
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  });

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => scheduleContextUpdate()));
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document === vscode.window.activeTextEditor?.document) {
        scheduleContextUpdate();
      }
    })
  );
  scheduleContextUpdate();

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.generateData', async () => {
      const editor = vscode.window.activeTextEditor;
      const activePath = editor?.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
      if (!editor || !activePath) {
        vscode.window.showErrorMessage(
          'mockymock: open a copybook file first, then run "Generate Data from Copybook".'
        );
        return;
      }

      const config = vscode.workspace.getConfiguration('mockymock', editor.document.uri);
      const executablePath = resolveExecutablePath(config.get<string>('executablePath'), context.extensionPath);

      const supportsGenerateData = await supportsAnalyzeCommand(runCommand, executablePath);
      if (!supportsGenerateData) {
        // supportsAnalyzeCommand's false could mean "found but too old" or
        // "not found at all" -- a second, cheap probe distinguishes them,
        // same pattern analyzeCobol.ts uses.
        const probe = await runCommand(executablePath, ['--version']);
        const message = describeRefreshError(
          `mockymock at "${executablePath}" is too old to support generating data from a copybook ` +
            '(needs the analyze subcommand). Upgrade mockymock and try again.',
          probe.stderr
        );
        vscode.window.showErrorMessage(message);
        return;
      }

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'mockymock: generating data from copybook...' },
        () => runGenerateData(executablePath, activePath, runCommand)
      );

      if (result.exitCode !== 0) {
        const channel = getOutputChannel();
        channel.clear();
        channel.appendLine(result.stdout);
        channel.appendLine(result.stderr);
        channel.show();
        const firstLine = firstNonEmptyLine(result.stderr) ?? 'mockymock generate data failed';
        vscode.window.showErrorMessage(`mockymock: ${firstLine}`);
        return;
      }

      const doc = await vscode.workspace.openTextDocument({ content: result.stdout });
      await vscode.window.showTextDocument(doc);
    })
  );
}
