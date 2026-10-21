import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { runCommand, runCommandIn } from '../environment/commandRunner';
import { describeUnsupportedFeature, supportsExportCommand } from '../environment/checks';
import { focusClickedFile, showCliProblem, showNeedsFile } from '../environment/notify';
import { resolveCliInvocationConfig } from '../environment/invocationConfig';
import { resolveCblPath, suitesForProgram } from '../discovery/cutDiscovery';
import { isCobolPath } from '../environment/cobolPaths';
import { runExport } from './exportRunner';
import { saveBeforeCli } from '../environment/saveBeforeCli';

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
    vscode.commands.registerCommand('mockymock.exportMainframe', async (uri?: vscode.Uri) => {
      await focusClickedFile(uri);
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
        // A successful export opens PROG.mainframe.cbl as the new active
        // editor -- an immediate re-run would otherwise look for suites of
        // an exported file. Requiring a real suite catches that case AND
        // the more general "this .cbl never had a suite" case.
        const suites = suitesForProgram(activePath);
        if (!suites.length) {
          const message = activePath.endsWith('.mainframe.cbl')
            ? `mockymock: "${path.basename(activePath)}" looks like an already-exported file. Open the original .cbl or .cut to export again.`
            : `mockymock: "${path.basename(activePath)}" has no test suite yet. Open the program's .cut suite and try again.`;
          vscode.window.showErrorMessage(message);
          return;
        }
        // The export splices one suite's mocks into the program, so a
        // program with several suites needs to know which.
        const picked =
          suites.length === 1
            ? suites[0]
            : (
                await vscode.window.showQuickPick(
                  suites.map((suite) => ({
                    label: path.basename(suite),
                    description: vscode.workspace.asRelativePath(path.dirname(suite)),
                    suite,
                  })),
                  { title: `Export ${path.basename(activePath)} with which test suite?` }
                )
              )?.suite;
        if (!picked) return;
        cutPath = picked;
      } else {
        await showNeedsFile('Export Mainframe-Ready COBOL', 'cobol-or-cut', 'mockymock.exportMainframe');
        return;
      }

      const { executablePath, copybookPaths, extraCopybookPaths } = await resolveCliInvocationConfig(context, editor!.document.uri);

      const supportsExport = await supportsExportCommand(runCommand, executablePath);
      if (!supportsExport) {
        const message = await describeUnsupportedFeature(
          runCommand,
          executablePath,
          context.extensionPath,
          'exporting mainframe-ready COBOL'
        );
        await showCliProblem(message, executablePath, context.extensionPath);
        return;
      }

      // The CLI reads both files from disk: unsaved MOCKs or cases would
      // silently be missing from the exported source.
      if (!(await saveBeforeCli([cblPath, cutPath], 'exporting'))) return;

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
        () => runExport(executablePath, cblPath, cutPath, copybookPaths, outputPath, runCommandIn(path.dirname(cutPath)), extraCopybookPaths)
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
