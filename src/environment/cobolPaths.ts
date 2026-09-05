// src/environment/cobolPaths.ts
//
// What counts as a COBOL source file, by path alone. No `vscode` import, so
// it's directly unit-testable under mocha (repo convention: pure logic lives
// outside vscode-importing files).
//
// Previously lived in boundaries/viewRefreshPolicy.ts alongside the refresh
// and visibility rules for the Paragraph Tree and Program Flow views. Those
// views -- and the rest of the COBOL analysis surface -- now live in the
// cobol-analyzer extension, leaving this predicate as the only part the
// mockymock extension still needs: cutDiscovery pairs .cbl files with their
// .cut suites, and both "New Test Suite" and mainframe export validate that
// the active editor is a program before acting on it.
export function isCobolPath(fsPath: string): boolean {
  const lower = fsPath.toLowerCase();
  return lower.endsWith('.cbl') || lower.endsWith('.cob') || lower.endsWith('.cobol');
}
