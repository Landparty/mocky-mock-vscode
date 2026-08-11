import assert from 'node:assert/strict';
import { buildOutline } from './outlineModel';

// 7 spaces: columns 1-7 blank -> content starts at column 8 (Area A).
const AREA_A = ' '.repeat(7);
// 11 spaces: columns 1-11 blank -> content starts at column 12 (Area B).
const AREA_B = ' '.repeat(11);
// 72 spaces: columns 1-72 blank -> content starts at column 73
// (identification area, never scanned).
const IDENT_AREA = ' '.repeat(72);

describe('buildOutline', () => {
  it('builds DIVISION > SECTION > paragraph/data-item structure with correct line ranges', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`, // 1
      `${AREA_A}PROGRAM-ID. CUSTPROG.`, // 2
      `${AREA_A}DATA DIVISION.`, // 3
      `${AREA_A}WORKING-STORAGE SECTION.`, // 4
      `${AREA_A}01  WS-EOF             PIC X VALUE "N".`, // 5
      `${AREA_A}01  WS-ROW-COUNT       PIC 9(4) VALUE 0.`, // 6
      `${AREA_A}PROCEDURE DIVISION.`, // 7
      `${AREA_A}MAIN-PROCESS.`, // 8
      `${AREA_B}PERFORM FETCH-LOOP UNTIL WS-EOF = "Y".`, // 9
      `${AREA_A}FETCH-LOOP.`, // 10
      `${AREA_B}IF SQLCODE = 100`, // 11
      `${AREA_B}    MOVE "Y" TO WS-EOF`, // 12
      `${AREA_B}END-IF.`, // 13
    ];

    const roots = buildOutline(lines);

    assert.equal(roots.length, 3);
    const [ident, data, proc] = roots;

    assert.equal(ident.kind, 'division');
    assert.equal(ident.name, 'IDENTIFICATION DIVISION');
    assert.equal(ident.startLine, 1);
    assert.equal(ident.endLine, 2);
    assert.equal(ident.children.length, 1);
    assert.equal(ident.children[0].kind, 'programId');
    assert.equal(ident.children[0].name, 'CUSTPROG');
    assert.equal(ident.children[0].startLine, 2);
    assert.equal(ident.children[0].endLine, 2);

    assert.equal(data.name, 'DATA DIVISION');
    assert.equal(data.startLine, 3);
    assert.equal(data.endLine, 6);
    assert.equal(data.children.length, 1);
    const wsSection = data.children[0];
    assert.equal(wsSection.kind, 'section');
    assert.equal(wsSection.name, 'WORKING-STORAGE SECTION');
    assert.equal(wsSection.startLine, 4);
    assert.equal(wsSection.endLine, 6);
    assert.equal(wsSection.children.length, 2);
    assert.equal(wsSection.children[0].kind, 'dataItem');
    assert.equal(wsSection.children[0].name, 'WS-EOF');
    assert.equal(wsSection.children[0].detail, '01');
    assert.equal(wsSection.children[0].startLine, 5);
    assert.equal(wsSection.children[0].endLine, 5);
    assert.equal(wsSection.children[1].name, 'WS-ROW-COUNT');
    assert.equal(wsSection.children[1].detail, '01');

    assert.equal(proc.name, 'PROCEDURE DIVISION');
    assert.equal(proc.startLine, 7);
    assert.equal(proc.endLine, 13);
    assert.equal(proc.children.length, 2);
    assert.equal(proc.children[0].kind, 'paragraph');
    assert.equal(proc.children[0].name, 'MAIN-PROCESS');
    assert.equal(proc.children[0].startLine, 8);
    assert.equal(proc.children[0].endLine, 9);
    assert.equal(proc.children[1].name, 'FETCH-LOOP');
    assert.equal(proc.children[1].startLine, 10);
    assert.equal(proc.children[1].endLine, 13);
  });

  it('recognizes 77-level data items alongside 01-level items', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`, // 1
      `${AREA_A}PROGRAM-ID. DEMO.`, // 2
      `${AREA_A}DATA DIVISION.`, // 3
      `${AREA_A}WORKING-STORAGE SECTION.`, // 4
      `${AREA_A}77  WS-FLAG PIC X.`, // 5
      `${AREA_A}01  WS-RECORD.`, // 6
    ];

    const roots = buildOutline(lines);
    const section = roots[1].children[0];
    assert.equal(section.children.length, 2);
    assert.equal(section.children[0].name, 'WS-FLAG');
    assert.equal(section.children[0].detail, '77');
    assert.equal(section.children[1].name, 'WS-RECORD');
    assert.equal(section.children[1].detail, '01');
  });

  it('nests paragraphs under named PROCEDURE DIVISION sections and closes ranges when a new section starts', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`, // 1
      `${AREA_A}PROGRAM-ID. DEMO.`, // 2
      `${AREA_A}PROCEDURE DIVISION.`, // 3
      `${AREA_A}1000-MAIN SECTION.`, // 4
      `${AREA_A}1000-START.`, // 5
      `${AREA_B}PERFORM 2000-HELPER.`, // 6
      `${AREA_A}2000-HELPER SECTION.`, // 7
      `${AREA_A}2000-HELPER.`, // 8
      `${AREA_B}CONTINUE.`, // 9
    ];

    const roots = buildOutline(lines);
    const proc = roots[1];
    assert.equal(proc.children.length, 2);

    const mainSection = proc.children[0];
    assert.equal(mainSection.kind, 'section');
    assert.equal(mainSection.name, '1000-MAIN SECTION');
    assert.equal(mainSection.startLine, 4);
    assert.equal(mainSection.endLine, 6);
    assert.equal(mainSection.children.length, 1);
    assert.equal(mainSection.children[0].name, '1000-START');
    assert.equal(mainSection.children[0].startLine, 5);
    assert.equal(mainSection.children[0].endLine, 6);

    const helperSection = proc.children[1];
    assert.equal(helperSection.name, '2000-HELPER SECTION');
    assert.equal(helperSection.startLine, 7);
    assert.equal(helperSection.endLine, 9);
    assert.equal(helperSection.children.length, 1);
    assert.equal(helperSection.children[0].name, '2000-HELPER');
    assert.equal(helperSection.children[0].startLine, 8);
    assert.equal(helperSection.children[0].endLine, 9);
  });

  it('excludes comment lines, reserved-word statements, and identification-area text (columns 73-80) from detection', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`, // 1
      `${AREA_A}PROGRAM-ID. DEMO.`, // 2
      `${AREA_A}PROCEDURE DIVISION.`, // 3
      `${AREA_A}MAIN-PARA.`, // 4
      `      * FAKE-PARAGRAPH SECTION.`, // 5 -- column 7 '*' -> whole line is a comment
      `${AREA_A}EXIT.`, // 6 -- reserved word, must not become a paragraph
      `${IDENT_AREA}DATA DIVISION.`, // 7 -- lands in columns 73+, never scanned
    ];

    const roots = buildOutline(lines);

    assert.equal(roots.length, 2); // no phantom third DIVISION from the identification-area text
    const proc = roots[1];
    assert.equal(proc.name, 'PROCEDURE DIVISION');
    assert.equal(proc.startLine, 3);
    assert.equal(proc.endLine, 7);
    assert.equal(proc.children.length, 1); // only MAIN-PARA -- no FAKE-PARAGRAPH section, no EXIT paragraph
    assert.equal(proc.children[0].name, 'MAIN-PARA');
    assert.equal(proc.children[0].endLine, 7);
  });

  it('resolves PROGRAM-ID split across two physical lines and ignores columns 1-6 sequence numbers', () => {
    const lines = [
      '000100 IDENTIFICATION DIVISION.',
      '000200 PROGRAM-ID.',
      '000300     IC101A.',
      '000400 PROCEDURE DIVISION.',
      '000500 MAIN-PARA.',
    ];

    const roots = buildOutline(lines);

    assert.equal(roots.length, 2);
    assert.equal(roots[0].children.length, 1);
    assert.equal(roots[0].children[0].kind, 'programId');
    assert.equal(roots[0].children[0].name, 'IC101A');
    assert.equal(roots[1].children[0].name, 'MAIN-PARA');
  });

  it('creates no PROGRAM-ID node when the name cannot be resolved before the next DIVISION', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID.`,
      `${AREA_A}ENVIRONMENT DIVISION.`,
    ];

    const roots = buildOutline(lines);
    assert.equal(roots[0].children.length, 0);
  });

  it('handles an empty PROCEDURE DIVISION (no paragraphs) without error', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID. DEMO.`,
      `${AREA_A}PROCEDURE DIVISION.`,
    ];

    const roots = buildOutline(lines);
    assert.equal(roots.length, 2);
    assert.equal(roots[1].name, 'PROCEDURE DIVISION');
    assert.equal(roots[1].children.length, 0);
    assert.equal(roots[1].endLine, 3);
  });

  it('ignores content before the first DIVISION header', () => {
    const lines = [
      `${AREA_A}SOME-STRAY-TOKEN.`,
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID. DEMO.`,
    ];

    const roots = buildOutline(lines);
    assert.equal(roots.length, 1);
    assert.equal(roots[0].startLine, 2);
  });

  it('excludes structural reserved words (END-EXEC, DECLARATIVES, etc.) from paragraph detection', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID. DEMO.`,
      `${AREA_A}PROCEDURE DIVISION.`,
      `${AREA_A}MAIN-PARA.`,
      `${AREA_A}END-EXEC.`,
      `${AREA_A}EJECT.`,
    ];

    const roots = buildOutline(lines);
    const proc = roots[1];
    assert.equal(proc.children.length, 1);
    assert.equal(proc.children[0].name, 'MAIN-PARA');
  });

  it('fails soft when the resolved PROGRAM-ID name is actually a reserved word, not a real name', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID.`,
      `${AREA_A}AUTHOR. J-DOE.`,
    ];

    const roots = buildOutline(lines);
    assert.equal(roots[0].children.length, 0);
  });

  it('skips a whole-line floating *> comment between a split PROGRAM-ID and its name', () => {
    const lines = [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID.`,
      `${AREA_A}*> internal note`,
      `${AREA_A}IC101A.`,
    ];

    const roots = buildOutline(lines);
    assert.equal(roots[0].children.length, 1);
    assert.equal(roots[0].children[0].kind, 'programId');
    assert.equal(roots[0].children[0].name, 'IC101A');
  });

  it('recognizes ID DIVISION as an abbreviation for IDENTIFICATION DIVISION', () => {
    const lines = [
      `${AREA_A}ID DIVISION.`,
      `${AREA_A}PROGRAM-ID. DEMO.`,
      `${AREA_A}PROCEDURE DIVISION.`,
    ];

    const roots = buildOutline(lines);
    assert.equal(roots[0].name, 'IDENTIFICATION DIVISION');
    assert.equal(roots[0].children.length, 1);
    assert.equal(roots[0].children[0].name, 'DEMO');
    assert.equal(roots[1].name, 'PROCEDURE DIVISION');
  });
});
