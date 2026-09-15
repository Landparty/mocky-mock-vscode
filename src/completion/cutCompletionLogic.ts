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

// Categories whose key the DSL requires in double quotes (mocky-mock's
// dsl/parser.py `_QUOTED_CATS`). CALL is in both sets there: the quoted
// form is a static CALL, the bare form is a dynamic CALL (DYNCALL).
export const QUOTED_CATEGORIES: ReadonlySet<string> = new Set(['CALL', 'MQ', 'SQL', 'CICS', 'DLI']);

export type CompletionContext =
  | { kind: 'category' }
  // `partial` is the token already typed after the category (possibly
  // empty, possibly starting with a `"`): the span a completion item must
  // replace, since VS Code's default word boundary stops at `-` and `"`.
  | { kind: 'key'; category: string; partial: string };

// The category position needs the whitespace after MOCK: at `MOCK|` the
// editor's current word is MOCK itself, so an accepted category would
// replace it and the list is filtered against a word no category matches.
const AFTER_MOCK_RE = /^\s*MOCK\s+$/i;
const AFTER_MOCK_CATEGORY_RE = /^\s*MOCK\s+([A-Za-z]+)\s+(\S*)$/i;

// `lineTextBeforeCursor` is everything on the current line up to (not
// including) the cursor -- exactly what VS Code's CompletionItemProvider
// hands a provider via `document.lineAt(position).text.slice(0, position.character)`.
export function detectCompletionContext(lineTextBeforeCursor: string): CompletionContext | null {
  if (AFTER_MOCK_RE.test(lineTextBeforeCursor)) {
    return { kind: 'category' };
  }
  const match = AFTER_MOCK_CATEGORY_RE.exec(lineTextBeforeCursor);
  if (match) {
    return { kind: 'key', category: match[1].toUpperCase(), partial: match[2] };
  }
  return null;
}

export interface BoundaryInfo {
  category: string;
  key: string | null;
  keys: string[];
  // The exact `MOCK <category> <key>` header mocky-mock's own scaffold
  // would write for this site (quoted where the DSL requires it, a text
  // prefix for SQL/CICS/DLI), or null when the scaffold skips the site.
  // Optional: an older CLI does not emit it.
  directive?: string | null;
  label: string;
  paragraph: string;
  line: number;
  matchText: string | null;
}

export interface KeyCandidate {
  // What to put after `MOCK <category> ` -- already quoted when the DSL
  // wants quotes, so accepting the item yields a line the parser accepts.
  insertText: string;
  boundary: BoundaryInfo;
}

function quoted(key: string): string {
  return `"${key}"`;
}

// Everything the user may write after `MOCK <category> ` for this
// program, from `collect --boundaries`' JSON. Case-insensitive on the
// category (a .cut author may have typed it in either case before the
// key is even complete).
//
// - `MQ` is not a real mock_surface category (an MQ call is CALL with
//   `is_mq=true` under the hood), so `MQ` and `CALL` share the CALL pool.
// - `MOCK CALL <bare-word>` is a *dynamic* CALL, so CALL also offers every
//   DYNCALL site's identifier, unquoted.
// - A multi-key site (`OPEN INV-FILE RPT-FILE`) is one site with several
//   valid keys; every one of them is offered.
// - SQL/CICS/DLI sites have no key of their own -- the DSL keys them on a
//   quoted prefix of the statement text, which only the CLI's `directive`
//   knows how to spell (the same shortest-unique prefix `generate` uses).
export function boundaryKeyCandidates(boundaries: BoundaryInfo[], category: string): KeyCandidate[] {
  const normalized = category.toUpperCase();
  const target = normalized === 'MQ' ? 'CALL' : normalized;
  const quote = QUOTED_CATEGORIES.has(normalized);
  const seen = new Set<string>();
  const result: KeyCandidate[] = [];
  const push = (insertText: string, boundary: BoundaryInfo): void => {
    if (!insertText || seen.has(insertText)) return;
    seen.add(insertText);
    result.push({ insertText, boundary });
  };
  for (const boundary of boundaries) {
    if (boundary.category === 'DYNCALL' && target === 'CALL') {
      for (const key of boundary.keys) push(key, boundary);
      continue;
    }
    if (boundary.category !== target) continue;
    const keys = boundary.keys.length > 0 ? boundary.keys : boundary.key ? [boundary.key] : [];
    if (keys.length === 0) {
      // SQL/CICS/DLI: only the CLI-rendered directive is usable.
      const fromDirective = keyFromDirective(boundary.directive);
      if (fromDirective) push(fromDirective, boundary);
      continue;
    }
    for (const key of keys) push(quote ? quoted(key) : key, boundary);
  }
  return result;
}

// `MOCK SQL "UPDATE INVENTORY"` -> `"UPDATE INVENTORY"`; null when the
// directive is absent or not of that shape.
export function keyFromDirective(directive: string | null | undefined): string | null {
  if (!directive) return null;
  const match = /^MOCK\s+[A-Za-z]+\s+(.+?)(?:\s+ROWS)?$/i.exec(directive.trim());
  return match ? match[1] : null;
}
