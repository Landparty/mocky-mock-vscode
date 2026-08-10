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
// Reset at the top of renderTree() and incremented by renderNode() every
// time it actually builds and appends a 'paragraph' row -- the single
// source of truth for "how many paragraph rows are on screen right now",
// honoring both the depth cap and the ancestor-preserving match rule
// without re-deriving them in a second, easily-divergent helper.
let renderedParagraphCount = 0;
// Tracked across renders so a re-render triggered by typing in the search
// box (renderTree() rebuilds the whole #root, including a brand-new <input>
// each time) can restore focus and caret position on the new element --
// without this, every keystroke would blur the field and the next
// keystroke would be lost.
let searchBoxEl: HTMLInputElement | undefined;

// Per-depth-level indentation, in px. Applied directly as inline
// padding-left on each row's name-cell -- see renderNode. Deliberately NOT
// implemented via nested wrapper divs with margin-left (an earlier version
// of this file did that, and it silently drifted: each ancestor wrapper's
// own margin shrank its own available width, so a row's containing
// block -- and therefore where badges/line-number's margin-left:auto
// landed -- ended up at a different absolute position per row, worse for
// anything nested inside a THRU range or loop body, which don't even
// increment the tree's own `depth` counter the same way. CSS Grid doesn't
// have that failure mode: every cell appended to .tree shares the exact
// same column tracks by definition, regardless of what padding an
// individual cell carries.
const INDENT_PX = 16;

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

