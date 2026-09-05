// src/outline/outlineModel.ts
//
// Pure text scan -> outline tree, no `vscode` import (repo convention --
// pure logic lives outside vscode-importing files). Targets IBM
// Enterprise COBOL FIXED FORMAT ONLY: the `>>SOURCE FORMAT FREE` directive
// and free-format source generally are out of scope, behavior on a
// free-format file is undefined/best-effort. A whole-line floating `*>`
// comment (the sole content of a line, as the first text in Area A or
// Area B) IS recognized and treated as blank -- this is a legitimate fixed-
// format comment form, not a free-format feature. An inline trailing `*>`
// comment after real code on the same line is NOT stripped or otherwise
// handled specially.
//
// The core correctness mechanism is column position, not indentation
// heuristics: DIVISION headers, SECTION headers, PROGRAM-ID, 01/77-level
// data items, and PROCEDURE DIVISION paragraph names are only valid
// starting in Area A (columns 8-11) per the COBOL fixed-format rules.
// This is what lets sequence-numbered source (columns 1-6 holding a line
// number, e.g. examples/nist-cobol85/*.CBL) parse identically to source
// with columns 1-6 left blank -- unlike syntaxes/cobol.tmLanguage.json's
// `^\s*`-anchored grammar rules, which require purely-whitespace lead-in
// and so never match a sequence-numbered line at all.
//
// Tab-indented source is not recognized: a tab character at column 7 is not
// treated as the fixed-format indicator area, and columns don't line up the
// way they would with real space-padding. This is an accepted limitation of
// the column model, not a bug -- it degrades gracefully to an empty/partial
// outline, never throws. Note this means outline and TextMate-grammar syntax
// highlighting can disagree on such a file, since the grammar's `^\s*`-
// anchored rules don't require literal spaces the way this column model does.
//
// Built-in DATA/ENVIRONMENT DIVISION section names (WORKING-STORAGE SECTION,
// etc.) are deliberately normalized to uppercase in the emitted symbol name,
// since they're fixed reserved words with one canonical form. User-defined
// PROCEDURE DIVISION section names are deliberately left in the source's
// original casing, since normalizing a user's own identifier would be wrong.
// This asymmetry is intentional, not an inconsistency to fix.

// NOTE: the DocumentSymbolProvider that turned this into VS Code's Outline
// view moved to the cobol-analyzer extension with the rest of the COBOL
// language surface. This model stays because newTestSuite/cutTemplate.ts
// scaffolds a .cut from a program's paragraph structure -- exactly what
// this produces -- so it is a test-authoring dependency here, not dead code.
export type OutlineNodeKind = 'division' | 'programId' | 'section' | 'dataItem' | 'paragraph';

export interface OutlineNode {
  kind: OutlineNodeKind;
  name: string;
  detail?: string;
  startLine: number; // 1-indexed, inclusive
  endLine: number; // 1-indexed, inclusive
  children: OutlineNode[];
}

// Columns 8-11 (1-indexed) = Area A, i.e. the first 4 characters of the
// column-7-stripped code content produced by scanLine.
export const AREA_A_WIDTH = 4;

export const DIVISION_RE = /^(IDENTIFICATION|ID|ENVIRONMENT|DATA|PROCEDURE)\s+DIVISION\b/i;
const BUILTIN_SECTION_RE = /^(CONFIGURATION|INPUT-OUTPUT|FILE|WORKING-STORAGE|LOCAL-STORAGE|LINKAGE)\s+SECTION\b/i;
export const NAMED_SECTION_RE = /^([A-Za-z0-9][A-Za-z0-9-]*)\s+SECTION\b/i;
const PROGRAM_ID_RE = /^PROGRAM-ID\s*\.\s*(.*)$/i;
const PROGRAM_NAME_TOKEN_RE = /^([A-Za-z0-9][A-Za-z0-9-]*)/;
const LEVEL_ITEM_RE = /^(0?1|77)\s+([A-Za-z0-9][A-Za-z0-9-]*)/;
export const PARAGRAPH_RE = /^([A-Za-z0-9][A-Za-z0-9-]*)\.(?=\s|$)/;

