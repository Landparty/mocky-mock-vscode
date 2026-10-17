// src/linting/lintDiagnostics.ts
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { isExcludedCutPath, resolveCblPath } from '../discovery/cutDiscovery';
import { PROJECT_CONFIG_GLOB, runCommandIn } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { cutRelativeLine, LintWarning, parseLintOutput, parseLintWarnings } from './lintOutput';

// Runs `mockymock lint` (pure static analysis, zero Docker) on every open or
// saved .cut file whose paired .cbl exists, and publishes the problems as
// editor diagnostics — the same "problems before you run anything" loop
// pytest users get from collection errors.
//
// Returns a `relint(uri)` trigger so another feature (lintCodeActionProvider's
// `generate --fill` command, which changes the .cut file on disk without
// going through a user-initiated save) can ask for a fresh lint pass
// against the same shared diagnostic collection, instead of duplicating
// this module's lint-invocation/parsing logic or waiting on an event that
// an external file write never fires.
export function activateLintDiagnostics(
  context: vscode.ExtensionContext
): (uri: vscode.Uri) => void {
  const collection = vscode.languages.createDiagnosticCollection('mockymock');
  context.subscriptions.push(collection);

  // One in-flight lint per file; a save during a lint queues exactly one
  // re-lint rather than stacking processes.
  const inFlight = new Set<string>();
  const queued = new Set<string>();

  async function lintDocument(document: vscode.TextDocument): Promise<void> {
    if (!document.uri.fsPath.endsWith('.cut') || document.uri.scheme !== 'file') return;
    if (isExcludedCutPath(document.uri.fsPath, vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath)) return;
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

      const { executablePath, copybookPaths } = resolveInvocationConfig(context, document.uri);
      const args = ['lint', cblPath, '--cut', cutPath];
      for (const p of copybookPaths) args.push('--copybook-path', p);

      const result = await runCommandIn(path.dirname(cutPath))(executablePath, args);
      const rangeForLine = (cutLine: number | null): vscode.Range => {
        const zeroBased = cutLine !== null ? Math.max(0, cutLine - 1) : 0;
        const lineLength = zeroBased < document.lineCount ? document.lineAt(zeroBased).text.length : 0;
        return new vscode.Range(zeroBased, 0, zeroBased, Math.max(lineLength, 1));
      };
      const warningDiagnostics = (warnings: LintWarning[]): vscode.Diagnostic[] =>
        warnings.map((warning) => {
          const diagnostic = new vscode.Diagnostic(
            rangeForLine(warning.line),
            warning.message,
            vscode.DiagnosticSeverity.Warning
          );
          diagnostic.source = 'mockymock';
          diagnostic.code = warning.code;
          return diagnostic;
        });
      if (result.code === 0) {
        const warnings = parseLintWarnings(result.stdout);
        if (warnings.length) collection.set(document.uri, warningDiagnostics(warnings));
        else collection.delete(document.uri);
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
      collection.set(document.uri, [
        ...problems.map((problem) => {
          const diagnostic = new vscode.Diagnostic(
            rangeForLine(cutRelativeLine(problem)),
            problem.message,
            vscode.DiagnosticSeverity.Error
          );
          diagnostic.source = 'mockymock';
          if (problem.code) diagnostic.code = problem.code;
          return diagnostic;
        }),
        ...warningDiagnostics(parseLintWarnings(result.stdout)),
      ]);
    } finally {
      inFlight.delete(cutPath);
      if (queued.delete(cutPath)) {
        const reopened = vscode.workspace.textDocuments.find((d) => d.uri.fsPath === cutPath);
        if (reopened) void lintDocument(reopened);
      }
    }
  }

  // A fixed (or newly broken) project config changes every suite's lint
  // result without any .cut being saved.
  const configWatcher = vscode.workspace.createFileSystemWatcher(PROJECT_CONFIG_GLOB);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => void lintDocument(document)),
    vscode.workspace.onDidSaveTextDocument((document) => void lintDocument(document)),
    vscode.workspace.onDidCloseTextDocument((document) => collection.delete(document.uri)),
    configWatcher,
    ...[configWatcher.onDidChange, configWatcher.onDidCreate, configWatcher.onDidDelete].map((event) =>
      event(() => {
        for (const document of vscode.workspace.textDocuments) {
          void lintDocument(document);
        }
      })
    ),
    // Re-evaluate every open .cut when the toggle flips: turning lintOnSave
    // OFF used to leave existing squiggles in the Problems panel until each
    // file was individually saved or closed (lintDocument's own disabled
    // branch deletes them); turning it ON now lints without waiting for a
    // save. Resource-scoped setting, so per-document re-evaluation (not a
    // blanket collection.clear()) is the correct granularity.
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (!e.affectsConfiguration('mockymock.lintOnSave')) return;
      for (const document of vscode.workspace.textDocuments) {
        void lintDocument(document);
      }
    })
  );
  for (const document of vscode.workspace.textDocuments) {
    void lintDocument(document);
  }

  return (uri: vscode.Uri) => {
    const document = vscode.workspace.textDocuments.find(
      (d) => d.uri.fsPath === uri.fsPath
    );
    if (document) void lintDocument(document);
  };
}
