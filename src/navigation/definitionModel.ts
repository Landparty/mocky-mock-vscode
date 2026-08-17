// src/navigation/definitionModel.ts
//
// Pure text scan -> declaration/reference index for "Go to Definition" /
// "Find All References" on COBOL identifiers (data items at ANY level --
// 01 through 49, 66, 77, and 88-level condition-names -- plus PROCEDURE
// DIVISION paragraph and section names). No `vscode` import (repo
// convention -- see outline/outlineModel.ts, whose column model, comment
// handling, and Area-A-anchored header regexes this reuses).
//
// COBOL identifiers are case-insensitive, so both maps below are keyed on
// the UPPERCASED name; each entry keeps the name's first-seen original
// casing for anything user-facing.
//
// Unlike outlineModel.ts (which only indexes 01/77 data items, because
// those are the only levels required to start in Area A), this module also
// finds 02-49/66/88 items, which are conventionally indented into Area B
// with no fixed column -- so level-item detection here is NOT gated on
// Area-A anchoring, only on "first token on the line, while inside the
// DATA DIVISION".
//
// Known limitation (accepted design tradeoff, not a bug): if a name is
// declared more than once -- legal COBOL when qualification (OF/IN) or
// section-scoped PERFORM THRU disambiguates them -- every occurrence
// resolves against the FIRST declaration found in the file. Single-file
// only: COPY'd content isn't visible to this scan (this extension never
// expands copybooks), so a copybook-declared field with no matching text
// in the open file has no reachable declaration.

import { AREA_A_WIDTH, DIVISION_RE, NAMED_SECTION_RE, PARAGRAPH_RE, PARAGRAPH_EXCLUSIONS } from '../outline/outlineModel';

// Any level 0-99 followed by a name -- deliberately permissive (real COBOL
// levels are 01-49/66/77/88) since a stray non-level number starting a DATA
// DIVISION line is not realistic source and misrecognizing it costs nothing.
const LEVEL_RE = /^(\d{1,2})\s+([A-Za-z0-9][A-Za-z0-9-]*)/;
const IDENTIFIER_TOKEN_RE = /[A-Za-z0-9][A-Za-z0-9-]*/g;

export interface SymbolLocation {
  line: number; // 1-indexed
  startColumn: number; // 0-indexed, inclusive
  endColumn: number; // 0-indexed, exclusive
}

export interface Declaration {
  name: string; // original casing, as first declared
  location: SymbolLocation;
}

export interface DefinitionIndex {
  declarations: Map<string, Declaration>; // key: uppercased name
  references: Map<string, SymbolLocation[]>; // key: uppercased name, declaration's own occurrence excluded
}

// Blanks out quoted literal content (keeping length/columns intact) so a
// literal like VALUE "WS-EOF" or MOVE "SOME-PARA" TO ... doesn't get
// mistaken for a real reference to a same-named declaration. Handles COBOL's
// doubled-quote escape (`""` inside a `"`-delimited literal is one literal
// quote character). An unterminated literal blanks to end of line, which is
// a safe fallback for malformed/continued source this scan doesn't model.
function stripStringLiterals(code: string): string {
  const out = code.split('');
  let i = 0;
  while (i < code.length) {
    const ch = code[i];
    if (ch === '"' || ch === "'") {
      const quote = ch;
      out[i] = ' ';
      i++;
      while (i < code.length) {
        if (code[i] === quote) {
          out[i] = ' ';
          i++;
          if (code[i] === quote) {
            out[i] = ' ';
            i++;
            continue;
          }
          break;
        }
        out[i] = ' ';
        i++;
      }
      continue;
    }
    i++;
  }
  return out.join('');
}

function registerDeclaration(declarations: Map<string, Declaration>, name: string, lineNumber: number, startColumn: number): void {
  const key = name.toUpperCase();
  if (declarations.has(key)) return; // first declaration in the file wins -- see module header
  declarations.set(key, {
    name,
    location: { line: lineNumber, startColumn, endColumn: startColumn + name.length },
  });
}