// Reserved words that share the paragraph-label shape ("word.") -- ported
// verbatim from syntaxes/cobol.tmLanguage.json's paragraph-label pattern's
// exclusion list, so outline entries and syntax highlighting agree on
// what counts as a real paragraph name. Area A anchoring already rules
// out most of these (they're normally indented as part of a statement),
// but a minimally-formatted program could place one at the Area A
// margin. Exported for reuse by navigation/definitionModel.ts, which needs
// the same exclusion list to agree with the Outline panel on what counts as
// a real paragraph/section name.
export const PARAGRAPH_EXCLUSIONS = new Set([
  'PROGRAM-ID', 'AUTHOR', 'INSTALLATION', 'DATE-WRITTEN', 'DATE-COMPILED', 'SECURITY', 'REMARKS',
  'FILE-CONTROL', 'I-O-CONTROL', 'CONTINUE', 'EXIT', 'GOBACK',
  'END-ADD', 'END-CALL', 'END-COMPUTE', 'END-DELETE', 'END-DIVIDE', 'END-EVALUATE', 'END-IF',
  'END-MULTIPLY', 'END-PERFORM', 'END-READ', 'END-RETURN', 'END-REWRITE', 'END-SEARCH', 'END-START',
  'END-STRING', 'END-SUBTRACT', 'END-UNSTRING', 'END-WRITE', 'END-EXEC',
  'EJECT', 'SKIP1', 'SKIP2', 'SKIP3', 'TITLE', 'DECLARATIVES',
]);

interface ScannedLine {
  lineNumber: number; // 1-indexed
  isBlank: boolean; // a column-7 `*`/`/` comment, a whole-line floating `*>` comment, or nothing but whitespace in columns 8-72
  startsInAreaA: boolean;
  trimmed: string; // columns 8-72, leading/trailing whitespace stripped; '' when isBlank
}

// Columns 1-6 (sequence area) and 73-80 (identification area) are never
// scanned -- see the module header comment for why this, not `^\s*`, is
// what makes sequence-numbered source parse correctly.
function scanLine(line: string, lineNumber: number): ScannedLine {
  const indicator = line.charAt(6); // column 7
  const isComment = indicator === '*' || indicator === '/';
  const code = isComment ? '' : line.slice(7, 72); // columns 8-72
  const firstNonBlank = code.search(/\S/);
  if (firstNonBlank === -1) {
    return { lineNumber, isBlank: true, startsInAreaA: false, trimmed: '' };
  }
  // A whole-line floating `*>` comment: `*>` is the very first non-blank
  // token on the line (Area A or Area B). Treated identically to a
  // genuinely empty line. Scoped narrowly to this case -- an inline `*>`
  // comment trailing real code on the same line is left untouched, since
  // that's not what got flagged and stripping it is a separate, larger
  // change (would require preserving pre-`*>` code as `trimmed`).
  if (code.slice(firstNonBlank, firstNonBlank + 2) === '*>') {
    return { lineNumber, isBlank: true, startsInAreaA: false, trimmed: '' };
  }
  return {
    lineNumber,
    isBlank: false,
    startsInAreaA: firstNonBlank < AREA_A_WIDTH,
    trimmed: code.slice(firstNonBlank).trimEnd(),
  };
}

// PROGRAM-ID's argument commonly sits on the line after "PROGRAM-ID."
// itself in real IBM Enterprise source (see
// examples/nist-cobol85/IC101A.CBL: "PROGRAM-ID." alone on one line, the
// program name indented into Area B on the next). Scans forward for the
// first non-blank line's leading identifier, regardless of which Area it
// starts in -- unlike every other node type, PROGRAM-ID's argument isn't
// itself required to start in Area A. Stops (returns undefined) at the
// next DIVISION header or end of file, so a malformed/nameless
// PROGRAM-ID never grabs an unrelated later line.
function resolveProgramName(scanned: ScannedLine[], programIdIndex: number): string | undefined {
  for (let j = programIdIndex + 1; j < scanned.length; j++) {
    const candidate = scanned[j];
    if (candidate.isBlank) continue;
    if (DIVISION_RE.test(candidate.trimmed)) return undefined;
    const match = PROGRAM_NAME_TOKEN_RE.exec(candidate.trimmed);
    if (!match) return undefined;
    return PARAGRAPH_EXCLUSIONS.has(match[1].toUpperCase()) ? undefined : match[1];
  }
  return undefined;
}

