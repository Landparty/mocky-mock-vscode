import * as vscode from 'vscode';
import * as path from 'path';
import { runCommand } from '../environment/commandRunner';
import { resolveExecutablePath } from '../environment/checks';
import { resolveCblPath, resolveCutPath } from '../discovery/cutDiscovery';
import { runExport } from './exportRunner';

// Re-exported so the export feature's pure logic remains reachable from
// this module's public surface, even though it actually lives in
// exportRunner.ts (kept vscode-free there for mocha -- see that file).
export { buildExportArgs, runExport } from './exportRunner';
export type { ExportResult } from './exportRunner';

function defaultOutputPath(cblPath: string): string {
  const parsed = path.parse(cblPath);
  return path.join(parsed.dir, `${parsed.name}.mainframe.cbl`);
}

// One-shot palette action (like mockymock.checkEnvironment), not wired
// into the Testing API tree: it produces one artifact per program/cut
// pair, not a per-test-case result. v1 requires an active .cbl or .cut
// editor -- no quick-pick fallback across every discovered suite, kept
// deliberately out of scope (see docs/2026-08-03-mainframe-export-
// command-design.md's Alternatives Considered).
export function activateExportMainframeCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.exportMainframe', async () => {
      const editor = vscode.window.activeTextEditor;
      const activePath = editor?.document.uri.fsPath;
      let cblPath: string;
      let cutPath: string;
      if (activePath?.endsWith('.cut')) {
        cutPath = activePath;
        cblPath = resolveCblPath(activePath);
      } else if (activePath?.endsWith('.cbl')) {
        cblPath = activePath;
        cutPath = resolveCutPath(activePath);
      } else {
        vscode.window.showErrorMessage(
          'mockymock: open a .cbl or .cut file first, then run "Export Mainframe-Ready COBOL".'
        );
        return;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor!.document.uri);
      const config = vscode.workspace.getConfiguration('mockymock', editor!.document.uri);
      const executablePath = resolveExecutablePath(config.get<string>('executablePath'), context.extensionPath);
      const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
        workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
      );
      const outputPath = defaultOutputPath(cblPath);

      const result = await runExport(executablePath, cblPath, cutPath, copybookPaths, outputPath, runCommand);
      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(`mockymock export failed:\n${result.stdout}${result.stderr}`);
        return;
      }
      const doc = await vscode.workspace.openTextDocument(outputPath);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(`mockymock: exported mainframe-ready source to ${outputPath}`);
    })
  );
}
