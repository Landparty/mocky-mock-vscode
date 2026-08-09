// media/paragraphTree/main.ts
//
// Webview client -- runs in the webview's isolated browser context.
// Local copies of the extension-side types it receives over postMessage
// (no cross-bundle TS import is possible between out/extension.js and
// this file's separate esbuild entry point -- see esbuild.js).
declare function acquireVsCodeApi(): { postMessage(message: unknown): void };
const vscodeApi = acquireVsCodeApi();

interface ParagraphBadges { file: boolean; sql: boolean; call: boolean; }
type ParagraphTreeItem =
  | { kind: 'paragraph'; name: string; line: number; callCount: number; isRecursive: boolean; loopAnnotation?: string; badges: ParagraphBadges; children: ParagraphTreeItem[] }
  | { kind: 'thruRange'; from: string; to: string; loopAnnotation?: string; children: ParagraphTreeItem[] };
interface ParagraphTreeResult { programName: string; roots: ParagraphTreeItem[]; unreachable: ParagraphTreeItem[]; }

let currentTree: ParagraphTreeResult | undefined;
let searchQuery = '';
let depthCap = 4;
let hoverRequestId = 0;

const root = document.getElementById('root')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// True if `item` itself matches the search query, or any descendant does
// (ancestors of a match stay visible so the match's context isn't lost).
function matches(item: ParagraphTreeItem, query: string): boolean {
  if (!query) return true;
  if (item.kind === 'paragraph' && item.name.toLowerCase().includes(query)) return true;
  return item.children.some((child) => matches(child, query));
}

function countLeafMatches(items: ParagraphTreeItem[], query: string): number {
  let count = 0;
  for (const item of items) {
    if (item.kind === 'paragraph' && item.name.toLowerCase().includes(query)) count++;
    count += countLeafMatches(item.children, query);
  }
  return count;
}

function countParagraphs(items: ParagraphTreeItem[]): number {
  let count = 0;
  for (const item of items) {
    if (item.kind === 'paragraph') count++;
    count += countParagraphs(item.children);
  }
  return count;
}

function highlightedName(name: string, query: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (!query) {
    frag.appendChild(document.createTextNode(name));
    return frag;
  }
  const lower = name.toLowerCase();
  const idx = lower.indexOf(query);
  if (idx === -1) {
    frag.appendChild(document.createTextNode(name));
    return frag;
  }
  frag.appendChild(document.createTextNode(name.slice(0, idx)));
  frag.appendChild(el('span', 'match', name.slice(idx, idx + query.length)));
  frag.appendChild(document.createTextNode(name.slice(idx + query.length)));
  return frag;
}

function renderBadgeDot(active: boolean, label: string): HTMLElement {
  return el('span', `dot dot-${label}${active ? ' dot-active' : ''}`);
}

function renderNode(item: ParagraphTreeItem, depth: number, query: string): HTMLElement | undefined {
  if (depth > depthCap) return undefined;
  if (!matches(item, query)) return undefined;

  if (item.kind === 'thruRange') {
    const wrapper = el('div', 'thru-range');
    wrapper.appendChild(el('div', 'thru-header', `THRU ${item.from} → ${item.to}`));
    const childrenEl = el('div', 'children');
    for (const child of item.children) {
      const rendered = renderNode(child, depth, query);
      if (rendered) childrenEl.appendChild(rendered);
    }
    wrapper.appendChild(childrenEl);
    return wrapper;
  }

  const row = el('div', 'row' + (item.isRecursive ? ' recursive' : ''));
  row.dataset.line = String(item.line);

  const nameEl = el('span', 'name');
  nameEl.appendChild(highlightedName(item.name, query));
  row.appendChild(nameEl);

  if (item.loopAnnotation) {
    row.appendChild(el('span', 'loop-annotation', item.loopAnnotation));
  }
  if (item.isRecursive) {
    row.appendChild(el('span', 'recursive-marker', 'recursive'));
  }

  const badges = el('span', 'badges');
  badges.appendChild(renderBadgeDot(item.badges.file, 'f'));
  badges.appendChild(renderBadgeDot(item.badges.sql, 's'));
  badges.appendChild(renderBadgeDot(item.badges.call, 'c'));
  row.appendChild(badges);

  row.appendChild(el('span', 'line-number', item.callCount > 1 ? `×${item.callCount}` : String(item.line)));

  row.addEventListener('click', () => vscodeApi.postMessage({ type: 'reveal', line: item.line }));
  row.addEventListener('mouseenter', () => showHoverPreview(item.line));
  row.addEventListener('mouseleave', hideHoverPreview);

  const wrapper = el('div', 'node');
  wrapper.appendChild(row);
  if (item.children.length > 0) {
    // Loop-spanning paragraphs (UNTIL/VARYING) get a gutter bracket beside
    // their nested rows, same visual device as thruRange's connector --
    // driven entirely by loopAnnotation being set, no new data needed.
    const childrenEl = el('div', item.loopAnnotation ? 'children loop-body' : 'children');
    for (const child of item.children) {
      const rendered = renderNode(child, depth + 1, query);
      if (rendered) childrenEl.appendChild(rendered);
    }
    wrapper.appendChild(childrenEl);
  }
  return wrapper;
}

