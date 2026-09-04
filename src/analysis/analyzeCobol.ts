import * as vscode from 'vscode';
import { runCommand } from '../environment/commandRunner';
import { describeUnsupportedFeature, supportsAnalyzeCommand } from '../environment/checks';
import { showCliProblem, showNeedsFile } from '../environment/notify';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { CobolAnalyzer, runAnalyze } from './analysisRunner';

interface AnalyzerOption {
  // Suffix for this analyzer's direct command: mockymock.analyzeCobol.<id> --
  // distinct from the 'analyzer' CLI arg so the 'analyze' analyzer (Dynamic
  // Call Analysis) doesn't collide with the mockymock.analyzeCobol command
  // itself.
  id: string;
  analyzer: CobolAnalyzer;
  label: string;
  description: string;
}

const ANALYZER_OPTIONS: AnalyzerOption[] = [
  { id: 'deadCode', analyzer: 'dead-code', label: 'Dead Code', description: 'Unreferenced paragraphs/sections' },
  { id: 'programFlow', analyzer: 'program-flow', label: 'Program Flow', description: 'Control flow: PERFORM, GO TO, CALL' },
  { id: 'ioSequence', analyzer: 'io-sequence', label: 'I/O Sequence', description: 'File OPEN/READ/WRITE/CLOSE lifecycle validation' },
  { id: 'moveTypeCheck', analyzer: 'move-type-check', label: 'MOVE Type Check', description: 'MOVE statement data category compatibility' },
  { id: 'linkageCheck', analyzer: 'linkage-check', label: 'Linkage Check', description: 'LINKAGE SECTION vs CALL/ENTRY USING validation' },
  { id: 'languageEnv', analyzer: 'language-env', label: 'Language Environment', description: 'Intrinsic functions & LE service calls' },
  { id: 'imsDli', analyzer: 'ims-dli', label: 'IMS DLI', description: 'CBLTDLI/AIBTDLI/CEETDLI segment references' },
  { id: 'dynamicCall', analyzer: 'analyze', label: 'Dynamic Call Analysis', description: 'Resolves dynamic CALL target values' },
];

let analysisOutputChannel: vscode.OutputChannel | undefined;

function getOutputChannel(): vscode.OutputChannel {
  if (!analysisOutputChannel) {
    analysisOutputChannel = vscode.window.createOutputChannel('mockymock: Analysis');
  }
  return analysisOutputChannel;
}

// Shared body for both the QuickPick-driven mockymock.analyzeCobol command
// and each direct mockymock.analyzeCobol.<id> command (editor context menu):
// validate the active editor, confirm the CLI supports `analyze`, run it,
// and render the result into the shared output channel.
async function runAnalyzerCommand(
  context: vscode.ExtensionContext,
  analyzer: CobolAnalyzer,
  label: string,
  analyzerCommandId: string
): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  const activePath = editor?.document.uri.fsPath;
  if (!activePath || !/\.(cbl|cob|cobol)$/i.test(activePath)) {
    await showNeedsFile(`Analyze: ${label}`, 'cobol', `mockymock.analyzeCobol.${analyzerCommandId}`);
    return;
  }

  const { executablePath, copybookPaths } = resolveInvocationConfig(context, editor!.document.uri);

  const supportsAnalyze = await supportsAnalyzeCommand(runCommand, executablePath);
  if (!supportsAnalyze) {
    const message = await describeUnsupportedFeature(runCommand, executablePath, context.extensionPath, 'COBOL analysis');
    await showCliProblem(message, executablePath, context.extensionPath);
    return;
  }

  const result = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Running ${label} analysis...` },
    () => runAnalyze(executablePath, analyzer, activePath, copybookPaths, runCommand)
  );

  const channel = getOutputChannel();
  channel.clear();
  try {
    channel.appendLine(JSON.stringify(JSON.parse(result.stdout), null, 2));
  } catch {
    channel.appendLine('--- raw output (not valid JSON) ---');
    channel.appendLine(result.stdout);
  }
  if (result.stderr.trim()) {
    channel.appendLine('--- stderr ---');
    channel.appendLine(result.stderr);
  }
  channel.show();
  if (result.exitCode !== 0) {
    vscode.window.showErrorMessage(`mockymock analyze ${analyzer} failed — see the "mockymock: Analysis" output.`);
  }
}

// One-shot palette/context-menu actions (like mockymock.checkEnvironment and
// mockymock.exportMainframe), requiring an active .cbl/.cob/.cobol editor.
// v1 is deliberately "run one analyzer, show its JSON" -- no diagnostics,
// no per-analyzer UI (see the design doc's "explicitly out of scope").
//
// Registers both the original QuickPick command (mockymock.analyzeCobol,
// still on the Command Palette) and one direct command per ANALYZER_OPTIONS
// entry (mockymock.analyzeCobol.<id>) so the editor's right-click menu can
// run a specific cobol-parser analyzer without the picker round-trip.
export function activateAnalyzeCobolCommand(context: vscode.ExtensionContext): void {
  // analysisOutputChannel is a module-level singleton (see getOutputChannel),
  // so disposing it can't be a plain `context.subscriptions.push(channel)` --
  // that would leave the module variable pointing at a disposed object after
  // deactivation, silently no-op-ing appendLine on a later activate() in the
  // same host. Null it out alongside disposal instead.
  context.subscriptions.push({
    dispose: () => {
      analysisOutputChannel?.dispose();
      analysisOutputChannel = undefined;
    },
  });

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.analyzeCobol', async () => {
      const picked = await vscode.window.showQuickPick(
        ANALYZER_OPTIONS.map((opt) => ({
          label: opt.label,
          description: opt.description,
          analyzer: opt.analyzer,
          id: opt.id,
        })),
        { placeHolder: 'Choose a cobol-parser analyzer to run' }
      );
      if (!picked) {
        return;
      }
      await runAnalyzerCommand(context, picked.analyzer, picked.label, picked.id);
    })
  );

  for (const opt of ANALYZER_OPTIONS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`mockymock.analyzeCobol.${opt.id}`, () =>
        runAnalyzerCommand(context, opt.analyzer, opt.label, opt.id)
      )
    );
  }
}
