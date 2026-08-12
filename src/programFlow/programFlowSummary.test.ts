import * as assert from 'assert';
import { summarizeProgramFlow, formatSummaryLine } from './programFlowSummary';
import type { ProgramFlowReport } from '../paragraphTree/programFlowModel';

function report(overrides: Partial<ProgramFlowReport>): ProgramFlowReport {
  return {
    program_name: 'TEST',
    nodes: [],
    edges: [],
    entry_points: [],
    unreachable_nodes: [],
    cycle_details: [],
    ...overrides,
  };
}

describe('summarizeProgramFlow', () => {
  it('counts PERFORM_RECURSION cycles', () => {
    const r = report({
      cycle_details: [
        { nodes: ['A', 'B'], kind: 'PERFORM_RECURSION', length: 2, self_recursive: false, edge_types: ['PERFORM'] },
        { nodes: ['C'], kind: 'FALL_THROUGH', length: 1, self_recursive: false, edge_types: ['FALL_THROUGH'] },
      ],
    });
    assert.strictEqual(summarizeProgramFlow(r).recursionCount, 1);
  });

  it('counts GOTO and GOTO_DEPENDING edges separately', () => {
    const r = report({
      edges: [
        { source: 'A', target: 'B', type: 'GOTO', location: { line: 1, column: 1 } },
        { source: 'B', target: 'C', type: 'GOTO_DEPENDING', location: { line: 2, column: 1 } },
        { source: 'B', target: 'D', type: 'GOTO_DEPENDING', location: { line: 2, column: 1 } },
      ],
    });
    const summary = summarizeProgramFlow(r);
    assert.strictEqual(summary.gotoCount, 1);
    assert.strictEqual(summary.gotoDependingCount, 2);
  });

  it('counts distinct thru_target groups, not edges', () => {
    const r = report({
      edges: [
        { source: 'A', target: 'B', type: 'PERFORM', location: { line: 1, column: 1 }, thru_target: 'D' },
        { source: 'A', target: 'D', type: 'PERFORM_THRU', location: { line: 1, column: 1 }, thru_target: 'D' },
        { source: 'X', target: 'Y', type: 'PERFORM', location: { line: 5, column: 1 }, thru_target: 'Z' },
      ],
    });
    assert.strictEqual(summarizeProgramFlow(r).thruGroupCount, 2);
  });

  it('all-zero counts', () => {
    const summary = summarizeProgramFlow(report({}));
    assert.deepStrictEqual(summary, {
      recursionCount: 0, gotoCount: 0, gotoDependingCount: 0, thruGroupCount: 0,
    });
  });
});

describe('formatSummaryLine', () => {
  it('joins non-zero clauses with middle dots', () => {
    const line = formatSummaryLine({ recursionCount: 1, gotoCount: 1, gotoDependingCount: 1, thruGroupCount: 2 });
    assert.strictEqual(line, '1 recursion · 1 GO TO · 1 GO TO...DEPENDING ON · 2 THRU groups collapsed');
  });

  it('pluralizes counts above 1', () => {
    const line = formatSummaryLine({ recursionCount: 2, gotoCount: 0, gotoDependingCount: 0, thruGroupCount: 0 });
    assert.strictEqual(line, '2 recursions');
  });

  it('reads a fixed message when every count is zero', () => {
    const line = formatSummaryLine({ recursionCount: 0, gotoCount: 0, gotoDependingCount: 0, thruGroupCount: 0 });
    assert.strictEqual(line, 'no recursion, GO TO, or THRU activity');
  });
});
