import * as assert from 'assert';
import { looksLikeCobolCandidate, looksLikeCopybook } from './copybookDetection';

describe('looksLikeCobolCandidate', () => {
  it('accepts known COBOL/copybook extensions case-insensitively', () => {
    assert.strictEqual(looksLikeCobolCandidate('/p/PROG.CBL'), true);
    assert.strictEqual(looksLikeCobolCandidate('/p/rec.cpy'), true);
    assert.strictEqual(looksLikeCobolCandidate('/p/rec.CPYBOOK'), true);
    assert.strictEqual(looksLikeCobolCandidate('/p/rec.cobcopy'), true);
    assert.strictEqual(looksLikeCobolCandidate('/p/PROG.cob'), true);
    assert.strictEqual(looksLikeCobolCandidate('/p/PROG.cobol'), true);
  });

  it('rejects unrelated extensions with no cobol languageId', () => {
    assert.strictEqual(looksLikeCobolCandidate('/p/readme.md'), false);
    assert.strictEqual(looksLikeCobolCandidate('/p/data.json'), false);
  });

  it('accepts any extension when languageId is cobol', () => {
    assert.strictEqual(looksLikeCobolCandidate('/p/noext', 'cobol'), true);
  });

  it('rejects a non-cobol languageId with an unrelated extension', () => {
    assert.strictEqual(looksLikeCobolCandidate('/p/readme.md', 'markdown'), false);
  });
});

describe('looksLikeCopybook', () => {
  const PROGRAM_SOURCE = `
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PROG1.
       DATA DIVISION.
       PROCEDURE DIVISION.
           STOP RUN.
`;

  const ABBREVIATED_PROGRAM_SOURCE = `
       ID DIVISION.
       PROGRAM-ID. PROG2.
       PROCEDURE DIVISION.
           STOP RUN.
`;

  const COPYBOOK_SOURCE = `
       01  CUSTOMER-RECORD.
           05  CUST-ID       PIC 9(6).
           05  CUST-NAME     PIC X(30).
`;

  it('returns false for a full program', () => {
    assert.strictEqual(looksLikeCopybook(PROGRAM_SOURCE), false);
  });

  it('returns false for the ID DIVISION. abbreviation (still declares PROGRAM-ID)', () => {
    assert.strictEqual(looksLikeCopybook(ABBREVIATED_PROGRAM_SOURCE), false);
  });

  it('returns true for a bare copybook', () => {
    assert.strictEqual(looksLikeCopybook(COPYBOOK_SOURCE), true);
  });

  it('is case-insensitive on both marker tokens', () => {
    assert.strictEqual(looksLikeCopybook('identification division.\nprogram-id. x.'), false);
    assert.strictEqual(looksLikeCopybook('       program-id. x.\n'), false);
  });

  it('returns true for empty text', () => {
    assert.strictEqual(looksLikeCopybook(''), true);
  });

  it('ignores a free-format trailing comment mentioning PROGRAM-ID', () => {
    const source = `
       01  CUSTOMER-RECORD.
           05  CUST-ID       PIC 9(6).   *> no PROGRAM-ID is defined
`;
    assert.strictEqual(looksLikeCopybook(source), true);
  });

  it('ignores a whole-line comment mentioning IDENTIFICATION DIVISION', () => {
    const source = `
      *> Note: this copybook has no IDENTIFICATION DIVISION of its own.
       01  CUSTOMER-RECORD.
           05  CUST-ID       PIC 9(6).
`;
    assert.strictEqual(looksLikeCopybook(source), true);
  });

  it('still flags a real header even when a decoy comment precedes it', () => {
    const source = `
      *> PROGRAM-ID mentioned here first, in a comment
       IDENTIFICATION DIVISION.
       PROGRAM-ID. PROG1.
`;
    assert.strictEqual(looksLikeCopybook(source), false);
  });
});
