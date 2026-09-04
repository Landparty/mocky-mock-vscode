import * as vscode from 'vscode';
import { runCommand } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { describeRefreshError, describeUnsupportedFeature, supportsAnalyzeCommand } from '../environment/checks';
import { RefreshGuard } from '../boundaries/refreshGuard';
import { ProgramFlowFetchError } from '../paragraphTree/programFlowClient';
import { fetchProgramFlowShared } from '../paragraphTree/sharedProgramFlowFetch';
import type { ProgramFlowReport } from '../paragraphTree/programFlowModel';
import { fetchProgramFlowMermaid, ProgramFlowMermaidFetchError } from './programFlowMermaidClient';
import { summarizeProgramFlow, ProgramFlowSummary } from './programFlowSummary';
import { buildWebviewHtml, getNonce } from './webviewHtml';

type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'reveal'; line: number }
  | { type: 'openFile' }
  | { type: 'showOutput' };

type ExtensionToWebviewMessage =
  | { type: 'diagram'; mermaidText: string; report: ProgramFlowReport; summary: ProgramFlowSummary; programName: string }
  | { type: 'empty' }
  | { type: 'error'; message: string; hasDetail: boolean };

interface ProgramFlowModel {
  mermaidText: string;
  report: ProgramFlowReport;
}

interface ErrorState {
  message: string;
  stderr?: string;
}

// WebviewViewProvider backing the Program Flow sidebar view. Same
// RefreshGuard-guarded fetch orchestration and message-protocol shape as
// ParagraphTreeViewProvider -- see that file for the pattern this mirrors.
export class ProgramFlowViewProvider implements vscode.WebviewViewProvider {
  private readonly guard = new RefreshGuard<ProgramFlowModel>();
  private readonly outputChannel: vscode.OutputChannel;
  private webviewView: vscode.WebviewView | undefined;
  private lastError: ErrorState | undefined;

  onVisible?: () => void;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('mockymock program flow');
    context.subscriptions.push(this.outputChannel);
  }

  get cblPath(): string | undefined {
    return this.guard.cblPath;
  }

  get visible(): boolean {
    return this.webviewView?.visible ?? false;
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webviewView = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'out', 'media', 'programFlow')],
    };

    const nonce = getNonce();
    const scriptUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'media', 'programFlow', 'main.js')
    );
    const styleUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'media', 'programFlow', 'styles.css')
    );
    webviewView.webview.html = buildWebviewHtml({
      cspSource: webviewView.webview.cspSource,
      scriptUri: scriptUri.toString(),
      styleUri: styleUri.toString(),
      nonce,
    });

    webviewView.webview.onDidReceiveMessage((message: WebviewToExtensionMessage) => {
      if (message.type === 'reveal') {
        void this.revealLine(message.line);
      } else if (message.type === 'openFile') {
        void this.openFile();
      } else if (message.type === 'showOutput') {
        this.outputChannel.show();
      } else if (message.type === 'ready') {
        this.postCurrentState();
      }
    });

    webviewView.onDidChangeVisibility(() => {
      if (webviewView.visible) this.onVisible?.();
    });
    if (webviewView.visible) this.onVisible?.();
  }

  private postCurrentState(): void {
    if (this.lastError) {
      this.post({ type: 'error', message: this.lastError.message, hasDetail: !!this.lastError.stderr });
    } else if (this.guard.model) {
      const { mermaidText, report } = this.guard.model;
      this.post({
        type: 'diagram',
        mermaidText,
        report,
        summary: summarizeProgramFlow(report),
        programName: report.program_name,
      });
    } else {
      this.post({ type: 'empty' });
    }
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.webviewView?.webview.postMessage(message);
  }

  private async openFile(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { COBOL: ['cbl', 'cob', 'cobol'] },
    });
    if (picked && picked[0]) {
      await vscode.window.showTextDocument(picked[0]);
    }
  }

  private async revealLine(line: number): Promise<void> {
    const cblPath = this.guard.cblPath;
    if (!cblPath) return;
    const doc = await vscode.workspace.openTextDocument(cblPath);
    const editor = await vscode.window.showTextDocument(doc, { preserveFocus: false });
    // Clamp: vscode.Range throws IllegalArgument on a negative line, and this
    // `line` crossed the webview message boundary un-revalidated -- a 0 here
    // would otherwise be an unhandled rejection that eats the click silently.
    const zeroBased = Math.min(Math.max(0, line - 1), doc.lineCount - 1);
    const range = new vscode.Range(zeroBased, 0, zeroBased, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(range.start, range.start);
  }

  async refresh(cblPath: string | undefined): Promise<void> {
    const token = this.guard.begin();

    if (!cblPath) {
      this.guard.commit(token, undefined, undefined);
      this.lastError = undefined;
      this.post({ type: 'empty' });
      return;
    }

    let nextModel: ProgramFlowModel | undefined;
    let nextError: ErrorState | undefined;
    try {
      const uri = vscode.Uri.file(cblPath);
      const { executablePath } = resolveInvocationConfig(this.context, uri);

      const supportsAnalyze = await supportsAnalyzeCommand(runCommand, executablePath);
      if (!supportsAnalyze) {
        throw new ProgramFlowFetchError(
          await describeUnsupportedFeature(runCommand, executablePath, this.context.extensionPath, 'Program Flow')
        );
      }

      const [report, mermaidText] = await Promise.all([
        fetchProgramFlowShared(runCommand, executablePath, cblPath),
        fetchProgramFlowMermaid(runCommand, executablePath, cblPath),
      ]);
      nextModel = { mermaidText, report };
    } catch (err) {
      if (err instanceof ProgramFlowFetchError || err instanceof ProgramFlowMermaidFetchError) {
        nextError = { message: describeRefreshError(err.message, err.stderr), stderr: err.stderr };
      } else {
        nextError = { message: err instanceof Error ? err.message : String(err) };
      }
    }

    const committed = this.guard.commit(token, nextModel ? cblPath : undefined, nextModel);
    if (!committed) return;

    this.lastError = nextError;
    if (nextError?.stderr) {
      this.outputChannel.appendLine(nextError.stderr);
    }
    if (nextError) {
      this.post({ type: 'error', message: nextError.message, hasDetail: !!nextError.stderr });
    } else if (nextModel) {
      this.post({
        type: 'diagram',
        mermaidText: nextModel.mermaidText,
        report: nextModel.report,
        summary: summarizeProgramFlow(nextModel.report),
        programName: nextModel.report.program_name,
      });
    }
  }
}
