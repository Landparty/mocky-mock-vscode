// src/paragraphTree/paragraphTreeViewProvider.ts
import * as vscode from 'vscode';
import { runCommand } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { describeRefreshError, supportsAnalyzeCommand } from '../environment/checks';
import { RefreshGuard } from '../boundaries/refreshGuard';
import { fetchProgramFlow, ProgramFlowFetchError } from './programFlowClient';
import { buildParagraphTree, ParagraphTreeError, ParagraphTreeResult } from './programFlowModel';
import { extractSourceSnippet } from './sourceAnnotations';
import { buildWebviewHtml, getNonce } from './webviewHtml';

type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'reveal'; line: number }
  | { type: 'hover'; line: number; requestId: number }
  | { type: 'openFile' };

type ExtensionToWebviewMessage =
  | { type: 'tree'; data: ParagraphTreeResult }
  | { type: 'empty' }
  | { type: 'error'; message: string }
  | { type: 'snippet'; requestId: number; fileName: string; lines: { line: number; text: string }[] };

// WebviewViewProvider backing the Paragraph Tree sidebar view. Owns fetch
// orchestration (RefreshGuard-guarded, same stale-result-drop discipline as
// BoundariesTreeProvider), the message protocol, and reveal-in-editor /
// hover-snippet handling. No COBOL knowledge of its own -- that lives in
// programFlowClient.ts + programFlowModel.ts.
export class ParagraphTreeViewProvider implements vscode.WebviewViewProvider {
  private readonly guard = new RefreshGuard<ParagraphTreeResult>();
  private webviewView: vscode.WebviewView | undefined;
  private lastErrorMessage: string | undefined;

  // Set by extension.ts before this view is ever resolved. Unlike
  // TreeView (whose `view.onDidChangeVisibility` is available immediately
  // from createTreeView), a WebviewView only exists once VS Code decides
  // to render it -- resolveWebviewView() below is the first point a
  // visibility listener can be attached, so extension.ts's debounced
  // refresh needs this callback to learn about that first reveal.
  onVisible?: () => void;

  constructor(private readonly context: vscode.ExtensionContext) {}

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
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'out', 'media', 'paragraphTree')],
    };

    const nonce = getNonce();
    const scriptUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'media', 'paragraphTree', 'main.js')
    );
    const styleUri = webviewView.webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'out', 'media', 'paragraphTree', 'styles.css')
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
      } else if (message.type === 'hover') {
        void this.sendSnippet(message.line, message.requestId);
      } else if (message.type === 'openFile') {
        void this.openFile();
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
    if (this.lastErrorMessage) {
      this.post({ type: 'error', message: this.lastErrorMessage });
    } else if (this.guard.model) {
      this.post({ type: 'tree', data: this.guard.model });
    } else {
      this.post({ type: 'empty' });
    }
  }

  private post(message: ExtensionToWebviewMessage): void {
    void this.webviewView?.webview.postMessage(message);
  }

  // Backs the empty state's "Open a .cbl file" button (spec: "an Open a
  // .cbl file button (vscode.window.showOpenDialog)"). Opening the picked
  // file fires onDidChangeActiveTextEditor, which extension.ts's debounced
  // refresh already picks up -- no direct provider.refresh() call needed
  // here.
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
    const range = new vscode.Range(line - 1, 0, line - 1, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(range.start, range.start);
  }

  private async sendSnippet(line: number, requestId: number): Promise<void> {
    const cblPath = this.guard.cblPath;
    if (!cblPath) return;
    const doc = await vscode.workspace.openTextDocument(cblPath);
    const sourceLines = doc.getText().split(/\r?\n/);
    const lines = extractSourceSnippet(sourceLines, line, 4);
    this.post({ type: 'snippet', requestId, lines, fileName: cblPath.split(/[\\/]/).pop() ?? cblPath });
  }

  // cblPath === undefined renders the empty state (no active .cbl editor).
  async refresh(cblPath: string | undefined): Promise<void> {
    const token = this.guard.begin();

    if (!cblPath) {
      this.guard.commit(token, undefined, undefined);
      this.lastErrorMessage = undefined;
      this.post({ type: 'empty' });
      return;
    }

    let nextModel: ParagraphTreeResult | undefined;
    let nextError: string | undefined;
    try {
      const uri = vscode.Uri.file(cblPath);
      const { executablePath, copybookPaths } = resolveInvocationConfig(this.context, uri);

      const supportsAnalyze = await supportsAnalyzeCommand(runCommand, executablePath);
      if (!supportsAnalyze) {
        const probe = await runCommand(executablePath, ['--version']);
        throw new ProgramFlowFetchError(
          describeRefreshError(
            `mockymock at "${executablePath}" is too old to support the paragraph tree (needs the analyze subcommand). Upgrade mockymock and try again.`,
            probe.stderr
          )
        );
      }

      const report = await fetchProgramFlow(runCommand, executablePath, cblPath, copybookPaths);
      const doc = await vscode.workspace.openTextDocument(cblPath);
      const sourceLines = doc.getText().split(/\r?\n/);
      nextModel = buildParagraphTree(report, sourceLines);
    } catch (err) {
      if (err instanceof ProgramFlowFetchError) {
        nextError = describeRefreshError(err.message, err.stderr);
      } else if (err instanceof ParagraphTreeError) {
        nextError = err.message;
      } else {
        nextError = err instanceof Error ? err.message : String(err);
      }
    }

    const committed = this.guard.commit(token, nextModel ? cblPath : undefined, nextModel);
    if (!committed) return; // a newer refresh() landed first; drop this stale result

    this.lastErrorMessage = nextError;
    if (nextError) {
      this.post({ type: 'error', message: nextError });
    } else if (nextModel) {
      this.post({ type: 'tree', data: nextModel });
    }
  }
}