export function buildDefinitionIndex(sourceLines: string[]): DefinitionIndex {
  const declarations = new Map<string, Declaration>();
  const references = new Map<string, SymbolLocation[]>();
  const codeLines: { lineNumber: number; code: string }[] = [];

  type Division = 'DATA' | 'PROCEDURE' | 'OTHER';
  let currentDivision: Division = 'OTHER';

  for (let idx = 0; idx < sourceLines.length; idx++) {
    const lineNumber = idx + 1;
    const line = sourceLines[idx];
    const indicator = line.charAt(6); // column 7
    const isComment = indicator === '*' || indicator === '/';
    const code = isComment ? '' : line.slice(7, 72); // columns 8-72
    const firstNonBlank = code.search(/\S/);
    if (firstNonBlank === -1) continue; // blank or comment line

    // Whole-line floating `*>` comment (see outlineModel.ts's scanLine for
    // the same rule) -- treated identically to a blank line.
    if (code.slice(firstNonBlank, firstNonBlank + 2) === '*>') continue;

    const startsInAreaA = firstNonBlank < AREA_A_WIDTH;
    const trimmed = code.slice(firstNonBlank).trimEnd();
    // Column-8-72 index `k` maps to 0-indexed VS Code column `7 + k` (column
    // 8, 1-indexed, is index 7, 0-indexed); `trimmed` starts at `firstNonBlank`
    // within `code`, so a name found at offset `j` within `trimmed` sits at
    // VS Code column `7 + firstNonBlank + j`.
    const trimmedBaseColumn = 7 + firstNonBlank;

    if (startsInAreaA) {
      const divisionMatch = DIVISION_RE.exec(trimmed);
      if (divisionMatch) {
        const word = divisionMatch[1].toUpperCase();
        currentDivision = word === 'DATA' ? 'DATA' : word === 'PROCEDURE' ? 'PROCEDURE' : 'OTHER';
        continue; // a DIVISION header has no declarable identifier of its own
      }
    }

    if (currentDivision === 'DATA') {
      const levelMatch = LEVEL_RE.exec(trimmed);
      if (levelMatch) {
        const name = levelMatch[2];
        if (name.toUpperCase() !== 'FILLER') {
          const nameOffset = levelMatch[0].length - name.length;
          registerDeclaration(declarations, name, lineNumber, trimmedBaseColumn + nameOffset);
        }
      }
    }

    if (currentDivision === 'PROCEDURE' && startsInAreaA) {
      const sectionMatch = NAMED_SECTION_RE.exec(trimmed);
      if (sectionMatch) {
        registerDeclaration(declarations, sectionMatch[1], lineNumber, trimmedBaseColumn);
      } else {
        const paragraphMatch = PARAGRAPH_RE.exec(trimmed);
        if (paragraphMatch && !PARAGRAPH_EXCLUSIONS.has(paragraphMatch[1].toUpperCase())) {
          registerDeclaration(declarations, paragraphMatch[1], lineNumber, trimmedBaseColumn);
        }
      }
    }

    codeLines.push({ lineNumber, code });
  }

  for (const { lineNumber, code } of codeLines) {
    const cleaned = stripStringLiterals(code);
    IDENTIFIER_TOKEN_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = IDENTIFIER_TOKEN_RE.exec(cleaned))) {
      const token = match[0];
      const key = token.toUpperCase();
      const decl = declarations.get(key);
      if (!decl) continue;

      const startColumn = 7 + match.index;
      if (decl.location.line === lineNumber && decl.location.startColumn === startColumn) {
        continue; // this occurrence IS the declaration itself, not a reference to it
      }

      const list = references.get(key) ?? [];
      list.push({ line: lineNumber, startColumn, endColumn: startColumn + token.length });
      references.set(key, list);
    }
  }

  return { declarations, references };
}
