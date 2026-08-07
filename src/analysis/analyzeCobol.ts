import * as vscode from 'vscode';
import * as path from 'path';
import { runCommand } from '../environment/commandRunner';
import { resolveExecutablePath, supportsAnalyzeCommand } from '../environment/checks';
import { CobolAnalyzer, runAnalyze } from './analysisRunner';

interface AnalyzerOption {
  analyzer: CobolAnalyzer;
  label: string;
  description: string;
}

const ANALYZER_OPTIONS: AnalyzerOption[] = [
  { analyzer: 'dead-code', label: 'Dead Code', description: 'Unreferenced paragraphs/sections' },
  { analyzer: 'program-flow', label: 'Program Flow', description: 'Control flow: PERFORM, GO TO, CALL' },
  { analyzer: 'io-sequence', label: 'I/O Sequence', description: 'File OPEN/READ/WRITE/CLOSE lifecycle validation' },
  { analyzer: 'move-type-check', label: 'MOVE Type Check', description: 'MOVE statement data category compatibility' },
  { analyzer: 'linkage-check', label: 'Linkage Check', description: 'LINKAGE SECTION vs CALL/ENTRY USING validation' },
  { analyzer: 'language-env', label: 'Language Environment', description: 'Intrinsic functions & LE service calls' },
  { analyzer: 'ims-dli', label: 'IMS DLI', description: 'CBLTDLI/AIBTDLI/CEETDLI segment references' },
  { analyzer: 'analyze', label: 'Dynamic Call Analysis', description: 'Resolves dynamic CALL target values' },
];

let analysisOutputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!analysisOutputChannel) {
    analysisOutputChannel = vscode.window.createOutputChannel('mockymock: Analysis');
  }
  return analysisOutputChannel;
}

// One-shot palette action (like mockymock.checkEnvironment and
// mockymock.exportMainframe), requiring an active .cbl/.cob/.cobol editor.
// v1 is deliberately "run one analyzer, show its JSON" -- no diagnostics,
// no per-analyzer UI (see the design doc's "explicitly out of scope").
export function activateAnalyzeCobolCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.analyzeCobol', async () => {
      const editor = vscode.window.activeTextEditor;
      const activePath = editor?.document.uri.fsPath;
      if (!activePath || !/\.(cbl|cob|cobol)$/i.test(activePath)) {
        vscode.window.showErrorMessage(
          'mockymock: open a .cbl, .cob, or .cobol file first, then run "Analyze COBOL File...".'
        );
        return;
      }

      const executablePath = resolveExecutablePath(
        vscode.workspace.getConfiguration('mockymock').get<string>('executablePath'),
        context.extensionPath
      );

      const supportsAnalyze = await supportsAnalyzeCommand(runCommand, executablePath);
      if (!supportsAnalyze) {
        vscode.window.showErrorMessage(
          `mockymock at "${executablePath}" is too old to support COBOL analysis ` +
            '(needs the analyze subcommand). Upgrade mockymock and try again.'
        );
        return;
      }

      const picked = await vscode.window.showQuickPick(
        ANALYZER_OPTIONS.map((opt) => ({
          label: opt.label,
          description: opt.description,
          analyzer: opt.analyzer,
        })),
        { placeHolder: 'Choose a cobol-parser analyzer to run' }
      );
      if (!picked) {
        return;
      }

      const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor!.document.uri);
      const config = vscode.workspace.getConfiguration('mockymock', editor!.document.uri);
      const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
        workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
      );

      const result = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Running ${picked.label} analysis...` },
        () => runAnalyze(executablePath, picked.analyzer, activePath, copybookPaths, runCommand)
      );

      if (result.exitCode !== 0) {
        vscode.window.showErrorMessage(
          `mockymock analyze ${picked.analyzer} failed:\n${result.stdout}${result.stderr}`
        );
        return;
      }

      const channel = getOutputChannel();
      channel.clear();
      try {
        const parsed = JSON.parse(result.stdout);
        channel.appendLine(JSON.stringify(parsed, null, 2));
      } catch {
        channel.appendLine(result.stdout);
      }
      channel.show();
    })
  );
}
