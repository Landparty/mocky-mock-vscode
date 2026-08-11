// Pure HTML-string builder, no `vscode` import -- same split as
// paragraphTree/webviewHtml.ts.
import { randomBytes } from 'crypto';

export function getNonce(): string {
  // 16 bytes => 32 hex chars.
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
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${styleUri}">
<title>Program Flow</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}
