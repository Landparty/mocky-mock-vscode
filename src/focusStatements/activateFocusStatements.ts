// src/focusStatements/activateFocusStatements.ts
import * as vscode from 'vscode';
import { FocusStatementsFoldingProvider } from './focusFoldingProvider';

const FOLD_RETRY_ATTEMPTS = 5;
const FOLD_RETRY_DELAY_MS = 50;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// setFocused() fires onDidChangeFoldingRanges, which only *schedules* VS
// Code's folding model to re-query this provider -- it does not guarantee
// the model has actually picked up the new (non-empty) ranges by the time
// this function's very next line runs. Calling editor.foldAll immediately
// after can therefore silently fold nothing on the first toggle. Rather
// than guess a fixed delay for that internal debounce, poll: reissue
// editor.foldAll until the editor's visibleRanges show something actually
// folded, or give up quietly after a bounded number of attempts (a no-op
// fold is a missed toggle, not a crash).
async function foldFocusedRanges(editor: vscode.TextEditor, provider: FocusStatementsFoldingProvider): Promise<void> {
  if (provider.focusGapsFor(editor.document).length === 0) return;
  const visibleRangesBeforeFold = editor.visibleRanges.length;
  for (let attempt = 0; attempt < FOLD_RETRY_ATTEMPTS; attempt++) {
    await vscode.commands.executeCommand('editor.foldAll');
    if (editor.visibleRanges.length > visibleRangesBeforeFold) return;
    await sleep(FOLD_RETRY_DELAY_MS);
  }
}

// Registered for the whole `cobol` language, same as the Outline provider --
// not gated behind mockymock.cobolOpen or any CLI/Docker check, since this
// only needs the text of the currently open document, no mockymock CLI call.
//
// editor.foldAll/unfoldAll act on VS Code's active editor implicitly, which
// is why the command bails out early if the active editor isn't a COBOL
// file rather than taking a document parameter.
export function activateFocusStatements(context: vscode.ExtensionContext): void {
  const provider = new FocusStatementsFoldingProvider();

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider({ language: 'cobol' }, provider),
    vscode.workspace.onDidCloseTextDocument((document) => provider.forget(document.uri)),
    vscode.commands.registerCommand('mockymock.focusStatements.toggle', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== 'cobol') return;

      const nowFocused = !provider.isFocused(editor.document);
      provider.setFocused(editor.document, nowFocused);
      if (nowFocused) {
        await foldFocusedRanges(editor, provider);
      } else {
        await vscode.commands.executeCommand('editor.unfoldAll');
      }
    })
  );
}
