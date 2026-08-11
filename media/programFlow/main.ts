// media/programFlow/main.ts
import mermaid from 'mermaid';
import { buildLineIndex } from '../../src/programFlow/programFlowNodeIndex';
import { formatSummaryLine, ProgramFlowSummary } from '../../src/programFlow/programFlowSummary';
import type { ProgramFlowReport } from '../../src/paragraphTree/programFlowModel';

declare function acquireVsCodeApi(): {
  postMessage(message: unknown): void;
};
const vscode = acquireVsCodeApi();

type ExtensionToWebviewMessage =
  | { type: 'diagram'; mermaidText: string; report: ProgramFlowReport; summary: ProgramFlowSummary; programName: string }
  | { type: 'empty' }
  | { type: 'error'; message: string; hasDetail: boolean };

const root = document.getElementById('root')!;

function themeName(): 'dark' | 'default' {
  return document.body.classList.contains('vscode-dark') || document.body.classList.contains('vscode-high-contrast')
    ? 'dark'
    : 'default';
}

mermaid.initialize({ startOnLoad: false, securityLevel: 'loose', theme: themeName() });

function renderEmpty(): void {
  root.innerHTML = `
    <div class="empty-state">
      <p>Open a .cbl file to draw its program flow.</p>
      <button id="open-file">Open a .cbl file</button>
    </div>`;
  document.getElementById('open-file')!.addEventListener('click', () => {
    vscode.postMessage({ type: 'openFile' });
  });
}

function renderError(message: string, hasDetail: boolean): void {
  root.innerHTML = `
    <div class="error-state">
      <p>${escapeHtml(message)}</p>
      ${hasDetail ? '<button id="show-output">Show output</button>' : ''}
    </div>`;
  if (hasDetail) {
    document.getElementById('show-output')!.addEventListener('click', () => {
      vscode.postMessage({ type: 'showOutput' });
    });
  }
}

function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

const LEGEND_HTML = `
  <div class="legend">
    <span class="legend-item"><span class="swatch swatch-perform"></span>PERFORM</span>
    <span class="legend-item"><span class="swatch swatch-recursion"></span>loop back-edge / recursion</span>
    <span class="legend-item"><span class="swatch swatch-goto"></span>GO TO / DEPENDING ON</span>
    <span class="legend-item"><span class="badge">THRU n</span>collapsed range</span>
    <span class="legend-item"><span class="diamond"></span>loop test</span>
  </div>`;

let panZoomState = { scale: 1, x: 0, y: 0 };

function attachPanZoom(container: HTMLElement, svgWrapper: HTMLElement): void {
  panZoomState = { scale: 1, x: 0, y: 0 };
  const apply = () => {
    svgWrapper.style.transform = `translate(${panZoomState.x}px, ${panZoomState.y}px) scale(${panZoomState.scale})`;
  };
  container.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    panZoomState.scale = Math.min(4, Math.max(0.2, panZoomState.scale * delta));
    apply();
  }, { passive: false });
  let dragging = false;
  let last = { x: 0, y: 0 };
  container.addEventListener('mousedown', (e) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', () => { dragging = false; });
  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    panZoomState.x += e.clientX - last.x;
    panZoomState.y += e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    apply();
  });
}

async function renderDiagram(msg: { mermaidText: string; report: ProgramFlowReport; summary: ProgramFlowSummary; programName: string }): Promise<void> {
  root.innerHTML = `
    <div class="header">PROGRAM FLOW — ${escapeHtml(msg.programName)}</div>
    <div class="subtitle">${escapeHtml(formatSummaryLine(msg.summary))}</div>
    <div class="diagram-container" id="diagram-container">
      <div class="diagram-pan" id="diagram-pan"></div>
    </div>
    ${LEGEND_HTML}`;

  const container = document.getElementById('diagram-container')!;
  const panEl = document.getElementById('diagram-pan')!;

  try {
    const { svg } = await mermaid.render('program-flow-svg', msg.mermaidText);
    panEl.innerHTML = svg;
  } catch (err) {
    renderError(`Mermaid could not render this diagram: ${err instanceof Error ? err.message : String(err)}`, false);
    return;
  }

  attachPanZoom(container, panEl);

  const lineIndex = buildLineIndex(msg.report);

  panEl.addEventListener('click', (e) => {
    const target = (e.target as Element).closest('[id^="flowchart-"]');
    if (!target || !target.id) return;
    // Mermaid's flowchart node ids are "flowchart-<nodeId>-<n>" -- strip
    // both the fixed prefix and the trailing "-<n>" mermaid appends.
    const withoutPrefix = target.id.replace(/^flowchart-/, '');
    const nodeId = withoutPrefix.replace(/-\d+$/, '');
    const line = lineIndex[nodeId];
    if (line !== undefined) {
      vscode.postMessage({ type: 'reveal', line });
    }
  });
}

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const msg = event.data;
  if (msg.type === 'empty') {
    renderEmpty();
  } else if (msg.type === 'error') {
    renderError(msg.message, msg.hasDetail);
  } else if (msg.type === 'diagram') {
    void renderDiagram(msg);
  }
});

vscode.postMessage({ type: 'ready' });