export function buildOutline(sourceLines: string[]): OutlineNode[] {
  const scanned = sourceLines.map((line, idx) => scanLine(line, idx + 1));
  const lastLine = sourceLines.length;
  const roots: OutlineNode[] = [];

  let openDivision: OutlineNode | undefined;
  let openSection: OutlineNode | undefined;
  let openParagraph: OutlineNode | undefined;

  const closeParagraph = (endLine: number) => {
    if (openParagraph) openParagraph.endLine = endLine;
    openParagraph = undefined;
  };
  const closeSection = (endLine: number) => {
    closeParagraph(endLine);
    if (openSection) openSection.endLine = endLine;
    openSection = undefined;
  };
  const closeDivision = (endLine: number) => {
    closeSection(endLine);
    if (openDivision) openDivision.endLine = endLine;
    openDivision = undefined;
  };

  for (let i = 0; i < scanned.length; i++) {
    const line = scanned[i];
    if (line.isBlank || !line.startsInAreaA) continue;

    const divisionMatch = DIVISION_RE.exec(line.trimmed);
    if (divisionMatch) {
      closeDivision(line.lineNumber - 1);
      // `ID` is a valid IBM abbreviation for `IDENTIFICATION`; normalize to
      // the canonical spelling so downstream `openDivision.name ===
      // 'IDENTIFICATION DIVISION'` checks (PROGRAM-ID parsing, etc.) fire
      // regardless of which spelling the source used -- same "one
      // canonical form for a fixed reserved word" convention as built-in
      // section names (see module header).
      const divisionWord = divisionMatch[1].toUpperCase();
      const canonicalDivisionWord = divisionWord === 'ID' ? 'IDENTIFICATION' : divisionWord;
      openDivision = {
        kind: 'division',
        name: `${canonicalDivisionWord} DIVISION`,
        startLine: line.lineNumber,
        endLine: lastLine,
        children: [],
      };
      roots.push(openDivision);
      continue;
    }

    if (!openDivision) continue; // content before the first DIVISION header -- ignore

    if (openDivision.name === 'IDENTIFICATION DIVISION') {
      const programIdMatch = PROGRAM_ID_RE.exec(line.trimmed);
      if (programIdMatch) {
        const remainder = programIdMatch[1].trim();
        const nameMatch = remainder ? PROGRAM_NAME_TOKEN_RE.exec(remainder) : undefined;
        const name = nameMatch ? nameMatch[1] : resolveProgramName(scanned, i);
        if (name) {
          openDivision.children.push({
            kind: 'programId',
            name,
            startLine: line.lineNumber,
            endLine: line.lineNumber,
            children: [],
          });
        }
        continue;
      }
    }

    const builtinSectionMatch = BUILTIN_SECTION_RE.exec(line.trimmed);
    if (builtinSectionMatch) {
      closeSection(line.lineNumber - 1);
      openSection = {
        kind: 'section',
        name: `${builtinSectionMatch[1].toUpperCase()} SECTION`,
        startLine: line.lineNumber,
        endLine: lastLine,
        children: [],
      };
      openDivision.children.push(openSection);
      continue;
    }

    if (openDivision.name === 'PROCEDURE DIVISION') {
      const namedSectionMatch = NAMED_SECTION_RE.exec(line.trimmed);
      if (namedSectionMatch) {
        closeSection(line.lineNumber - 1);
        openSection = {
          kind: 'section',
          name: `${namedSectionMatch[1]} SECTION`,
          startLine: line.lineNumber,
          endLine: lastLine,
          children: [],
        };
        openDivision.children.push(openSection);
        continue;
      }
    }

    if (openDivision.name === 'DATA DIVISION') {
      const levelMatch = LEVEL_ITEM_RE.exec(line.trimmed);
      if (levelMatch) {
        const level = levelMatch[1].length === 1 ? `0${levelMatch[1]}` : levelMatch[1];
        const dataItem: OutlineNode = {
          kind: 'dataItem',
          name: levelMatch[2],
          detail: level,
          startLine: line.lineNumber,
          endLine: line.lineNumber,
          children: [],
        };
        (openSection ?? openDivision).children.push(dataItem);
        continue;
      }
    }

    if (openDivision.name === 'PROCEDURE DIVISION') {
      const paragraphMatch = PARAGRAPH_RE.exec(line.trimmed);
      if (paragraphMatch && !PARAGRAPH_EXCLUSIONS.has(paragraphMatch[1].toUpperCase())) {
        closeParagraph(line.lineNumber - 1);
        openParagraph = {
          kind: 'paragraph',
          name: paragraphMatch[1],
          startLine: line.lineNumber,
          endLine: lastLine,
          children: [],
        };
        (openSection ?? openDivision).children.push(openParagraph);
        continue;
      }
    }
  }

  closeDivision(lastLine);
  return roots;
}
