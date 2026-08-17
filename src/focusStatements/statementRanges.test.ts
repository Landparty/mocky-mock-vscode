import assert from 'node:assert/strict';
import { findFocusRanges, computeFoldRanges } from './statementRanges';

// 7 spaces: columns 1-7 blank -> content starts at column 8 (Area A).
const AREA_A = ' '.repeat(7);
// 11 spaces: columns 1-11 blank -> content starts at column 12 (Area B).
const AREA_B = ' '.repeat(11);

describe('findFocusRanges', () => {
  it('finds a single-line EXEC SQL block', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}EXEC SQL COMMIT END-EXEC.`, // 2
      `${AREA_A}NEXT-PARA.`, // 3
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [{ startLine: 2, endLine: 2 }]);
  });

  it('finds a multi-line EXEC SQL block', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}EXEC SQL`, // 2
      `${AREA_B}    SELECT COL1 INTO :WS-COL1`, // 3
      `${AREA_B}    FROM MYTABLE`, // 4
      `${AREA_B}END-EXEC.`, // 5
      `${AREA_A}NEXT-PARA.`, // 6
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [{ startLine: 2, endLine: 5 }]);
  });

  it('finds a multi-line EXEC CICS block', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}EXEC CICS`, // 2
      `${AREA_B}    READ FILE('CUSTFILE')`, // 3
      `${AREA_B}    INTO(CUST-REC)`, // 4
      `${AREA_B}END-EXEC.`, // 5
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [{ startLine: 2, endLine: 5 }]);
  });

  it('finds a single-line CALL statement terminated by a period', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}CALL 'SUBPGM' USING WS-PARM.`, // 2
      `${AREA_A}NEXT-PARA.`, // 3
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [{ startLine: 2, endLine: 2 }]);
  });

  it('finds a multi-line CALL statement terminated by a trailing period', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}CALL 'SUBPGM'`, // 2
      `${AREA_B}    USING WS-PARM1`, // 3
      `${AREA_B}          WS-PARM2.`, // 4
      `${AREA_A}NEXT-PARA.`, // 5
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [{ startLine: 2, endLine: 4 }]);
  });

  it('finds a multi-line CALL statement terminated by END-CALL', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}CALL 'SUBPGM' USING WS-PARM`, // 2
      `${AREA_B}    ON EXCEPTION`, // 3
      `${AREA_B}        DISPLAY 'BAD CALL'`, // 4
      `${AREA_B}END-CALL.`, // 5
      `${AREA_A}NEXT-PARA.`, // 6
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [{ startLine: 2, endLine: 5 }]);
  });

  it('does not match CALL inside a longer identifier like RECALL-FLAG', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}MOVE 'Y' TO RECALL-FLAG.`, // 2
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, []);
  });

  it('does not match CALL as the prefix of a hyphenated paragraph label like CALL-INIT-1', () => {
    const lines = [
      `${AREA_A}CALL-INIT-1.`, // 1
      `${AREA_B}DISPLAY 'HELLO'.`, // 2
    ];

    assert.deepEqual(findFocusRanges(lines), []);
  });

  it('does not match CALL as the suffix of a hyphenated paragraph label like INIT-CALL', () => {
    const lines = [
      `${AREA_A}INIT-CALL.`, // 1
      `${AREA_B}DISPLAY 'HELLO'.`, // 2
    ];

    assert.deepEqual(findFocusRanges(lines), []);
  });

  it('does not mistake CALL inside a quoted string literal for a real CALL statement', () => {
    // Regression test: CALL_START_RE isn't anchored to the start of the
    // line, so a message literal containing the bare word "CALL" (preceded/
    // followed by non-identifier characters, unlike RECALL-FLAG above) used
    // to satisfy the lookaround check and get treated as a real CALL
    // statement start, with the literal's own closing "'." satisfying the
    // same-line sentence-period check too.
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}DISPLAY 'PLEASE CALL SUPPORT FOR HELP'.`, // 2
    ];

    assert.deepEqual(findFocusRanges(lines), []);
  });

  it('does not mistake EXEC SQL inside a quoted string literal for a real EXEC SQL block', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}DISPLAY 'NOW RUNNING EXEC SQL FOR REAL'.`, // 2
    ];

    assert.deepEqual(findFocusRanges(lines), []);
  });

  it('treats a whole-line floating *> comment as blank, not statement code', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}*> CALL 'SUBPGM' USING WS-PARM.`, // 2
      `${AREA_A}NEXT-PARA.`, // 3
    ];

    assert.deepEqual(findFocusRanges(lines), []);
  });

  it('finds multiple separate statements in line order', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}CALL 'SUBPGM' USING WS-PARM.`, // 2
      `${AREA_B}DISPLAY 'HELLO'.`, // 3
      `${AREA_B}EXEC SQL COMMIT END-EXEC.`, // 4
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [
      { startLine: 2, endLine: 2 },
      { startLine: 4, endLine: 4 },
    ]);
  });

  it('returns an empty array for a file with no matching statements', () => {
    const lines = [`${AREA_A}MAIN-PARA.`, `${AREA_B}DISPLAY 'HELLO'.`];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, []);
  });

  it('returns an empty array for an empty file', () => {
    assert.deepEqual(findFocusRanges([]), []);
  });

  it('closes an unterminated EXEC SQL block at end of file rather than throwing', () => {
    const lines = [
      `${AREA_A}MAIN-PARA.`, // 1
      `${AREA_B}EXEC SQL`, // 2
      `${AREA_B}    SELECT COL1 INTO :WS-COL1 FROM MYTABLE`, // 3
    ];

    const ranges = findFocusRanges(lines);

    assert.deepEqual(ranges, [{ startLine: 2, endLine: 3 }]);
  });
});

describe('computeFoldRanges', () => {
  it('returns the gap before, between, and after focus ranges', () => {
    const gaps = computeFoldRanges(10, [
      { startLine: 4, endLine: 4 },
      { startLine: 7, endLine: 8 },
    ]);

    assert.deepEqual(gaps, [
      { startLine: 1, endLine: 3 },
      { startLine: 5, endLine: 6 },
      { startLine: 9, endLine: 10 },
    ]);
  });

  it('omits a gap that is too short to fold (single line)', () => {
    const gaps = computeFoldRanges(6, [
      { startLine: 2, endLine: 2 },
      { startLine: 4, endLine: 4 },
    ]);

    // line 3 alone between the two focus ranges is a 1-line gap - not worth folding
    assert.deepEqual(gaps, [
      { startLine: 5, endLine: 6 },
    ]);
  });

  it('returns the whole file as one gap when there are no focus ranges', () => {
    const gaps = computeFoldRanges(5, []);

    assert.deepEqual(gaps, [{ startLine: 1, endLine: 5 }]);
  });

  it('returns no gaps when a single focus range covers the whole file', () => {
    const gaps = computeFoldRanges(5, [{ startLine: 1, endLine: 5 }]);

    assert.deepEqual(gaps, []);
  });

  it('merges overlapping or adjacent focus ranges before computing gaps', () => {
    const gaps = computeFoldRanges(10, [
      { startLine: 2, endLine: 4 },
      { startLine: 4, endLine: 6 },
    ]);

    // merged focus range is {2,6}; the resulting 1-line leading gap (line 1
    // alone) is below the 2-line folding threshold and is omitted, same as
    // the 'omits a gap that is too short to fold' case above.
    assert.deepEqual(gaps, [{ startLine: 7, endLine: 10 }]);
  });
});