let hoverPopup: HTMLElement | undefined;

function showHoverPreview(line: number): void {
  hoverRequestId += 1;
  vscodeApi.postMessage({ type: 'hover', line, requestId: hoverRequestId });
}

function hideHoverPreview(): void {
  hoverPopup?.remove();
  hoverPopup = undefined;
}

function renderTree(): void {
  root.innerHTML = '';
  if (!currentTree) return;

  const header = el('div', 'header', `PARAGRAPH TREE — ${currentTree.programName}`);
  root.appendChild(header);

  const searchBox = el('input', 'search') as HTMLInputElement;
  searchBox.placeholder = 'Filter paragraphs…';
  searchBox.value = searchQuery;
  searchBox.addEventListener('input', () => {
    searchQuery = searchBox.value.toLowerCase();
    renderTree();
  });
  root.appendChild(searchBox);

  const depthRow = el('div', 'depth-chips');
  for (let d = 1; d <= 4; d++) {
    const chip = el('span', 'chip' + (d === depthCap ? ' chip-active' : ''), String(d));
    chip.addEventListener('click', () => {
      depthCap = d;
      renderTree();
    });
    depthRow.appendChild(chip);
  }
  root.appendChild(depthRow);

  const treeEl = el('div', 'tree');
  const query = searchQuery;
  for (const rootItem of currentTree.roots) {
    const rendered = renderNode(rootItem, 1, query);
    if (rendered) treeEl.appendChild(rendered);
  }
  for (const item of currentTree.unreachable) {
    const rendered = renderNode(item, 1, query);
    if (rendered) {
      rendered.classList.add('unreachable');
      treeEl.appendChild(rendered);
    }
  }
  root.appendChild(treeEl);

  if (query) {
    const totalParagraphs = countParagraphs([...currentTree.roots, ...currentTree.unreachable]);
    const matchCount = countLeafMatches([...currentTree.roots, ...currentTree.unreachable], query);
    if (matchCount === 0) {
      root.appendChild(el('div', 'empty-filter', 'nothing matches those filters'));
    }
    root.appendChild(el('div', 'hidden-count', `${totalParagraphs - matchCount} paragraphs hidden`));
  }

  root.appendChild(el('div', 'footer', 'F file · S sql · C call — click a row to jump'));
}

function renderEmptyState(): void {
  root.innerHTML = '';
  root.appendChild(el('div', 'empty-state-title', 'Open a .cbl file to draw its paragraph tree.'));
  root.appendChild(
    el(
      'div',
      'empty-state-body',
      'The view reads whatever mockymock analyze program-flow prints — nothing is guessed.'
    )
  );
  const button = el('button', 'open-file-button', 'Open a .cbl file');
  button.addEventListener('click', () => vscodeApi.postMessage({ type: 'openFile' }));
  root.appendChild(button);
}

function renderErrorState(message: string): void {
  root.innerHTML = '';
  root.appendChild(el('div', 'error-state', message));
}

window.addEventListener('message', (event: MessageEvent) => {
  const message = event.data;
  if (message.type === 'tree') {
    currentTree = message.data as ParagraphTreeResult;
    renderTree();
  } else if (message.type === 'empty') {
    currentTree = undefined;
    renderEmptyState();
  } else if (message.type === 'error') {
    currentTree = undefined;
    renderErrorState(message.message as string);
  } else if (message.type === 'snippet') {
    renderHoverSnippet(message.requestId, message.fileName, message.lines);
  }
});

function renderHoverSnippet(requestId: number, fileName: string, lines: { line: number; text: string }[]): void {
  if (requestId !== hoverRequestId) return; // stale response for a hover the user already left
  hoverPopup?.remove();
  const popup = el('div', 'hover-popup');
  popup.appendChild(el('div', 'hover-title', `${fileName} · LINE ${lines[0]?.line ?? ''}`));
  const code = el('pre', 'hover-code');
  code.textContent = lines.map((l) => `${l.line}  ${l.text}`).join('\n');
  popup.appendChild(code);
  popup.appendChild(el('div', 'hover-hint', '→ click to reveal in editor'));
  document.body.appendChild(popup);
  hoverPopup = popup;
}

vscodeApi.postMessage({ type: 'ready' });
