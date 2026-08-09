import assert from 'node:assert/strict';
import { buildParagraphTree, ParagraphTreeError, ProgramFlowReport } from './programFlowModel';

// Real report shape pulled directly from `cobol-parser program-flow
// examples/invupdt/INVUPDT.cbl --compact` (trimmed to the fields this
// model reads).
const INVUPDT_REPORT: ProgramFlowReport = {
  program_name: 'INVUPDT',
  entry_points: ['MAIN-PROCESS'],
  unreachable_nodes: [],
  nodes: [
    { name: 'MAIN-PROCESS', type: 'PARAGRAPH', location: { line: 35, column: 1 }, is_entry_point: true, calls: { perform_count: 4, goto_count: 0, call_count: 0 }, statement_types: { OPEN: 1, PERFORM: 4, CLOSE: 1 } },
    { name: 'PROCESS-LOOP', type: 'PARAGRAPH', location: { line: 43, column: 1 }, calls: { perform_count: 1, goto_count: 0, call_count: 0 }, statement_types: { READ: 1, MOVE: 1, IF: 1, PERFORM: 1 } },
    { name: 'TALLY-RECORD', type: 'PARAGRAPH', location: { line: 51, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: { ADD: 2, WRITE: 1 } },
    { name: 'UPDATE-DB', type: 'PARAGRAPH', location: { line: 56, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: { 'EXEC-SQL': 1, IF: 1, MOVE: 2 } },
    { name: 'NOTIFY-QUEUE', type: 'PARAGRAPH', location: { line: 66, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 1 }, statement_types: { CALL: 1 } },
    { name: 'ASK-CONFIRM', type: 'PARAGRAPH', location: { line: 69, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: { ACCEPT: 1 } },
  ],
  edges: [
    { source: 'MAIN-PROCESS', target: 'PROCESS-LOOP', type: 'PERFORM', location: { line: 37, column: 5 }, is_loop: true, perform_type: 'UNTIL' },
    { source: 'MAIN-PROCESS', target: 'UPDATE-DB', type: 'PERFORM', location: { line: 38, column: 5 }, perform_type: 'SIMPLE' },
    { source: 'MAIN-PROCESS', target: 'NOTIFY-QUEUE', type: 'PERFORM', location: { line: 39, column: 5 }, perform_type: 'SIMPLE' },
    { source: 'MAIN-PROCESS', target: 'ASK-CONFIRM', type: 'PERFORM', location: { line: 40, column: 5 }, perform_type: 'SIMPLE' },
    { source: 'PROCESS-LOOP', target: 'TALLY-RECORD', type: 'PERFORM', location: { line: 48, column: 9 }, perform_type: 'SIMPLE' },
    // Non-PERFORM edges present in the real report -- must be ignored for hierarchy.
    { source: 'PROCESS-LOOP', target: 'PROCESS-LOOP__IF_1', type: 'IF_BRANCH', location: { line: 47, column: 5 } },
    { source: 'NOTIFY-QUEUE', target: 'MQPUT', type: 'CALL', location: { line: 67, column: 5 } },
  ],
};
const INVUPDT_SOURCE_LINE_37 = '           PERFORM PROCESS-LOOP UNTIL WS-EOF = "Y".';

describe('buildParagraphTree', () => {
  it('builds paragraph hierarchy from PERFORM edges only, ignoring IF/CALL edges', () => {
    const sourceLines = Array(37).fill('');
    sourceLines[36] = INVUPDT_SOURCE_LINE_37; // 0-indexed: line 37
    const result = buildParagraphTree(INVUPDT_REPORT, sourceLines);

    assert.equal(result.programName, 'INVUPDT');
    assert.equal(result.roots.length, 1);
    const main = result.roots[0];
    assert.equal(main.kind, 'paragraph');
    if (main.kind !== 'paragraph') return;
    assert.equal(main.name, 'MAIN-PROCESS');
    assert.equal(main.line, 35);
    assert.deepEqual(
      main.children.map((c) => (c.kind === 'paragraph' ? c.name : `THRU:${c.from}->${c.to}`)),
      ['PROCESS-LOOP', 'UPDATE-DB', 'NOTIFY-QUEUE', 'ASK-CONFIRM']
    );
  });

  it('extracts the real UNTIL clause text from source, not the JSON placeholder', () => {
    const sourceLines = Array(37).fill('');
    sourceLines[36] = INVUPDT_SOURCE_LINE_37;
    const result = buildParagraphTree(INVUPDT_REPORT, sourceLines);
    const main = result.roots[0];
    assert.equal(main.kind, 'paragraph');
    if (main.kind !== 'paragraph') return;
    const loop = main.children[0];
    assert.equal(loop.kind, 'paragraph');
    if (loop.kind !== 'paragraph') return;
    assert.equal(loop.loopAnnotation, 'UNTIL WS-EOF = "Y"');
  });

  it('omits loopAnnotation when sourceLines is undefined (no live document)', () => {
    const result = buildParagraphTree(INVUPDT_REPORT, undefined);
    const main = result.roots[0];
    assert.equal(main.kind, 'paragraph');
    if (main.kind !== 'paragraph') return;
    const loop = main.children[0];
    assert.equal(loop.kind, 'paragraph');
    if (loop.kind !== 'paragraph') return;
    assert.equal(loop.loopAnnotation, undefined);
  });

  it('nests PROCESS-LOOP -> TALLY-RECORD (two-level hierarchy)', () => {
    const result = buildParagraphTree(INVUPDT_REPORT, undefined);
    const main = result.roots[0];
    assert.equal(main.kind, 'paragraph');
    if (main.kind !== 'paragraph') return;
    const loop = main.children[0];
    assert.equal(loop.kind, 'paragraph');
    if (loop.kind !== 'paragraph') return;
    assert.deepEqual(loop.children.map((c) => (c.kind === 'paragraph' ? c.name : c.kind)), ['TALLY-RECORD']);
  });

  it('derives F/S/C badges from statement_types and calls.call_count', () => {
    const result = buildParagraphTree(INVUPDT_REPORT, undefined);
    const findByName = (items: typeof result.roots, name: string): any => {
      for (const item of items) {
        if (item.kind === 'paragraph' && item.name === name) return item;
        const found = findByName(item.children, name);
        if (found) return found;
      }
      return undefined;
    };
    assert.deepEqual(findByName(result.roots, 'MAIN-PROCESS').badges, { file: true, sql: false, call: false });
    assert.deepEqual(findByName(result.roots, 'UPDATE-DB').badges, { file: false, sql: true, call: false });
    assert.deepEqual(findByName(result.roots, 'NOTIFY-QUEUE').badges, { file: false, sql: false, call: true });
    assert.deepEqual(findByName(result.roots, 'TALLY-RECORD').badges, { file: true, sql: false, call: false });
  });

  it('recognizes the underscore-suffixed file statement types (REWRITE_STATEMENT etc), not a hyphenated guess', () => {
    const report: ProgramFlowReport = {
      program_name: 'P',
      entry_points: ['A'],
      unreachable_nodes: [],
      nodes: [
        { name: 'A', type: 'PARAGRAPH', location: { line: 1, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: { REWRITE_STATEMENT: 1 } },
      ],
      edges: [],
    };
    const result = buildParagraphTree(report, undefined);
    const a = result.roots[0];
    assert.equal(a.kind, 'paragraph');
    if (a.kind !== 'paragraph') return;
    assert.equal(a.badges.file, true);
  });

  it('renders a PERFORM ... THRU range as a connector node with members nested inside', () => {
    const report: ProgramFlowReport = {
      program_name: 'RATERTE',
      entry_points: ['MAIN'],
      unreachable_nodes: [],
      nodes: [
        { name: 'MAIN', type: 'PARAGRAPH', location: { line: 10, column: 1 }, calls: { perform_count: 1, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: 'STEP-A', type: 'PARAGRAPH', location: { line: 20, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: 'STEP-B', type: 'PARAGRAPH', location: { line: 25, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: 'STEP-C', type: 'PARAGRAPH', location: { line: 30, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
      ],
      edges: [
        { source: 'MAIN', target: 'STEP-A', type: 'PERFORM', location: { line: 11, column: 5 }, perform_type: 'SIMPLE', thru_target: 'STEP-C', range_members: ['STEP-A', 'STEP-B', 'STEP-C'] },
        { source: 'MAIN', target: 'STEP-C', type: 'PERFORM_THRU', location: { line: 11, column: 5 }, range_members: ['STEP-A', 'STEP-B', 'STEP-C'] },
      ],
    };
    const result = buildParagraphTree(report, undefined);
    const main = result.roots[0];
    assert.equal(main.kind, 'paragraph');
    if (main.kind !== 'paragraph') return;
    assert.equal(main.children.length, 1);
    const range = main.children[0];
    assert.equal(range.kind, 'thruRange');
    if (range.kind !== 'thruRange') return;
    assert.equal(range.from, 'STEP-A');
    assert.equal(range.to, 'STEP-C');
    assert.deepEqual(range.children.map((c) => (c.kind === 'paragraph' ? c.name : c.kind)), ['STEP-A', 'STEP-B', 'STEP-C']);
  });

  it('places a multi-caller paragraph once, with a callCount badge, at its first-reached position', () => {
    const report: ProgramFlowReport = {
      program_name: 'P',
      entry_points: ['MAIN'],
      unreachable_nodes: [],
      nodes: [
        { name: 'MAIN', type: 'PARAGRAPH', location: { line: 1, column: 1 }, calls: { perform_count: 3, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: 'SHARED', type: 'PARAGRAPH', location: { line: 10, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: 'OTHER', type: 'PARAGRAPH', location: { line: 20, column: 1 }, calls: { perform_count: 1, goto_count: 0, call_count: 0 }, statement_types: {} },
      ],
      edges: [
        { source: 'MAIN', target: 'SHARED', type: 'PERFORM', location: { line: 2, column: 5 }, perform_type: 'SIMPLE' },
        { source: 'MAIN', target: 'OTHER', type: 'PERFORM', location: { line: 3, column: 5 }, perform_type: 'SIMPLE' },
        { source: 'OTHER', target: 'SHARED', type: 'PERFORM', location: { line: 21, column: 5 }, perform_type: 'SIMPLE' },
      ],
    };
    const result = buildParagraphTree(report, undefined);
    const main = result.roots[0];
    assert.equal(main.kind, 'paragraph');
    if (main.kind !== 'paragraph') return;
    // First-reached: MAIN's own direct PERFORM to SHARED (line 2), before OTHER's (line 21).
    const shared = main.children.find((c) => c.kind === 'paragraph' && c.name === 'SHARED');
    assert.ok(shared && shared.kind === 'paragraph');
    if (!shared || shared.kind !== 'paragraph') return;
    assert.equal(shared.callCount, 2);
    // Not duplicated under OTHER.
    const other = main.children.find((c) => c.kind === 'paragraph' && c.name === 'OTHER');
    assert.ok(other && other.kind === 'paragraph');
    if (!other || other.kind !== 'paragraph') return;
    assert.equal(other.children.length, 0);
  });

  it('renders a PERFORM cycle back-edge as a recursive leaf marker, not infinite recursion', () => {
    const report: ProgramFlowReport = {
      program_name: 'P',
      entry_points: ['A'],
      unreachable_nodes: [],
      nodes: [
        { name: 'A', type: 'PARAGRAPH', location: { line: 1, column: 1 }, calls: { perform_count: 1, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: 'B', type: 'PARAGRAPH', location: { line: 10, column: 1 }, calls: { perform_count: 1, goto_count: 0, call_count: 0 }, statement_types: {} },
      ],
      edges: [
        { source: 'A', target: 'B', type: 'PERFORM', location: { line: 2, column: 5 }, perform_type: 'SIMPLE' },
        { source: 'B', target: 'A', type: 'PERFORM', location: { line: 11, column: 5 }, perform_type: 'SIMPLE' },
      ],
    };
    const result = buildParagraphTree(report, undefined);
    const a = result.roots[0];
    assert.equal(a.kind, 'paragraph');
    if (a.kind !== 'paragraph') return;
    const b = a.children[0];
    assert.equal(b.kind, 'paragraph');
    if (b.kind !== 'paragraph') return;
    assert.equal(b.name, 'B');
    const backEdge = b.children[0];
    assert.equal(backEdge.kind, 'paragraph');
    if (backEdge.kind !== 'paragraph') return;
    assert.equal(backEdge.name, 'A');
    assert.equal(backEdge.isRecursive, true);
    assert.equal(backEdge.children.length, 0);
  });

  it('buckets every never-PERFORM-reached paragraph as unreachable, independent of the JSON unreachable_nodes field', () => {
    const report: ProgramFlowReport = {
      program_name: 'P',
      entry_points: ['MAIN'],
      // Deliberately empty: program-flow's own unreachable_nodes list is
      // GOTO/FALL_THROUGH-aware and would NOT list ORPHAN-PARA (it's
      // "reachable" by that broader definition even with no PERFORM edge
      // pointing at it) -- this bucket must not depend on that field.
      unreachable_nodes: [],
      nodes: [
        { name: 'MAIN', type: 'PARAGRAPH', location: { line: 1, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: 'ORPHAN-PARA', type: 'PARAGRAPH', location: { line: 20, column: 1 }, calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
      ],
      edges: [],
    };
    const result = buildParagraphTree(report, undefined);
    assert.equal(result.unreachable.length, 1);
    assert.equal(result.unreachable[0].kind, 'paragraph');
    if (result.unreachable[0].kind !== 'paragraph') return;
    assert.equal(result.unreachable[0].name, 'ORPHAN-PARA');
    assert.equal(result.unreachable[0].children.length, 0);
  });

  it('does not fail-close on an ENTRY-statement pseudo-entry-point absent from nodes[]', () => {
    // Real shape reproduced against cobol-parser directly from a file with
    // `ENTRY 'DLITCBL' USING LOAN-PCB-LNK.` (a secondary linkage-time entry
    // point, common in IMS DL/I programs): entry_points was
    // ["0000-MAIN-PROCESS", "DLITCBL"], but only 0000-MAIN-PROCESS ever
    // appears in nodes[] -- ENTRY statements aren't paragraph boundaries.
    const report: ProgramFlowReport = {
      program_name: 'ENTRYTEST',
      entry_points: ['0000-MAIN-PROCESS', 'DLITCBL'],
      unreachable_nodes: [],
      nodes: [
        { name: '0000-MAIN-PROCESS', type: 'PARAGRAPH', location: { line: 11, column: 1 }, calls: { perform_count: 1, goto_count: 0, call_count: 0 }, statement_types: {} },
      ],
      edges: [],
    };
    const result = buildParagraphTree(report, undefined);
    assert.equal(result.roots.length, 1);
    assert.equal(result.roots[0].kind, 'paragraph');
    if (result.roots[0].kind !== 'paragraph') return;
    assert.equal(result.roots[0].name, '0000-MAIN-PROCESS');
  });

  it('throws ParagraphTreeError when a PERFORM edge targets an unknown paragraph', () => {
    const report: ProgramFlowReport = {
      program_name: 'P',
      entry_points: ['A'],
      unreachable_nodes: [],
      nodes: [{ name: 'A', type: 'PARAGRAPH', location: { line: 1, column: 1 }, calls: { perform_count: 1, goto_count: 0, call_count: 0 }, statement_types: {} }],
      edges: [{ source: 'A', target: 'GHOST', type: 'PERFORM', location: { line: 2, column: 5 }, perform_type: 'SIMPLE' }],
    };
    assert.throws(() => buildParagraphTree(report, undefined), ParagraphTreeError);
  });

  it('does not fail-close on a dangling CALL edge (external programs are expected absent from nodes[])', () => {
    // NOTIFY-QUEUE -> MQPUT is a CALL edge to an external program, not a paragraph.
    assert.doesNotThrow(() => buildParagraphTree(INVUPDT_REPORT, undefined));
  });
});
