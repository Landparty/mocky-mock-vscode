import * as assert from 'assert';
import { buildWebviewHtml, getNonce } from './webviewHtml';

describe('buildWebviewHtml (Program Flow)', () => {
  it('relaxes style-src to allow the inline <style> tags Mermaid injects', () => {
    const html = buildWebviewHtml({
      cspSource: 'vscode-webview://abc',
      scriptUri: 'https://x/main.js',
      styleUri: 'https://x/styles.css',
      nonce: 'N',
    });
    assert.match(html, /style-src [^;]*'unsafe-inline'/);
    assert.match(html, /<title>Program Flow<\/title>/);
  });

  it('nonce is 32 characters of [A-Za-z0-9]', () => {
    assert.match(getNonce(), /^[A-Za-z0-9]{32}$/);
  });
});
