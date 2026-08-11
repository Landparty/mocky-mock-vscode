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

  it('nonce is 32 hex characters', () => {
    assert.match(getNonce(), /^[a-f0-9]{32}$/);
  });
});
