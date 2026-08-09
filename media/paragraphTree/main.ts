// Webview client entry point -- runs in the webview's isolated browser
// context (no Node/vscode APIs, no access to this extension's other
// modules). Task 6 replaces the render body with the real tree/search/
// depth-filter/hover UI; this stub only proves the acquireVsCodeApi()
// handshake and postMessage round-trip work end-to-end.
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };

const vscodeApi = acquireVsCodeApi();

function render(text: string): void {
  const root = document.getElementById('root');
  if (root) root.textContent = text;
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'tree') {
    render(`Paragraph Tree: ${message.data.programName}`);
  } else if (message.type === 'empty') {
    render('Open a .cbl file to draw its paragraph tree.');
  } else if (message.type === 'error') {
    render(`Error: ${message.message}`);
  }
});

vscodeApi.postMessage({ type: 'ready' });
