// Pure completion-context detection for the .cut DSL -- no `vscode` import,
// so this is unit-testable outside the Extension Host (mocha cannot
// resolve `vscode` at all -- see lintOutput.ts's own doc comment for why
// every testable piece of this extension is split this way).
//
// See docs/2026-09-15-cut-editor-intelligence-design.md (sibling
// mocky-mock repo) for the design this implements.

// Every MockCategory the sibling mocky-mock repo's dsl/model.py defines,
// in the same declaration order. Static -- no CLI round-trip needed for
// this half of completion. (DYNCALL is deliberately absent: a .cut author
// never writes it directly -- `MOCK CALL <bare-word>` parses to it.)
export const MOCK_CATEGORIES = [
  'CALL',
  'OPEN',
  'CLOSE',
  'READ',
  'WRITE',
  'REWRITE',
  'DELETE',
  'START',
  'UNLOCK',
  'SORT',
  'MERGE',
  'RELEASE',
  'RETURN',
  'SQL',
  'CICS',
  'DLI',
  'ACCEPT',
  'INITIATE',
  'GENERATE',
  'TERMINATE',
  'PARAGRAPH',
  'SECTION',
  'MQ',
] as const;

export type CompletionContext =
  | { kind: 'category' }
  | { kind: 'key'; category: string };

const AFTER_MOCK_RE = /^\s*MOCK\s*$/i;
const AFTER_MOCK_CATEGORY_RE = /^\s*MOCK\s+([A-Za-z]+)\s+\S*$/i;

// `lineTextBeforeCursor` is everything on the current line up to (not
// including) the cursor -- exactly what VS Code's CompletionItemProvider
// hands a provider via `document.lineAt(position).text.slice(0, position.character)`.
export function detectCompletionContext(lineTextBeforeCursor: string): CompletionContext | null {
  if (AFTER_MOCK_RE.test(lineTextBeforeCursor)) {
    return { kind: 'category' };
  }
  const match = AFTER_MOCK_CATEGORY_RE.exec(lineTextBeforeCursor);
  if (match) {
    return { kind: 'key', category: match[1].toUpperCase() };
  }
  return null;
}

export interface BoundaryInfo {
  category: string;
  key: string | null;
  keys: string[];
  label: string;
  paragraph: string;
  line: number;
  matchText: string | null;
}

// Filters `collect --boundaries`' own JSON array to the keys relevant for
// `category` (case-insensitive on the category, since a .cut author may
// have typed it in either case before the key is even complete). `MQ` is
// not a real mock_surface category (an MQ call is CALL with `is_mq=true`
// under the hood, per mocky-mock's dsl/model.py) -- boundaries reports it
// as CALL, so `MQ` and `CALL` share the same key pool here.
export function filterBoundaryKeysForCategory(
  boundaries: BoundaryInfo[],
  category: string
): BoundaryInfo[] {
  const normalized = category.toUpperCase();
  const target = normalized === 'MQ' ? 'CALL' : normalized;
  const seenKeys = new Set<string>();
  const result: BoundaryInfo[] = [];
  for (const boundary of boundaries) {
    if (boundary.category !== target || boundary.key === null) continue;
    if (seenKeys.has(boundary.key)) continue;
    seenKeys.add(boundary.key);
    result.push(boundary);
  }
  return result;
}
