// media/programFlow/main.ts
import mermaid from 'mermaid';
import { buildLineIndex, parseMermaidNodeId } from '../../src/programFlow/programFlowNodeIndex';
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

function renderEmpty(): void {
  activePanZoomCleanup?.();
  activePanZoomCleanup = undefined;
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
  activePanZoomCleanup?.();
  activePanZoomCleanup = undefined;
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
let activePanZoomCleanup: (() => void) | undefined;

// Recorded on every mousedown inside the pan/zoom container so the click
// handler below can tell a real click from the native `click` a
// drag-to-pan gesture also fires on mouseup. `undefined` means "we never
// saw a mousedown before this click" -- treat that as a real click (fail
// open) rather than silently eating it, since a missed mousedown must
// never re-kill click-to-reveal.
let pointerDownAt: { x: number; y: number } | undefined;
const DRAG_CLICK_THRESHOLD_PX = 5;

function attachPanZoom(container: HTMLElement, svgWrapper: HTMLElement): void {
  activePanZoomCleanup?.();

  panZoomState = { scale: 1, x: 0, y: 0 };
  const apply = () => {
    svgWrapper.style.transform = `translate(${panZoomState.x}px, ${panZoomState.y}px) scale(${panZoomState.scale})`;
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    panZoomState.scale = Math.min(4, Math.max(0.2, panZoomState.scale * delta));
    apply();
  };
  let dragging = false;
  let last = { x: 0, y: 0 };
  const onMouseDown = (e: MouseEvent) => {
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    pointerDownAt = { x: e.clientX, y: e.clientY };
  };
  const onMouseUp = () => { dragging = false; };
  const onMouseMove = (e: MouseEvent) => {
    if (!dragging) return;
    panZoomState.x += e.clientX - last.x;
    panZoomState.y += e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    apply();
  };

  container.addEventListener('wheel', onWheel, { passive: false });
  container.addEventListener('mousedown', onMouseDown);
  window.addEventListener('mouseup', onMouseUp);
  window.addEventListener('mousemove', onMouseMove);

  activePanZoomCleanup = () => {
    container.removeEventListener('wheel', onWheel);
    container.removeEventListener('mousedown', onMouseDown);
    window.removeEventListener('mouseup', onMouseUp);
    window.removeEventListener('mousemove', onMouseMove);
  };
}

// Guards against two `diagram` messages arriving in quick succession (e.g.
// rapid refresh-command clicks) starting overlapping mermaid.render() calls
// against the same fixed element id, which could resolve out of order.
// Every render increments the token and captures its own value; only the
// render whose captured token still matches the (module-level) current
// token when its render() promise resolves is allowed to touch the DOM.
let renderToken = 0;

async function renderDiagram(msg: { mermaidText: string; report: ProgramFlowReport; summary: ProgramFlowSummary; programName: string }): Promise<void> {
  const token = ++renderToken;

  root.innerHTML = `
    <div class="header">PROGRAM FLOW — ${escapeHtml(msg.programName)}</div>
    <div class="subtitle">${escapeHtml(formatSummaryLine(msg.summary))}</div>
    <div class="diagram-container" id="diagram-container">
      <div class="diagram-pan" id="diagram-pan"></div>
    </div>
    ${LEGEND_HTML}`;

  const container = document.getElementById('diagram-container')!;
  const panEl = document.getElementById('diagram-pan')!;

  // Recomputed on every render (not once at module load) so a live VS Code
  // light/dark theme toggle re-themes the next diagram -- the webview panel
  // uses retainContextWhenHidden: true, so this module is essentially never
  // reloaded within a session.
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: themeName() });

  let svg: string;
  try {
    ({ svg } = await mermaid.render('program-flow-svg', msg.mermaidText));
  } catch (err) {
    if (token !== renderToken) return; // superseded by a newer render; discard silently
    renderError(`Mermaid could not render this diagram: ${err instanceof Error ? err.message : String(err)}`, false);
    return;
  }

  if (token !== renderToken) return; // superseded by a newer render; discard silently

  panEl.innerHTML = svg;
  attachPanZoom(container, panEl);

  const lineIndex = buildLineIndex(msg.report);

  panEl.addEventListener('click', (e) => {
    if (pointerDownAt) {
      const dx = Math.abs(e.clientX - pointerDownAt.x);
      const dy = Math.abs(e.clientY - pointerDownAt.y);
      if (dx > DRAG_CLICK_THRESHOLD_PX || dy > DRAG_CLICK_THRESHOLD_PX) {
        return; // this click terminated a drag-to-pan gesture, not a real click
      }
    }
    const target = (e.target as Element).closest('.node[id]');
    if (!target || !target.id) return;
    const nodeId = parseMermaidNodeId(target.id);
    if (nodeId === undefined) return;
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
