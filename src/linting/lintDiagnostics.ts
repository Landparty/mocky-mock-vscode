// src/linting/lintDiagnostics.ts
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { isExcludedCutPath, resolveCblPath } from '../discovery/cutDiscovery';
import { runCommand } from '../environment/commandRunner';
import { resolveExecutablePath } from '../environment/checks';
import { cutRelativeLine, parseLintOutput } from './lintOutput';

// Runs `mockymock lint` (pure static analysis, zero Docker) on every open or
// saved .cut file whose paired .cbl exists, and publishes the problems as
// editor diagnostics — the same "problems before you run anything" loop
// pytest users get from collection errors.
export function activateLintDiagnostics(context: vscode.ExtensionContext): void {
  const collection = vscode.languages.createDiagnosticCollection('mockymock');
  context.subscriptions.push(collection);

  // One in-flight lint per file; a save during a lint queues exactly one
  // re-lint rather than stacking processes.
  const inFlight = new Set<string>();
  const queued = new Set<string>();

  async function lintDocument(document: vscode.TextDocument): Promise<void> {
    if (!document.uri.fsPath.endsWith('.cut') || document.uri.scheme !== 'file') return;
    if (isExcludedCutPath(document.uri.fsPath)) return;
    const config = vscode.workspace.getConfiguration('mockymock', document.uri);
    if (!(config.get<boolean>('lintOnSave') ?? true)) {
      collection.delete(document.uri);
      return;
    }

    const cutPath = document.uri.fsPath;
    if (inFlight.has(cutPath)) {
      queued.add(cutPath);
      return;
    }
    inFlight.add(cutPath);
    try {
      const cblPath = resolveCblPath(cutPath);
      try {
        await fs.access(cblPath);
      } catch {
        // No paired program — nothing lint can check; don't nag.
        collection.delete(document.uri);
        return;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
      const executablePath = resolveExecutablePath(config.get<string>('executablePath'), context.extensionPath);
      const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
        workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
      );
      const args = ['lint', cblPath, '--cut', cutPath];
      for (const p of copybookPaths) args.push('--copybook-path', p);

      const result = await runCommand(executablePath, args);
      if (result.code === 0) {
        collection.delete(document.uri);
        return;
      }
      if (result.code === -1) {
        // CLI not installed / not spawnable: silence, not squiggles — the
        // EnvironmentManager owns installation UX at run time.
        collection.delete(document.uri);
        return;
      }
      const problems = parseLintOutput(result.stdout);
      if (!problems.length) {
        // Nonzero exit with nothing parseable (e.g. a CLI predating `lint`
        // printing argparse usage on stderr) — treat as "lint unavailable".
        collection.delete(document.uri);
        return;
      }
      collection.set(
        document.uri,
        problems.map((problem) => {
          const cutLine = cutRelativeLine(problem);
          const zeroBased = cutLine !== null ? Math.max(0, cutLine - 1) : 0;
          const lineLength =
            zeroBased < document.lineCount ? document.lineAt(zeroBased).text.length : 0;
          const diagnostic = new vscode.Diagnostic(
            new vscode.Range(zeroBased, 0, zeroBased, Math.max(lineLength, 1)),
            problem.message,
            vscode.DiagnosticSeverity.Error
          );
          diagnostic.source = 'mockymock';
          if (problem.code) diagnostic.code = problem.code;
          return diagnostic;
        })
      );
    } finally {
      inFlight.delete(cutPath);
      if (queued.delete(cutPath)) {
        const reopened = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === cutPath);
        if (reopened) void lintDocument(reopened);
      }
    }
  }

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => void lintDocument(document)),
    vscode.workspace.onDidSaveTextDocument((document) => void lintDocument(document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri))
  );
  for (const document of vscode.workspace.textDocuments) {
    void lintDocument(document);
  }
}
