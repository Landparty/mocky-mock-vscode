// Pure HTML-string builder for the Paragraph Tree webview's host page. No
// `vscode` import -- the caller (paragraphTreeViewProvider.ts) resolves
// webview.cspSource / webview.asWebviewUri(...) and passes the results in
// as plain strings, so this stays mocha-testable.
import { randomBytes } from 'crypto';

export function getNonce(): string {
  // crypto.randomBytes, not Math.random(): a CSP nonce's whole job is to be
  // unguessable, and V8's Math.random() state is recoverable from observed
  // outputs. Same implementation as programFlow/webviewHtml.ts (16 bytes =>
  // 32 hex chars).
  return randomBytes(16).toString('hex');
}

export interface WebviewHtmlOptions {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  nonce: string;
}

export function buildWebviewHtml(options: WebviewHtmlOptions): string {
  const { cspSource, scriptUri, styleUri, nonce } = options;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>Paragraph Tree</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
