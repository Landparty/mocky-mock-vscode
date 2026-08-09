import assert from 'node:assert/strict';
import { extractLoopAnnotation, extractSourceSnippet } from './sourceAnnotations';

describe('extractLoopAnnotation', () => {
  it('extracts a single-line UNTIL clause (real INVUPDT.cbl source)', () => {
    const sourceLines = [
      '000000 IDENTIFICATION DIVISION.',
      // ...line 37 in the real fixture:
      '           PERFORM PROCESS-LOOP UNTIL WS-EOF = "Y".',
    ];
    const result = extractLoopAnnotation(sourceLines, 2, 'UNTIL');
    assert.equal(result, 'UNTIL WS-EOF = "Y"');
  });

  it('extracts a VARYING ... UNTIL clause', () => {
    const sourceLines = ['      PERFORM 3210-ACCUM-HOURS VARYING WS-DAY FROM 1 BY 1 UNTIL WS-DAY > 7.'];
    const result = extractLoopAnnotation(sourceLines, 1, 'VARYING');
    assert.equal(result, 'VARYING WS-DAY FROM 1 BY 1 UNTIL WS-DAY > 7');
  });

  it('extracts a TIMES clause', () => {
    const sourceLines = ['      PERFORM RETRY-PARA 5 TIMES.'];
    const result = extractLoopAnnotation(sourceLines, 1, 'TIMES');
    assert.equal(result, '5 TIMES');
  });

  it('joins a clause that wraps across multiple lines', () => {
    const sourceLines = [
      '      PERFORM PROCESS-LOOP',
      "          UNTIL WS-EOF-SW = 'Y'",
      "              OR WS-ERROR-SW = 'Y'.",
    ];
    const result = extractLoopAnnotation(sourceLines, 1, 'UNTIL');
    assert.equal(result, "UNTIL WS-EOF-SW = 'Y' OR WS-ERROR-SW = 'Y'");
  });

  it('returns undefined for a non-loop SIMPLE perform', () => {
    const sourceLines = ['      PERFORM UPDATE-DB.'];
    assert.equal(extractLoopAnnotation(sourceLines, 1, 'SIMPLE'), undefined);
  });

  it('returns undefined when the expected keyword is not found (malformed input)', () => {
    const sourceLines = ['      PERFORM SOMETHING.'];
    assert.equal(extractLoopAnnotation(sourceLines, 1, 'UNTIL'), undefined);
  });

  it('stops scanning after a safety cap of lines with no terminating period', () => {
    // Verify that keywords beyond the 6-line cap are not found
    const sourceLines = [
      '      PERFORM SOME-PARA',
      '          AND MORE',
      '          AND MORE',
      '          AND MORE',
      '          AND MORE',
      '          AND MORE',
      '          UNTIL WS-EOF = "Y"', // Line 7 - beyond the 6-line cap, will not be scanned
    ];
    assert.equal(extractLoopAnnotation(sourceLines, 1, 'UNTIL'), undefined);

    // Verify that keywords at the cap boundary (line 6) ARE found
    const sourceLines2 = [
      '      PERFORM SOME-PARA',
      '          AND MORE',
      '          AND MORE',
      '          AND MORE',
      '          AND MORE',
      '          UNTIL WS-EOF = "Y"', // Line 6 - at the cap boundary, will be scanned
    ];
    assert.equal(extractLoopAnnotation(sourceLines2, 1, 'UNTIL'), 'UNTIL WS-EOF = "Y"');
  });
});

describe('extractSourceSnippet', () => {
  it('returns up to maxLines starting at startLine, 1-indexed', () => {
    const sourceLines = ['A', 'B', 'C', 'D', 'E'];
    const result = extractSourceSnippet(sourceLines, 2, 3);
    assert.deepEqual(result, [
      { line: 2, text: 'B' },
      { line: 3, text: 'C' },
      { line: 4, text: 'D' },
    ]);
  });

  it('clamps at the end of the file instead of throwing', () => {
    const sourceLines = ['A', 'B'];
    const result = extractSourceSnippet(sourceLines, 2, 5);
    assert.deepEqual(result, [{ line: 2, text: 'B' }]);
  });

  it('returns an empty array when startLine is past the end of the file', () => {
    const sourceLines = ['A'];
    assert.deepEqual(extractSourceSnippet(sourceLines, 5, 3), []);
  });
});
