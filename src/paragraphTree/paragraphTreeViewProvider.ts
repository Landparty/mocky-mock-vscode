// src/paragraphTree/paragraphTreeViewProvider.ts
import * as vscode from 'vscode';
import { runCommand } from '../environment/commandRunner';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { describeRefreshError, describeUnsupportedFeature, supportsAnalyzeCommand } from '../environment/checks';
import { RefreshGuard } from '../boundaries/refreshGuard';
import { ProgramFlowFetchError } from './programFlowClient';
import { fetchProgramFlowShared } from './sharedProgramFlowFetch';
import { buildParagraphTree, ParagraphTreeError, ParagraphTreeResult } from './programFlowModel';
import { extractSourceSnippet } from './sourceAnnotations';
import { buildWebviewHtml, getNonce } from './webviewHtml';

type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'reveal'; line: number }
  | { type: 'hover'; line: number; requestId: number }
  | { type: 'openFile' }
  | { type: 'showOutput' };

type ExtensionToWebviewMessage =
  | { type: 'tree'; data: ParagraphTreeResult }
  | { type: 'empty' }
  | { type: 'error'; message: string; hasDetail: boolean }
  | { type: 'snippet'; requestId: number; fileName: string; lines: { line: number; text: string }[] };

// Internal error shape carried by the guard's speculative/committed error
// state -- `stderr` (when present) is the full CLI stderr for the "Show
// output" output-channel affordance; the webview only ever learns whether it
// exists (`hasDetail`), never the raw text itself (see postCurrentState /
// refresh below).
interface ErrorState {
  message: string;
  stderr?: string;
}

// WebviewViewProvider backing the Paragraph Tree sidebar view. Owns fetch
// orchestration (RefreshGuard-guarded, same stale-result-drop discipline as
// BoundariesTreeProvider), the message protocol, and reveal-in-editor /
// hover-snippet handling. No COBOL knowledge of its own -- that lives in
// programFlowClient.ts + programFlowModel.ts.
export class ParagraphTreeViewProvider implements vscode.WebviewViewProvider {
  private readonly guard = new RefreshGuard<ParagraphTreeResult>();
  private readonly outputChannel: vscode.OutputChannel;
  private webviewView: vscode.WebviewView | undefined;
  private lastError: ErrorState | undefined;
  // Cache of the active .cbl file's source, split into lines, set by
  // refresh() at the same time it builds the tree (see programFlowModel's
  // buildParagraphTree call below) so sendSnippet() doesn't have to re-read
  // and re-split the whole document on every single hover.
  private sourceLines: string[] | undefined;

  // Set by extension.ts before this view is ever resolved. Unlike
  // TreeView (whose `view.onDidChangeVisibility` is available immediately
  // from createTreeView), a WebviewView only exists once VS Code decides
  // to render it -- resolveWebviewView() below is the first point a
  // visibility listener can be attached, so extension.ts's debounced
  // refresh needs this callback to learn about that first reveal.
  onVisible?: () => void;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('mockymock paragraph tree');
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
        this.sendSnippet(message.line, message.requestId);
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
    // Clamp: vscode.Range throws IllegalArgument on a negative line, and this
    // `line` crossed the webview message boundary un-revalidated -- a 0 here
    // would otherwise be an unhandled rejection that eats the click silently.
    const zeroBased = Math.min(Math.max(0, line - 1), doc.lineCount - 1);
    const range = new vscode.Range(zeroBased, 0, zeroBased, 0);
    editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    editor.selection = new vscode.Selection(range.start, range.start);
  }

  private sendSnippet(line: number, requestId: number): void {
    const cblPath = this.guard.cblPath;
    // this.sourceLines is only ever set alongside a committed model (see
    // refresh() below), so this doubles as the "is there a live tree" guard
    // that `!cblPath` used to be on its own -- no re-read/re-split of the
    // document needed on every hover.
    if (!cblPath || !this.sourceLines) return;
    const lines = extractSourceSnippet(this.sourceLines, line, 4);
    this.post({ type: 'snippet', requestId, lines, fileName: cblPath.split(/[\\/]/).pop() ?? cblPath });
  }

  // cblPath === undefined renders the empty state (no active .cbl editor).
  async refresh(cblPath: string | undefined): Promise<void> {
    const token = this.guard.begin();

    if (!cblPath) {
      this.guard.commit(token, undefined, undefined);
      this.lastError = undefined;
      this.sourceLines = undefined;
      this.post({ type: 'empty' });
      return;
    }

    let nextModel: ParagraphTreeResult | undefined;
    let nextError: ErrorState | undefined;
    let nextSourceLines: string[] | undefined;
    try {
      const uri = vscode.Uri.file(cblPath);
      const { executablePath } = resolveInvocationConfig(this.context, uri);

      const supportsAnalyze = await supportsAnalyzeCommand(runCommand, executablePath);
      if (!supportsAnalyze) {
        throw new ProgramFlowFetchError(
          await describeUnsupportedFeature(runCommand, executablePath, this.context.extensionPath, 'the paragraph tree')
        );
      }

      const report = await fetchProgramFlowShared(runCommand, executablePath, cblPath);
      const doc = await vscode.workspace.openTextDocument(cblPath);
      nextSourceLines = doc.getText().split(/\r?\n/);
      nextModel = buildParagraphTree(report, nextSourceLines);
    } catch (err) {
      if (err instanceof ProgramFlowFetchError) {
        nextError = { message: describeRefreshError(err.message, err.stderr), stderr: err.stderr };
      } else if (err instanceof ParagraphTreeError) {
        nextError = { message: err.message };
      } else {
        nextError = { message: err instanceof Error ? err.message : String(err) };
      }
    }

    const committed = this.guard.commit(token, nextModel ? cblPath : undefined, nextModel);
    if (!committed) return; // a newer refresh() landed first; drop this stale result

    this.lastError = nextError;
    this.sourceLines = nextModel ? nextSourceLines : undefined;
    if (nextError?.stderr) {
      // Written proactively (not waiting for the user to click "Show
      // output") so the detail is already there if they go looking, same
      // discipline as BoundariesTreeProvider.refresh().
      this.outputChannel.appendLine(nextError.stderr);
    }
    if (nextError) {
      this.post({ type: 'error', message: nextError.message, hasDetail: !!nextError.stderr });
    } else if (nextModel) {
      this.post({ type: 'tree', data: nextModel });
    }
  }
}
