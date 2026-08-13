import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runCommand } from '../environment/commandRunner';
import { supportsExportCommand } from '../environment/checks';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { resolveCblPath, resolveCutPath } from '../discovery/cutDiscovery';
import { isCobolPath } from '../boundaries/viewRefreshPolicy';
import { runExport } from './exportRunner';

function defaultOutputPath(cblPath: string): string {
  const parsed = path.parse(cblPath);
  return path.join(parsed.dir, `${parsed.name}.mainframe.cbl`);
}

// One-shot palette action (like mockymock.checkEnvironment), not wired
// into the Testing API tree: it produces one artifact per program/cut
// pair, not a per-test-case result. v1 deliberately requires an active
// .cbl/.cut editor; the design doc's `### VS Code command` step 1
// sketches a quick-pick fallback across discovered suites, deferred for
// now (see the mocky-mock repo's docs/2026-08-03-mainframe-export-
// command-design.md).
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
      } else if (activePath && isCobolPath(activePath)) {
        // isCobolPath, not endsWith('.cbl'): .cob/.cobol are registered for
        // the cobol language in package.json and accepted by analyzeCobol --
        // rejecting them here was an inconsistency, not a policy.
        cblPath = activePath;
        cutPath = resolveCutPath(activePath);
        // A successful export opens PROG.mainframe.cbl as the new active
        // editor -- an immediate re-run would otherwise resolve a
        // nonexistent PROG.mainframe.cut and PROG.mainframe.mainframe.cbl
        // and fail confusingly. Checking that the paired .cut actually
        // exists (rather than string-matching the filename) catches that
        // case AND the more general "this .cbl never had a suite" case.
        try {
          await fs.access(cutPath);
        } catch {
          const message = activePath.endsWith('.mainframe.cbl')
            ? `mockymock: "${path.basename(activePath)}" looks like an already-exported file. Open the original .cbl or .cut to export again.`
            : `mockymock: no ${path.basename(cutPath)} found next to "${path.basename(activePath)}". Open the program's .cut suite and try again.`;
          vscode.window.showErrorMessage(message);
          return;
        }
      } else {
        vscode.window.showErrorMessage(
          'mockymock: open a .cbl or .cut file first, then run "Export Mainframe-Ready COBOL".'
        );
        return;
      }

      const { executablePath, copybookPaths } = resolveInvocationConfig(context, editor!.document.uri);

      const supportsExport = await supportsExportCommand(runCommand, executablePath);
      if (!supportsExport) {
        vscode.window.showErrorMessage(
          `mockymock at "${executablePath}" is too old to support exporting mainframe-ready COBOL ` +
            '(needs the export subcommand). Upgrade mockymock and try again.'
        );
        return;
      }

      const outputPath = defaultOutputPath(cblPath);

      // Same overwrite discipline as the Boundaries view's "Generate .cut"
      // handler (extension.ts's runGenerateCutCommand): never silently
      // destroy an existing output file. Modal, so Escape / Cancel means no
      // export at all.
      let outputExists = true;
      try {
        await fs.access(outputPath);
      } catch {
        outputExists = false;
      }
      if (outputExists) {
        const overwriteChoice = 'Overwrite';
        const choice = await vscode.window.showWarningMessage(
          `mockymock: "${path.basename(outputPath)}" already exists.`,
          { modal: true },
          overwriteChoice
        );
        if (choice !== overwriteChoice) {
          return;
        }
      }

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Exporting mainframe-ready COBOL...' },
        () => runExport(executablePath, cblPath, cutPath, copybookPaths, outputPath, runCommand)
      );
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
