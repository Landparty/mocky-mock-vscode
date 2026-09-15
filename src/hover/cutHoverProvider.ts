// src/hover/cutHoverProvider.ts
//
// Hover text for the .cut DSL's generated identifiers (tally counters,
// CAPTURE targets), the `*> STUB EXPECT` protocol comment, and a refusal
// code referenced in a `*>` comment (via `mockymock explain --json`). See
// docs/2026-09-15-cut-editor-intelligence-design.md (sibling mocky-mock
// repo) for the design this implements.
import * as vscode from 'vscode';
import { isExcludedCutPath } from '../discovery/cutDiscovery';
import { runCommand } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { isStubExpectComment, matchIdentifier } from './cutHoverLogic';

const explanationCache = new Map<string, string | null>();

async function explainCode(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  code: string
): Promise<string | null> {
  if (explanationCache.has(code)) return explanationCache.get(code)!;
  const { executablePath } = resolveInvocationConfig(context, uri);
  const result = await runCommand(executablePath, ['explain', code, '--json']);
  if (result.code !== 0) {
    // Not cached: the CLI may simply not be installed yet, or the
    // configured executable may change -- a permanent null would leave
    // this code tooltip-less for the rest of the session.
    return null;
  }
  let explanation: string | null;
  try {
    const payload = JSON.parse(result.stdout) as { explanation?: string };
    explanation = payload.explanation ?? null;
  } catch {
    explanation = null;
  }
  explanationCache.set(code, explanation);
  return explanation;
}

export function activateCutHover(context: vscode.ExtensionContext): void {
  const provider: vscode.HoverProvider = {
    async provideHover(document, position) {
      if (document.uri.scheme !== 'file' || isExcludedCutPath(document.uri.fsPath)) {
        return undefined;
      }
      const range = document.getWordRangeAtPosition(position, /[A-Za-z0-9_-]+/);
      const lineText = document.lineAt(position).text;
      const word = range ? document.getText(range) : '';
      const match = matchIdentifier(word, lineText);

      if (match?.kind === 'tally') {
        return new vscode.Hover(
          new vscode.MarkdownString(
            `**Tally counter.** Incremented each time the program reaches this ` +
              `mocked boundary while the mock is active. Use it in a MOVE/IF ` +
              `condition, or in a \`VERIFY ... WAS CALLED/PERFORMED <n> TIMES\`.`
          ),
          range
        );
      }
      if (match?.kind === 'capture') {
        return new vscode.Hover(
          new vscode.MarkdownString(
            `**Capture target.** Holds the value the program actually passed to ` +
              `this mocked CALL's argument, the last time it was called. Use it ` +
              `in an \`EXPECT\` after the test case's \`PERFORM\`.`
          ),
          range
        );
      }
      if (match?.kind === 'refusalCode') {
        const explanation = await explainCode(context, document.uri, match.code);
        if (explanation === null) return undefined;
        return new vscode.Hover(
          new vscode.MarkdownString(`**${match.code}**\n\n${explanation}`),
          range
        );
      }
      if (isStubExpectComment(lineText)) {
        return new vscode.Hover(
          new vscode.MarkdownString(
            `**Stub expectation.** Placeholder for \`mockymock run --record-expectations\` ` +
              `to fill in with the value the program actually produced. See ` +
              `docs/2026-08-04-record-expectations-design.md in the mocky-mock repo.`
          )
        );
      }
      return undefined;
    },
  };

  context.subscriptions.push(vscode.languages.registerHoverProvider('cut', provider));
}
