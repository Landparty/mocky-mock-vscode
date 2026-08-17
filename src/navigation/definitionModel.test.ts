import assert from 'node:assert/strict';
import { buildDefinitionIndex } from './definitionModel';

// 7 spaces: columns 1-7 blank -> content starts at column 8 (Area A).
const AREA_A = ' '.repeat(7);
// 11 spaces: columns 1-11 blank -> content starts at column 12 (Area B).
const AREA_B = ' '.repeat(11);

describe('buildDefinitionIndex', () => {
  it('declares data items at every level, including 05-level fields nested in a 01 record and 88-level condition-names', () => {
    const lines = [
      `${AREA_A}DATA DIVISION.`, // 1
      `${AREA_A}WORKING-STORAGE SECTION.`, // 2
      `${AREA_A}01  WS-CUSTOMER-REC.`, // 3
      `${AREA_B}05  WS-CUST-NAME       PIC X(30).`, // 4
      `${AREA_B}05  WS-CUST-STATUS     PIC X.`, // 5
      `${AREA_B}    88  WS-STATUS-ACTIVE   VALUE "A".`, // 6
    ];

    const { declarations } = buildDefinitionIndex(lines);

    assert.ok(declarations.has('WS-CUSTOMER-REC'));
    assert.ok(declarations.has('WS-CUST-NAME'));
    assert.ok(declarations.has('WS-CUST-STATUS'));
    assert.ok(declarations.has('WS-STATUS-ACTIVE'));
    assert.equal(declarations.get('WS-CUST-NAME')?.location.line, 4);
    assert.equal(declarations.get('WS-STATUS-ACTIVE')?.location.line, 6);
  });

  it('does not declare FILLER', () => {
    const lines = [
      `${AREA_A}DATA DIVISION.`,
      `${AREA_A}WORKING-STORAGE SECTION.`,
      `${AREA_A}01  WS-REC.`,
      `${AREA_B}05  FILLER              PIC X(5).`,
    ];

    const { declarations } = buildDefinitionIndex(lines);

    assert.equal(declarations.has('FILLER'), false);
  });

  it('finds a MOVE-target reference to a data item, excluding the declaration line itself', () => {
    const lines = [
      `${AREA_A}DATA DIVISION.`, // 1
      `${AREA_A}WORKING-STORAGE SECTION.`, // 2
      `${AREA_A}01  WS-EOF              PIC X VALUE "N".`, // 3
      `${AREA_A}PROCEDURE DIVISION.`, // 4
      `${AREA_A}MAIN-PARA.`, // 5
      `${AREA_B}MOVE "Y" TO WS-EOF.`, // 6
    ];

    const { declarations, references } = buildDefinitionIndex(lines);

    assert.equal(declarations.get('WS-EOF')?.location.line, 3);
    const refs = references.get('WS-EOF') ?? [];
    assert.equal(refs.length, 1);
    assert.equal(refs[0].line, 6);
  });

  it('declares paragraph and section names and finds PERFORM references to them', () => {
    const lines = [
      `${AREA_A}PROCEDURE DIVISION.`, // 1
      `${AREA_A}MAIN-SECTION SECTION.`, // 2
      `${AREA_A}MAIN-PARA.`, // 3
      `${AREA_B}PERFORM FETCH-LOOP.`, // 4
      `${AREA_A}FETCH-LOOP.`, // 5
      `${AREA_B}CONTINUE.`, // 6
    ];

    const { declarations, references } = buildDefinitionIndex(lines);

    assert.equal(declarations.get('MAIN-SECTION')?.location.line, 2);
    assert.equal(declarations.get('FETCH-LOOP')?.location.line, 5);
    const refs = references.get('FETCH-LOOP') ?? [];
    assert.equal(refs.length, 1);
    assert.equal(refs[0].line, 4);
  });

  it('does not mistake a quoted string literal for a reference', () => {
    const lines = [
      `${AREA_A}DATA DIVISION.`, // 1
      `${AREA_A}WORKING-STORAGE SECTION.`, // 2
      `${AREA_A}01  WS-EOF              PIC X VALUE "N".`, // 3
      `${AREA_A}PROCEDURE DIVISION.`, // 4
      `${AREA_A}MAIN-PARA.`, // 5
      `${AREA_B}DISPLAY "WS-EOF is a field name, not a reference".`, // 6
    ];

    const { references } = buildDefinitionIndex(lines);

    assert.equal(references.get('WS-EOF'), undefined);
  });

  it('resolves a duplicate name to its first declaration in the file', () => {
    const lines = [
      `${AREA_A}DATA DIVISION.`, // 1
      `${AREA_A}WORKING-STORAGE SECTION.`, // 2
      `${AREA_A}01  REC-A.`, // 3
      `${AREA_B}05  FLAG                PIC X.`, // 4
      `${AREA_A}01  REC-B.`, // 5
      `${AREA_B}05  FLAG                PIC X.`, // 6
    ];

    const { declarations, references } = buildDefinitionIndex(lines);

    assert.equal(declarations.get('FLAG')?.location.line, 4);
    const refs = references.get('FLAG') ?? [];
    assert.equal(refs.length, 1);
    assert.equal(refs[0].line, 6);
  });
});
