// src/focusStatements/statementRanges.ts
//
// Pure text scan -> line ranges of SQL/CICS/CALL statements, no `vscode`
// import (repo convention -- see outline/outlineModel.ts). Targets IBM
// Enterprise COBOL FIXED FORMAT ONLY, same column model as outlineModel.ts:
// a `*`/`/` in column 7 marks the whole line a comment, and only columns
// 8-72 are scanned as code. Behavior on free-format source is
// undefined/best-effort, same limitation as the outline provider.
//
// Statement boundaries are detected heuristically, not via a full COBOL
// parse: a CALL statement ends at the first "sentence period" (a `.`
// followed by whitespace or end of line) or an explicit END-CALL, whichever
// comes first; an EXEC SQL/EXEC CICS block ends at its END-EXEC. A period
// inside a string literal (e.g. `MOVE "Done." TO WS-MSG` nested inside a
// CALL's ON EXCEPTION arm) could in principle be misread as the statement
// end -- accepted as a rare edge case, same "graceful degrade, never throw"
// philosophy as outlineModel.ts. An unterminated block runs to end of file
// rather than being dropped.

export interface LineRange {
  startLine: number; // 1-indexed, inclusive
  endLine: number; // 1-indexed, inclusive
}

const EXEC_START_RE = /\bEXEC\s+(?:SQL|CICS)\b/i;
const END_EXEC_RE = /\bEND-EXEC\b/i;
const CALL_START_RE = /\bCALL\b/i;
const END_CALL_RE = /\bEND-CALL\b/i;
const SENTENCE_PERIOD_RE = /\.(?=\s|$)/;

// Columns 1-6 (sequence area) and 73-80 (identification area) are never
// scanned, matching outlineModel.ts's scanLine.
function codeOf(line: string): string {
  const indicator = line.charAt(6); // column 7
  if (indicator === '*' || indicator === '/') return '';
  return line.slice(7, 72); // columns 8-72
}

export function findFocusRanges(sourceLines: string[]): LineRange[] {
  const code = sourceLines.map(codeOf);
  const lastLine = sourceLines.length;
  const ranges: LineRange[] = [];

  let i = 0; // 0-indexed line cursor
  while (i < code.length) {
    const lineNumber = i + 1;

    const execMatch = EXEC_START_RE.exec(code[i]);
    if (execMatch) {
      const tailFromExec = code[i].slice(execMatch.index);
      if (END_EXEC_RE.test(tailFromExec)) {
        ranges.push({ startLine: lineNumber, endLine: lineNumber });
        i++;
        continue;
      }
      let end = lastLine;
      let j = i + 1;
      for (; j < code.length; j++) {
        if (END_EXEC_RE.test(code[j])) {
          end = j + 1;
          break;
        }
      }
      if (j === code.length) end = lastLine;
      ranges.push({ startLine: lineNumber, endLine: end });
      i = j < code.length ? j + 1 : code.length;
      continue;
    }

    const callMatch = CALL_START_RE.exec(code[i]);
    if (callMatch) {
      const tailFromCall = code[i].slice(callMatch.index + callMatch[0].length);
      const sameLinePeriod = SENTENCE_PERIOD_RE.exec(tailFromCall);
      const sameLineEndCall = END_CALL_RE.exec(tailFromCall);
      if (sameLinePeriod || sameLineEndCall) {
        ranges.push({ startLine: lineNumber, endLine: lineNumber });
        i++;
        continue;
      }
      let end = lastLine;
      let j = i + 1;
      for (; j < code.length; j++) {
        if (SENTENCE_PERIOD_RE.test(code[j]) || END_CALL_RE.test(code[j])) {
          end = j + 1;
          break;
        }
      }
      if (j === code.length) end = lastLine;
      ranges.push({ startLine: lineNumber, endLine: end });
      i = j < code.length ? j + 1 : code.length;
      continue;
    }

    i++;
  }

  return ranges;
}

function mergeRanges(ranges: LineRange[]): LineRange[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.startLine - b.startLine);
  const merged: LineRange[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    const current = sorted[i];
    if (current.startLine <= last.endLine + 1) {
      last.endLine = Math.max(last.endLine, current.endLine);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

// A gap must span at least 2 lines to be worth folding: VS Code's
// FoldingRange(start, end) hides every line from start to end except the
// first, so a 1-line gap (start === end) would hide nothing.
const MIN_FOLDABLE_LINES = 2;

export function computeFoldRanges(totalLines: number, focusRanges: LineRange[]): LineRange[] {
  const merged = mergeRanges(focusRanges);
  const gaps: LineRange[] = [];

  let cursor = 1;
  for (const range of merged) {
    if (range.startLine - cursor >= MIN_FOLDABLE_LINES) {
      gaps.push({ startLine: cursor, endLine: range.startLine - 1 });
    }
    cursor = range.endLine + 1;
  }
  if (totalLines - cursor + 1 >= MIN_FOLDABLE_LINES) {
    gaps.push({ startLine: cursor, endLine: totalLines });
  }

  return gaps;
}
