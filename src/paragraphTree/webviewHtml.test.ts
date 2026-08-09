import assert from 'node:assert/strict';
import { buildWebviewHtml, getNonce } from './webviewHtml';

describe('getNonce', () => {
  it('returns a 32-character alphanumeric string', () => {
    const nonce = getNonce();
    assert.match(nonce, /^[A-Za-z0-9]{32}$/);
  });
});

describe('buildWebviewHtml', () => {
  it('embeds the same nonce in both the CSP header and the script tag', () => {
    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://abc',
      scriptUri: 'vscode-webview://abc/main.js',
      styleUri: 'vscode-webview://abc/styles.css',
      nonce: 'TESTNONCE123',
    });
    assert.match(html, /Content-Security-Policy[^>]*nonce-TESTNONCE123/);
    assert.match(html, /<script nonce="TESTNONCE123" src="vscode-webview:\/\/abc\/main\.js">/);
    assert.match(html, /<link rel="stylesheet" href="vscode-webview:\/\/abc\/styles\.css">/);
  });
});