// Mirrors renderNode's depth bookkeeping exactly (see its `depth > depthCap`
// guard and the thruRange-vs-paragraph child-depth split) so `matchCount`
// only counts matches that could actually survive to be rendered -- a match
// buried past the depth cap must not suppress the "nothing matches those
// filters" empty-state message.
function countLeafMatches(items: ParagraphTreeItem[], query: string, depth: number): number {
  let count = 0;
  for (const item of items) {
    if (depth > depthCap) continue;
    if (item.kind === 'paragraph' && item.name.toLowerCase().includes(query)) count++;
    const childDepth = item.kind === 'thruRange' ? depth : depth + 1;
    count += countLeafMatches(item.children, query, childDepth);
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

// Wires the same click/hover behavior onto every cell belonging to one
// logical row (name-cell, badges-cell, line-cell aren't wrapped in a
// shared parent element -- see the module comment on INDENT_PX for why --
// so each needs its own listeners, and mouseenter/mouseleave toggle a
// shared class across all of them so hovering any cell highlights the
// whole row).
function wireRowInteractivity(cells: HTMLElement[], line: number): void {
  for (const cell of cells) {
    cell.dataset.line = String(line);
    cell.addEventListener('click', () => vscodeApi.postMessage({ type: 'reveal', line }));
    cell.addEventListener('mouseenter', () => {
      for (const c of cells) c.classList.add('row-hover');
      showHoverPreview(line);
    });
    cell.addEventListener('mouseleave', () => {
      for (const c of cells) c.classList.remove('row-hover');
      hideHoverPreview();
    });
  }
}

// Appends this item's row (and recursively, its descendants') directly to
// `treeEl` as flat CSS Grid children -- three cells (name | badges |
// line-number) per paragraph row, or one grid-column-spanning cell for a
// THRU range's header. No nested wrapper divs: grid column alignment is
// guaranteed by the grid itself for any direct child, regardless of this
// item's depth or how many bracket contexts it's nested inside.
// `bracketed` records whether this row is visually part of a THRU range or
// a looping paragraph's body, purely for a small left-border marker on its
// name-cell -- it does not attempt to reproduce one continuous line
// spanning multiple sibling rows, to keep this alignment-critical code as
// simple as possible.
function renderNode(
  treeEl: HTMLElement,
  item: ParagraphTreeItem,
  depth: number,
  query: string,
  bracketed: 'thru' | 'loop' | undefined
): void {
  if (depth > depthCap) return;
  if (!matches(item, query)) return;

  if (item.kind === 'thruRange') {
    const header = el('div', 'thru-row');
    header.style.paddingLeft = `${depth * INDENT_PX}px`;
    header.appendChild(document.createTextNode(`THRU ${item.from} → ${item.to}`));
    if (item.loopAnnotation) {
      header.appendChild(el('span', 'loop-annotation', item.loopAnnotation));
    }
    treeEl.appendChild(header);
    const childBracket = item.loopAnnotation ? 'loop' : 'thru';
    for (const child of item.children) {
      renderNode(treeEl, child, depth, query, childBracket);
    }
    return;
  }

  renderedParagraphCount += 1;

  const nameCell = el('span', 'name-cell' + (bracketed ? ` bracket-${bracketed}` : ''));
  nameCell.style.paddingLeft = `${depth * INDENT_PX}px`;
  const nameText = el('span', 'name');
  nameText.appendChild(highlightedName(item.name, query));
  nameCell.appendChild(nameText);
  if (item.loopAnnotation) {
    nameCell.appendChild(el('span', 'loop-annotation', item.loopAnnotation));
  }
  if (item.isRecursive) {
    nameCell.appendChild(el('span', 'recursive-marker', 'recursive'));
  }

  const badgesCell = el('span', 'badges-cell');
  badgesCell.appendChild(renderBadgeDot(item.badges.file, 'f'));
  badgesCell.appendChild(renderBadgeDot(item.badges.sql, 's'));
  badgesCell.appendChild(renderBadgeDot(item.badges.call, 'c'));

  const lineCell = el('span', 'line-cell', item.callCount > 1 ? `×${item.callCount}` : String(item.line));

  const cells = [nameCell, badgesCell, lineCell];
  if (item.isRecursive) {
    for (const cell of cells) cell.classList.add('recursive');
  }
  wireRowInteractivity(cells, item.line);
  for (const cell of cells) treeEl.appendChild(cell);

  const childBracket = item.loopAnnotation ? 'loop' : bracketed;
  for (const child of item.children) {
    renderNode(treeEl, child, depth + 1, query, childBracket);
  }
}

let hoverPopup: HTMLElement | undefined;

function showHoverPreview(line: number): void {
  hoverRequestId += 1;
  vscodeApi.postMessage({ type: 'hover', line, requestId: hoverRequestId });
}

function hideHoverPreview(): void {
  hoverPopup?.remove();
  hoverPopup = undefined;
  // Invalidate any in-flight hover request too -- otherwise a snippet reply
  // for a row the cursor already left (or that a search/refresh just
  // removed from the DOM) can still arrive and render a stale popup, even
  // though there was no popup element here for `.remove()` to catch.
  hoverRequestId += 1;
}

function renderTree(): void {
  // Capture the outgoing search box's focus/caret state before it (and the
  // rest of #root) gets torn down -- see the searchBoxEl comment above.
  // document.hasFocus() guards against a webview iframe quirk: activeElement
  // keeps pointing at the search box even after focus has genuinely moved
  // outside the webview (e.g. to the COBOL editor). Without this check, a
  // refresh-triggered renderTree() while the user is typing in the editor
  // would call .focus() on the (still-"active" per the DOM, but not really
  // focused) search box and steal their keystrokes.
  const searchHadFocus = document.hasFocus() && !!searchBoxEl && document.activeElement === searchBoxEl;
  const searchCaret = searchBoxEl?.selectionStart ?? null;

  hideHoverPreview(); // a popup from the row under the old content would otherwise be orphaned
  root.innerHTML = '';
  renderedParagraphCount = 0;
  if (!currentTree) {
    searchBoxEl = undefined;
    return;
  }

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
  searchBoxEl = searchBox;
  if (searchHadFocus) {
    searchBox.focus();
    const caret = searchCaret ?? searchBox.value.length;
    searchBox.setSelectionRange(caret, caret);
  }

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

  // Column-header row -- labels which dot is which without requiring a
  // scroll down to the footer legend. These are the FIRST three cells
  // appended to treeEl, so they share the exact same grid column tracks as
  // every real row appended after them -- alignment here is guaranteed by
  // the grid, not by matching padding/margin math by hand.
  const legendName = el('span', 'name-cell legend-row');
  const legendBadges = el('span', 'badges-cell legend-row');
  legendBadges.appendChild(el('span', 'legend-letter', 'F'));
  legendBadges.appendChild(el('span', 'legend-letter', 'S'));
  legendBadges.appendChild(el('span', 'legend-letter', 'C'));
  const legendLine = el('span', 'line-cell legend-row');
  treeEl.appendChild(legendName);
  treeEl.appendChild(legendBadges);
  treeEl.appendChild(legendLine);

  const query = searchQuery;
  for (const rootItem of currentTree.roots) {
    renderNode(treeEl, rootItem, 1, query, undefined);
  }
  for (const item of currentTree.unreachable) {
    if (item.kind !== 'paragraph') continue; // unreachable is always flat/childless paragraphs -- see programFlowModel.ts
    if (1 > depthCap) continue;
    if (!matches(item, query)) continue;
    renderedParagraphCount += 1;
    const nameCell = el('span', 'name-cell unreachable-row');
    const nameText = el('span', 'name');
    nameText.appendChild(highlightedName(item.name, query));
    nameCell.appendChild(nameText);
    const badgesCell = el('span', 'badges-cell unreachable-row');
    badgesCell.appendChild(renderBadgeDot(item.badges.file, 'f'));
    badgesCell.appendChild(renderBadgeDot(item.badges.sql, 's'));
    badgesCell.appendChild(renderBadgeDot(item.badges.call, 'c'));
    const lineCell = el(
      'span',
      'line-cell unreachable-row',
      item.callCount > 1 ? `×${item.callCount}` : String(item.line)
    );
    const cells = [nameCell, badgesCell, lineCell];
    wireRowInteractivity(cells, item.line);
    for (const cell of cells) treeEl.appendChild(cell);
  }
  root.appendChild(treeEl);

  if (query) {
    const totalParagraphs = countParagraphs([...currentTree.roots, ...currentTree.unreachable]);
    const matchCount = countLeafMatches([...currentTree.roots, ...currentTree.unreachable], query, 1);
    if (matchCount === 0) {
      root.appendChild(el('div', 'empty-filter', 'nothing matches those filters'));
    }
    // renderedParagraphCount (not matchCount) is the count of rows actually
    // on screen -- it already includes ancestors kept visible for a
    // descendant's match, which matchCount deliberately does not.
    root.appendChild(el('div', 'hidden-count', `${totalParagraphs - renderedParagraphCount} paragraphs hidden`));
  }

  root.appendChild(el('div', 'footer', 'F file · S sql · C call — click a row to jump'));
}

function renderEmptyState(): void {
  hideHoverPreview();
  searchBoxEl = undefined;
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

function renderErrorState(message: string, hasDetail: boolean): void {
  hideHoverPreview();
  searchBoxEl = undefined;
  root.innerHTML = '';
  root.appendChild(el('div', 'error-state', message));
  if (hasDetail) {
    // Only offered when the extension host actually captured stderr detail
    // for this error -- otherwise this would reveal an empty output channel.
    const button = el('button', 'open-file-button', 'Show output');
    button.addEventListener('click', () => vscodeApi.postMessage({ type: 'showOutput' }));
    root.appendChild(button);
  }
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
    renderErrorState(message.message as string, Boolean(message.hasDetail));
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
