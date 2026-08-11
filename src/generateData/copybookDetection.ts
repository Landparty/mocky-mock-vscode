// Pure, vscode-independent copybook detection -- kept free of the vscode
// import so it's unit-testable under mocha (repo convention, see
// analysisRunner.ts vs analyzeCobol.ts). Two-stage gate: a file must first
// look COBOL-shaped (extension or languageId) before the content sniff
// below means anything -- "no IDENTIFICATION DIVISION" is true of nearly
// every file on disk, so it's only a meaningful signal once the candidate
// gate has already narrowed to COBOL-shaped files.
const COBOL_CANDIDATE_EXTENSIONS = ['.cbl', '.cob', '.cobol', '.cpy', '.cpybook', '.cobcopy'];

export function looksLikeCobolCandidate(fsPath: string, languageId?: string): boolean {
  if (languageId === 'cobol') {
    return true;
  }
  const lower = fsPath.toLowerCase();
  return COBOL_CANDIDATE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

// A copybook has data-item entries but no IDENTIFICATION DIVISION/PROGRAM-ID
// header. Checking PROGRAM-ID in addition to IDENTIFICATION DIVISION also
// catches the standard "ID DIVISION." IBM abbreviation for free, since any
// program using it still declares a PROGRAM-ID.
const PROGRAM_MARKER_PATTERN = /\b(IDENTIFICATION\s+DIVISION|PROGRAM-ID)\b/i;

// Strips the two comment forms this heuristic can cheaply recognize without
// a real fixed-format preprocessor, so a comment merely mentioning
// "PROGRAM-ID" (e.g. "*> no PROGRAM-ID is defined") doesn't get read as an
// actual header statement:
//   - free-format trailing comments: "*>" to end of line, wherever it
//     appears on the line
//   - whole-line comments: any line whose first non-blank character is "*"
//     (covers the common free-format full-line convention, and fixed-format
//     lines that happen to have no sequence-number prefix before column 7)
// This is intentionally bounded, not a full parser: a fixed-format file
// that still carries a sequence-number prefix in columns 1-6 puts its
// comment indicator past column 7, past this function's "first non-blank
// character" check, and a string/figurative-literal mentioning
// "PROGRAM-ID" (e.g. MOVE "PROGRAM-ID" TO WS-FIELD) is not stripped either.
// Both are accepted, rarer gaps in an already-approximate sniff -- normalizing
// fixed-format columns or tokenizing string literals is cobolparser's job,
// not this lightweight editor-side gate's.
function stripCommentsForDetection(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.trimStart().startsWith('*')) {
        return '';
      }
      const inlineCommentIndex = line.indexOf('*>');
      return inlineCommentIndex === -1 ? line : line.slice(0, inlineCommentIndex);
    })
    .join('\n');
}

export function looksLikeCopybook(text: string): boolean {
  return !PROGRAM_MARKER_PATTERN.test(stripCommentsForDetection(text));
}

// package.json's `contributes.menus.editor/title[].when` reads this exact
// string -- keep it in this vscode-free file (not generateData.ts, which
// imports vscode and so can't be exercised by mocha) so the manifest and
// this constant can't drift apart with no error anywhere. See
// copybookIconContribution.test.ts.
export const COPYBOOK_ICON_CONTEXT_KEY = 'mockymock.activeEditorIsCopybook';
