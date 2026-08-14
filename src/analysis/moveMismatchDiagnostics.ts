// src/analysis/moveMismatchDiagnostics.ts
import * as vscode from 'vscode';
import { runCommand } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { supportsAnalyzeCommand } from '../environment/checks';
import { buildAnalyzeArgs } from './analysisRunner';
import { parseMoveMismatchOutput } from './moveMismatchOutput';

const COBOL_FILE_RE = /\.(cbl|cob|cobol)$/i;

// Runs `mockymock analyze move-type-check` (pure static analysis, zero
// Docker) on the active COBOL source file on focus/save and publishes MOVE
// data-category mismatches as editor diagnostics -- the ambient counterpart
// to the "Analyze COBOL File..." command's on-demand JSON dump.
//
// Scoped to the active editor + saves rather than every open document
// (unlike lintDiagnostics.ts's .cut handling): each run is a full COBOL
// parse with copybook expansion in a spawned CPython process, and a
// mainframe workspace routinely has hundreds of .cbl files. Checking every
// vscode.workspace.textDocuments -- which also includes documents VS Code
// opens invisibly for peek/diff/search-preview -- would fire an unbounded
// burst of parses just from opening a folder.
export function activateMoveMismatchDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('mockymock-move-check');
  context.subscriptions.push(collection);

  // Same "one in-flight run per file, a save during a run queues exactly one
  // re-run" dedup as lintDiagnostics.ts's lintDocument.
  const inFlight = new Set<string>();
  const queued = new Set<string>();

  async function checkDocument(document: vscode.TextDocument): Promise<void> {
    if (!COBOL_FILE_RE.test(document.uri.fsPath) || document.uri.scheme !== 'file') return;
    const config = vscode.workspace.getConfiguration('mockymock', document.uri);
    if (!(config.get<boolean>('moveCheckOnSave') ?? true)) {
      collection.delete(document.uri);
      return;
    }

    const cblPath = document.uri.fsPath;
    if (inFlight.has(cblPath)) {
      queued.add(cblPath);
      return;
    }
    inFlight.add(cblPath);
    try {
      const { executablePath, copybookPaths } = resolveInvocationConfig(context, document.uri);

      if (!(await supportsAnalyzeCommand(runCommand, executablePath))) {
        // CLI not installed, not spawnable, or too old for `analyze`: silence,
        // not squiggles -- same posture as lintDiagnostics.ts's code === -1
        // branch. The Analyze COBOL File... command owns install/upgrade UX.
        collection.delete(document.uri);
        return;
      }

      const args = buildAnalyzeArgs('move-type-check', cblPath, copybookPaths);
      const result = await runCommand(executablePath, args);
      if (result.code !== 0) {
        // Non-zero here means the file failed to parse (or some other
        // analyzer-level failure) -- this feature only reports MOVE
        // mismatches on a file that parsed, so it degrades silently rather
        // than duplicating whatever surfaces COBOL syntax errors.
        collection.delete(document.uri);
        return;
      }

      const { problems, unresolvedCount } = parseMoveMismatchOutput(result.stdout);
      if (!problems.length && !unresolvedCount) {
        collection.delete(document.uri);
        return;
      }

      const diagnostics = problems.map((problem) => {
        const zeroBased = Math.max(0, problem.line - 1);
        const lineLength = zeroBased < document.lineCount ? document.lineAt(zeroBased).text.length : 0;
        const diagnostic = new vscode.Diagnostic(
          new vscode.Range(zeroBased, 0, zeroBased, Math.max(lineLength, 1)),
          problem.message,
          problem.severity === 'ERROR' ? vscode.DiagnosticSeverity.Error : vscode.DiagnosticSeverity.Warning
        );
        diagnostic.source = 'mockymock';
        diagnostic.code = problem.severity;
        return diagnostic;
      });

      if (unresolvedCount > 0) {
        // "Zero violations" from a file with unresolved operands (e.g. an
        // unresolved COPY -- confirmed empirically: exit 0, violations: [],
        // unresolved_count > 0) means "not fully checked", not "clean". A
        // silent, single Information note at the top of the file keeps that
        // distinction visible without a squiggle per unresolved operand.
        const firstLineLength = document.lineCount > 0 ? document.lineAt(0).text.length : 0;
        const note = new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, Math.max(firstLineLength, 1)),
          `mockymock: ${unresolvedCount} MOVE operand(s) could not be resolved (e.g. an unresolved COPY) ` +
            'and were skipped by the MOVE type check -- add mockymock.copybookPaths or run ' +
            '"Analyze COBOL File..." for details.',
          vscode.DiagnosticSeverity.Information
        );
        note.source = 'mockymock';
        note.code = 'UNRESOLVED_MOVE_OPERANDS';
        diagnostics.push(note);
      }

      collection.set(document.uri, diagnostics);
    } finally {
      inFlight.delete(cblPath);
      if (queued.delete(cblPath)) {
        const reopened = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === cblPath);
        if (reopened) void checkDocument(reopened);
      }
    }
  }

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) void checkDocument(editor.document);
    }),
    vscode.workspace.onDidSaveTextDocument((document) => void checkDocument(document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('mockymock.moveCheckOnSave')) return;
      // Resource-scoped setting: a document outside the active editor may
      // have just been disabled (e.g. a per-folder override in a multi-root
      // workspace) and would otherwise keep its stale squiggles until it's
      // next focused/saved/closed. Clear those proactively without
      // re-analyzing them -- only the active editor gets a fresh check.
      for (const document of vscode.workspace.textDocuments) {
        if (!COBOL_FILE_RE.test(document.uri.fsPath) || document.uri.scheme !== 'file') continue;
        const config = vscode.workspace.getConfiguration('mockymock', document.uri);
        if (!(config.get<boolean>('moveCheckOnSave') ?? true)) {
          collection.delete(document.uri);
        }
      }
      const editor = vscode.window.activeTextEditor;
      if (editor) void checkDocument(editor.document);
    })
  );
  if (vscode.window.activeTextEditor) {
    void checkDocument(vscode.window.activeTextEditor.document);
  }
}
