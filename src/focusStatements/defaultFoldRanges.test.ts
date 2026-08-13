import assert from 'node:assert/strict';
import { defaultFoldRanges } from './defaultFoldRanges';

// 7 spaces: columns 1-7 blank -> content starts at column 8 (Area A).
const AREA_A = ' '.repeat(7);
// 11 spaces: columns 1-11 blank -> content starts at column 12 (Area B).
const AREA_B = ' '.repeat(11);

describe('defaultFoldRanges', () => {
  it('returns a foldable range per division/section/paragraph that spans more than one line', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`, // 1
      `${AREA_A}PROGRAM-ID. CUSTPROG.`, // 2
      `${AREA_A}DATA DIVISION.`, // 3
      `${AREA_A}WORKING-STORAGE SECTION.`, // 4
      `${AREA_A}01  WS-EOF             PIC X VALUE "N".`, // 5
      `${AREA_A}PROCEDURE DIVISION.`, // 6
      `${AREA_A}MAIN-PARA.`, // 7
      `${AREA_B}DISPLAY 'HELLO'.`, // 8
    ];

    const ranges = defaultFoldRanges(lines);

    // IDENTIFICATION DIVISION (1-2), DATA DIVISION (3-5), WORKING-STORAGE
    // SECTION (4-5), PROCEDURE DIVISION (6-8), MAIN-PARA (7-8). The
    // single-line PROGRAM-ID (2-2) and WS-EOF (5-5) nodes are excluded --
    // nothing to hide in a one-line fold.
    assert.deepEqual(ranges, [
      { startLine: 1, endLine: 2 },
      { startLine: 3, endLine: 5 },
      { startLine: 4, endLine: 5 },
      { startLine: 6, endLine: 8 },
      { startLine: 7, endLine: 8 },
    ]);
  });

  it('returns an empty array for a file with no multi-line structural nodes', () => {
    // A single-line division header with nothing after it: the division
    // node's own span is 1-1 (startLine === endLine), not foldable.
    const lines = [`${AREA_A}IDENTIFICATION DIVISION.`];

    assert.deepEqual(defaultFoldRanges(lines), []);
  });
});
