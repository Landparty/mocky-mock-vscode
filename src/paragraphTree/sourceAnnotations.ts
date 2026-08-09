//
// Pure source-text extraction, no `vscode` import (repo convention -- see
// checks.ts vs environmentManager.ts). program-flow's own `condition`
// field on a loop edge is currently a type-tag placeholder ("CONDITION"
// for UNTIL, "COMPARISON" for IF) -- verified directly against
// cobol-parser's cobolparser/analysis/program_flow/edges.py, which sets it
// to `cond_dict.get("expression_type", ...)`, never the real COBOL clause
// text. Both consumers that need real clause/snippet text (the tree's
// loop annotations in programFlowModel.ts, the hover preview in
// paragraphTreeViewProvider.ts) read it straight from the open document
// instead.

const MAX_STATEMENT_SPAN_LINES = 6;

export type PerformType = 'SIMPLE' | 'TIMES' | 'UNTIL' | 'VARYING';

// Joins source lines starting at `startLine` (1-indexed, matching
// program-flow's location.line) until a statement-terminating period or a
// line-count safety cap, whichever comes first.
function joinStatementLines(sourceLines: string[], startLine: number): string {
  const chunk: string[] = [];
  for (let i = startLine - 1; i < sourceLines.length && chunk.length < MAX_STATEMENT_SPAN_LINES; i++) {
    const line = sourceLines[i] ?? '';
    chunk.push(line);
    if (/\.\s*$/.test(line.trimEnd())) break;
  }
  return chunk.join(' ').replace(/\s+/g, ' ').trim();
}

// Extracts the UNTIL/VARYING/TIMES clause verbatim from source, for a
// PERFORM edge with is_loop true. Fails soft (returns undefined) for
// perform_type 'SIMPLE' or when the expected keyword isn't found --
// never throws, since this only affects a display annotation.
export function extractLoopAnnotation(
  sourceLines: string[],
  startLine: number,
  performType: PerformType
): string | undefined {
  if (performType === 'SIMPLE') return undefined;
  const joined = joinStatementLines(sourceLines, startLine);
  const keyword =
    performType === 'VARYING' ? /\bVARYING\b/i : performType === 'UNTIL' ? /\bUNTIL\b/i : /\b\d+\s+TIMES\b/i;
  const match = keyword.exec(joined);
  if (!match) return undefined;
  const clause = joined.slice(match.index).replace(/\.$/, '').trim();
  return clause.length > 0 ? clause : undefined;
}

export interface SourceSnippetLine {
  line: number;
  text: string;
}

// Returns up to `maxLines` source lines starting at `startLine`
// (1-indexed), for the hover preview's "PROGRAM.CBL · LINE N" popup.
// Clamped to the document's actual length -- never throws.
export function extractSourceSnippet(
  sourceLines: string[],
  startLine: number,
  maxLines: number
): SourceSnippetLine[] {
  const result: SourceSnippetLine[] = [];
  for (let i = startLine - 1; i < sourceLines.length && result.length < maxLines; i++) {
    result.push({ line: i + 1, text: sourceLines[i] });
  }
  return result;
}
