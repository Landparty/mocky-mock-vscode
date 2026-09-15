// src/linting/lintCodeActionProvider.ts
//
// A Quick Fix on an UNMOCKED_* lint diagnostic: run `mockymock generate
// --fill` on the open .cut file, which inserts exactly the missing MOCK
// blocks and leaves everything else untouched (see
// docs/2026-09-15-actionable-refusals-and-fill-design.md in the sibling
// mocky-mock repo). This provider never computes the fix itself -- it
// only recognizes when one exists (the diagnostic's own message already
// carries the "Add to this TESTCASE:" text mockymock's refusal gate
// appends, folded in verbatim by lintOutput.ts's existing continuation-
// line handling) and delegates to the CLI, so the inserted text can
// never drift from what `generate --fill` would produce on its own. See
// docs/2026-09-15-cut-editor-intelligence-design.md.
import * as vscode from 'vscode';
import { resolveCblPath } from '../discovery/cutDiscovery';
import { runCommand } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { hasSuggestedFix } from './lintCodeActionLogic';

export const FILL_MISSING_MOCKS_COMMAND = 'mockymock.fillMissingMocks';

export function diagnosticHasSuggestedFix(diagnostic: vscode.Diagnostic): boolean {
  return hasSuggestedFix(diagnostic);
}

// Waits (bounded) for VS Code to notice an external file change and
// reload the open document's buffer before re-linting, so the freshly
// inserted lines are what the diagnostic's own line-length calculation
// sees. Not a hard guarantee -- if the FS watcher event doesn't arrive
// within the timeout, relint still runs (against whatever buffer state
// exists) rather than blocking indefinitely; a stale squiggle position
// self-corrects on the document's next change or the next lint pass.
function waitForDocumentReload(uri: vscode.Uri, timeoutMs = 500): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      subscription.dispose();
      resolve();
    }, timeoutMs);
    const subscription = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.fsPath !== uri.fsPath) return;
      clearTimeout(timer);
      subscription.dispose();
      resolve();
    });
  });
}

export function activateLintCodeActions(
  context: vscode.ExtensionContext,
  relint: (uri: vscode.Uri) => void
): void {
  const provider: vscode.CodeActionProvider = {
    provideCodeActions(document, _range, actionContext) {
      const fixable = actionContext.diagnostics.filter(diagnosticHasSuggestedFix);
      if (fixable.length === 0) return undefined;

      const action = new vscode.CodeAction(
        'Insert missing MOCK block(s) (mockymock generate --fill)',
        vscode.CodeActionKind.QuickFix
      );
      action.diagnostics = fixable;
      action.command = {
        command: FILL_MISSING_MOCKS_COMMAND,
        title: 'Fill missing mocks',
        arguments: [document.uri],
      };
      return [action];
    },
  };

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider('cut', provider, {
      providedCodeActionKinds: [vscode.CodeActionKind.QuickFix],
    }),
    vscode.commands.registerCommand('mockymock.fillMissingMocks', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target || target.scheme !== 'file') {
        void vscode.window.showErrorMessage('mockymock: open a .cut file to fill its missing mocks.');
        return;
      }
      uri = target;
      // `generate --fill` rewrites the file on disk. An unsaved buffer
      // would not be reloaded by VS Code, the fill would run against the
      // stale on-disk text, and the user's next save would overwrite it.
      const open = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === target.fsPath);
      if (open?.isDirty && !(await open.save())) {
        void vscode.window.showErrorMessage('mockymock: save the .cut file before filling its missing mocks.');
        return;
      }
      const cutPath = uri.fsPath;
      const cblPath = resolveCblPath(cutPath);
      const { executablePath, copybookPaths } = resolveInvocationConfig(context, uri);
      const args = ['generate', cblPath, '--fill', cutPath];
      for (const p of copybookPaths) args.push('--copybook-path', p);

      const result = await runCommand(executablePath, args);
      if (result.code !== 0) {
        void vscode.window.showErrorMessage(
          `mockymock generate --fill failed: ${result.stderr || result.stdout || 'unknown error'}`
        );
        return;
      }
      void vscode.window.showInformationMessage(result.stdout.trim() || 'Mock blocks filled in.');
      // The file changed on disk, not through the editor -- wait for VS
      // Code's own reload of the open buffer before asking for a fresh
      // lint pass, so the new lines are what the diagnostic positions
      // against (see waitForDocumentReload's own doc comment for the
      // bounded-wait rationale).
      await waitForDocumentReload(uri);
      relint(uri);
    })
  );
}
