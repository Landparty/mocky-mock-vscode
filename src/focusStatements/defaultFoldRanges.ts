// src/focusStatements/defaultFoldRanges.ts
//
// Structural (division/section/paragraph) fold ranges, derived from the
// same buildOutline() the Outline panel uses. This is what
// FocusStatementsFoldingProvider falls back to for a document that hasn't
// been focused: registering ANY vscode.FoldingRangeProvider for a language
// replaces VS Code's indentation-based folding for that language entirely
// (see focusFoldingProvider.ts), so an unfocused COBOL file must still get
// a reasonable set of folds from this provider, or it silently loses
// folding altogether the moment this extension is installed.

import { buildOutline, OutlineNode } from '../outline/outlineModel';
import { LineRange } from './statementRanges';

function collect(nodes: OutlineNode[], out: LineRange[]): void {
  for (const node of nodes) {
    if (node.endLine > node.startLine) {
      out.push({ startLine: node.startLine, endLine: node.endLine });
    }
    collect(node.children, out);
  }
}

export function defaultFoldRanges(sourceLines: string[]): LineRange[] {
  const out: LineRange[] = [];
  collect(buildOutline(sourceLines), out);
  return out;
}
