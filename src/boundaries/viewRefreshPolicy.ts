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
