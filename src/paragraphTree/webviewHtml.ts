// Pure HTML-string builder for the Paragraph Tree webview's host page. No
// `vscode` import -- the caller (paragraphTreeViewProvider.ts) resolves
// webview.cspSource / webview.asWebviewUri(...) and passes the results in
// as plain strings, so this stays mocha-testable.
export function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let text = '';
  for (let i = 0; i < 32; i++) {
    text += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return text;
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
