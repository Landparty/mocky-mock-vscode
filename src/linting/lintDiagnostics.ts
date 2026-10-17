// src/linting/lintDiagnostics.ts
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import { isExcludedCutPath, resolveCblPath } from '../discovery/cutDiscovery';
import { onDidChangeSuitePairing } from '../discovery/suiteIndexService';
import { isCobolPath, isCopybookPath } from '../environment/cobolPaths';
import { PROJECT_CONFIG_GLOB, runCommandIn } from '../environment/commandRunner';
import { INVOCATION_SETTINGS, resolveInvocationConfig } from '../environment/invocationConfig';
import { ZAPP_FILE_GLOB } from '../environment/zappConfig';
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
  // The program each open .cut was last linted against (whether or not it
  // existed), so a pairing that changes later -- the CLI's answer arriving
  // after activation, a program created or deleted -- can re-lint exactly
  // the suites it affects.
  const lintedAgainst = new Map<string, string>();

  const isOpen = (uri: vscode.Uri): boolean =>
    vscode.workspace.textDocuments.some((d) => d.uri.toString() === uri.toString());

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
      lintedAgainst.set(cutPath, cblPath);
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
      // The document may have closed while the CLI ran; its close handler
      // already cleared the diagnostics, so a late result is discarded
      // rather than left in the Problems panel for a file nobody has open.
      if (!isOpen(document.uri)) {
        collection.delete(document.uri);
        return;
      }
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

  // A suite is linted against its program, so saving, creating or deleting
  // a program re-lints every open suite paired with it (before or after).
  const samePath = (a: string, b: string): boolean =>
    process.platform === 'win32'
      ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase()
      : path.resolve(a) === path.resolve(b);
  const relintSuitesOf = (programUri: vscode.Uri): void => {
    if (!isCobolPath(programUri.fsPath)) return;
    for (const document of vscode.workspace.textDocuments) {
      if (!document.uri.fsPath.endsWith('.cut')) continue;
      const previous = lintedAgainst.get(document.uri.fsPath);
      if (
        (previous !== undefined && samePath(previous, programUri.fsPath)) ||
        samePath(resolveCblPath(document.uri.fsPath), programUri.fsPath)
      ) {
        void lintDocument(document);
      }
    }
  };
  const programWatcher = vscode.workspace.createFileSystemWatcher(
    '**/*.{cbl,cob,cobol,CBL,COB,COBOL}',
    false,
    true,
    false
  );

  const relintAll = (): void => {
    for (const document of vscode.workspace.textDocuments) {
      void lintDocument(document);
    }
  };

  // A fixed (or newly broken) project config changes every suite's lint
  // result without any .cut being saved -- so does a zapp.yml, whose
  // library locations become --copybook-path arguments.
  const configWatcher = vscode.workspace.createFileSystemWatcher(PROJECT_CONFIG_GLOB);
  const zappWatcher = vscode.workspace.createFileSystemWatcher(ZAPP_FILE_GLOB);
  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => void lintDocument(document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      void lintDocument(document);
      relintSuitesOf(document.uri);
      // Any suite's program may COPY the saved copybook.
      if (isCopybookPath(document.uri.fsPath)) relintAll();
    }),
    programWatcher,
    programWatcher.onDidCreate(relintSuitesOf),
    programWatcher.onDidDelete(relintSuitesOf),
    vscode.workspace.onDidCloseTextDocument((document) => {
      collection.delete(document.uri);
      lintedAgainst.delete(document.uri.fsPath);
    }),
    // At activation the CLI's pairing isn't known yet, so a suite under
    // tests/ resolves to a sibling that doesn't exist and lints to nothing;
    // once `mockymock suites --json` answers, re-lint every open suite
    // whose program changed.
    onDidChangeSuitePairing(() => {
      for (const document of vscode.workspace.textDocuments) {
        const previous = lintedAgainst.get(document.uri.fsPath);
        if (previous !== undefined && previous !== resolveCblPath(document.uri.fsPath)) void lintDocument(document);
      }
    }),
    configWatcher,
    zappWatcher,
    ...[
      configWatcher.onDidChange,
      configWatcher.onDidCreate,
      configWatcher.onDidDelete,
      zappWatcher.onDidChange,
      zappWatcher.onDidCreate,
      zappWatcher.onDidDelete,
    ].map((event) => event(relintAll)),
    // Re-evaluate every open .cut when the toggle flips: turning lintOnSave
    // OFF used to leave existing squiggles in the Problems panel until each
    // file was individually saved or closed (lintDocument's own disabled
    // branch deletes them); turning it ON now lints without waiting for a
    // save. Resource-scoped setting, so per-document re-evaluation (not a
    // blanket collection.clear()) is the correct granularity.
    // The copybook-path settings and the CLI path change every suite's
    // result the same way.
    vscode.workspace.onDidChangeConfiguration((e) => {
      const settings = ['mockymock.lintOnSave', ...INVOCATION_SETTINGS];
      if (!settings.some((setting) => e.affectsConfiguration(setting))) return;
      relintAll();
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
