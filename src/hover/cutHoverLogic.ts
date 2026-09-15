// Pure word-shape matching for the .cut DSL's generated identifiers and
// stub-comment protocol -- no `vscode` import (see cutCompletionLogic.ts's
// doc comment for why). See
// docs/2026-09-15-cut-editor-intelligence-design.md (sibling mocky-mock
// repo) for the design this implements.

export type HoverMatch =
  | { kind: 'tally' }
  | { kind: 'capture' }
  | { kind: 'stubExpect' }
  | { kind: 'refusalCode'; code: string };

// mockymock/splicer/naming.py names every tally field `UT-<...>-TALLY`
// (the exact middle segment varies by category/key and isn't worth
// reverse-parsing here -- the hover text is the same regardless).
// `UT-TALLY-EDITED` is the driver's own internal scratch field for
// rendering a tally into a VERIFY failure message, not a per-boundary
// tally itself, so it's excluded explicitly.
const TALLY_RE = /^UT-(?!TALLY-EDITED$).+-TALLY$/;
const CAPTURE_RE = /^UT-CAP-.+$/;
// A refusal code referenced in a `*>` comment, e.g. `*> UNSUPPORTED_SORT_MERGE: ...`.
const REFUSAL_CODE_RE = /^[A-Z]+(?:_[A-Z]+)+$/;

// `lineText` is the full text of the line the word was found on --
// needed only to gate refusal-code matching to inside a `*>` comment
// (a real COBOL/.cut identifier never contains an underscore, so this
// heuristic is already quite safe, but restricting it to comments avoids
// a hover firing on, say, an all-caps literal a .cut author happened to
// write for some other reason).
export function matchIdentifier(word: string, lineText: string): HoverMatch | null {
  if (CAPTURE_RE.test(word)) return { kind: 'capture' };
  if (TALLY_RE.test(word)) return { kind: 'tally' };
  if (REFUSAL_CODE_RE.test(word) && lineText.trim().startsWith('*>')) {
    return { kind: 'refusalCode', code: word };
  }
  return null;
}

const STUB_EXPECT_RE = /^\*>\s*STUB EXPECT\b/;

export function isStubExpectComment(lineText: string): boolean {
  return STUB_EXPECT_RE.test(lineText.trim());
}
