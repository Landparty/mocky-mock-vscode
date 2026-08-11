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

export function looksLikeCopybook(text: string): boolean {
  return !PROGRAM_MARKER_PATTERN.test(text);
}
