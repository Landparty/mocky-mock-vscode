// src/boundaries/treeNodeIds.ts
//
// Pure TreeItem.id builders split out of boundariesTreeProvider.ts (which
// imports `vscode` and so cannot be exercised directly by mocha -- repo
// convention: pure logic lives outside vscode-importing files). Stable,
// unique ids let VS Code preserve expansion/scroll/selection identity
// across the full-tree onDidChangeTreeData.fire() that refresh() and
// setSeeded() both use.
export function groupNodeId(paragraph: string): string {
  return `group:${paragraph}`;
}

// `column` -- not `name` -- is the correct disambiguator for OCCURS-backed
// layouts. cobol-parser's BundleFieldSpec.column is unique per occurrence
// (e.g. "ITEM-CODE(1)", "ITEM-CODE(2)"), while every occurrence of the same
// repeated field shares the same `.name`. Using `.name` here previously
// collapsed every occurrence onto one TreeItem id.
export function fieldNodeId(boundaryId: string, column: string): string {
  return `${boundaryId}#field:${column}`;
}

export function unresolvedItemNodeId(index: number): string {
  return `unresolved:${index}`;
}
