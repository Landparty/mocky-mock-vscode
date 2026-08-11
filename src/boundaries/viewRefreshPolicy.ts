// src/boundaries/viewRefreshPolicy.ts
//
// Pure decision logic for whether an active-editor change should clear the
// Boundaries view to its welcome state, split out of extension.ts (which
// imports `vscode` and so cannot be exercised directly by mocha -- repo
// convention: pure logic lives outside vscode-importing files, see
// checks.ts vs environmentManager.ts, or refreshGuard.ts vs
// boundariesTreeProvider.ts). No `vscode` import here.
//
// Controller decision (final review, Task 2): the tree keeps showing the
// last .cbl's boundaries until a DIFFERENT .cbl becomes active. A non-.cbl
// editor becoming active -- including the extension's OWN showTextDocument()
// call on a freshly generated .cut -- must not blank an already-populated
// tree. The welcome state is reserved for the two cases where there is
// genuinely nothing useful left to show: no model has EVER been committed
// this session, or the most recent refresh attempt errored (which itself
// commits an undefined model -- see BoundariesTreeProvider.refresh()'s
// error path, where a caught BundleError still lands (undefined, undefined)
// on modelGuard).
export function shouldClearOnEditorChange(hasModel: boolean, newEditorIsCobol: boolean): boolean {
  if (newEditorIsCobol) {
    // A .cbl/.cob becoming active is handled by fetching that path, not by
    // clearing -- this branch only decides the non-COBOL case.
    return false;
  }
  return !hasModel;
}

// True for a path whose extension marks it as a COBOL source file. Shared
// (not duplicated) between resolveActiveCblPath's "what should the views
// show" question in extension.ts and hasCobolTabOpen's "should the views
// exist at all" question below, so the two can never drift apart on what
// counts as COBOL.
export function isCobolPath(fsPath: string): boolean {
  const lower = fsPath.toLowerCase();
  return lower.endsWith('.cbl') || lower.endsWith('.cob') || lower.endsWith('.cobol');
}

// package.json's `contributes.views.explorer[].when` for both
// mockymock.boundaries and mockymock.paragraphTree reads this exact context
// key -- keep the string in one vscode-free place so package.json and
// extension.ts's setContext call can't drift apart (a typo in either would
// hide both views permanently with no error anywhere), and so the manifest
// test importing this constant is actually checking the link rather than
// just restating a copy of the literal.
export const COBOL_VIEWS_CONTEXT_KEY = 'mockymock.cobolOpen';

// Whether the mockymock side views should be visible at all: true as soon as
// any currently-OPEN tab is a .cbl/.cob/.cobol, false the moment the last one
// closes. Deliberately NOT a one-way latch like the tree/webview CONTENT
// above (shouldClearOnEditorChange pins on the last-committed model) --
// visibility tracks "still open", so opening FOO.cbl once early in a
// session and closing it again makes the views disappear, matching "don't
// appear if a cobol program isn't opened". Switching focus to a non-COBOL
// tab (e.g. the extension's own showTextDocument() on a freshly generated
// .cut) does NOT hide the views as long as the originating .cbl tab is still
// open elsewhere in the editor -- callers pass every open path, not just the
// active one.
export function hasCobolTabOpen(openPaths: readonly string[]): boolean {
  return openPaths.some(isCobolPath);
}
