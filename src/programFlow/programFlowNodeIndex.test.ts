import * as assert from 'assert';
import { sanitizeNodeId, buildLineIndex } from './programFlowNodeIndex';
import type { ProgramFlowReport } from '../paragraphTree/programFlowModel';

describe('sanitizeNodeId', () => {
  it('replaces hyphens with underscores', () => {
    assert.strictEqual(sanitizeNodeId('MAIN-LOGIC'), 'MAIN_LOGIC');
  });

  it('prefixes a leading digit with N_', () => {
    assert.strictEqual(sanitizeNodeId('1000-INIT'), 'N_1000_INIT');
  });

  it('replaces any non-alphanumeric-non-underscore character', () => {
    assert.strictEqual(sanitizeNodeId('READ.RECORD'), 'READ_RECORD');
  });

  it('returns N_UNKNOWN for an empty name', () => {
    assert.strictEqual(sanitizeNodeId(''), 'N_UNKNOWN');
  });
});

describe('buildLineIndex', () => {
  it('maps every node\'s sanitized id to its source line', () => {
    const report: ProgramFlowReport = {
      program_name: 'TEST',
      nodes: [
        { name: 'MAIN-LOGIC', type: 'PARAGRAPH', location: { line: 10, column: 8 },
          calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
        { name: '1000-INIT', type: 'PARAGRAPH', location: { line: 20, column: 8 },
          calls: { perform_count: 0, goto_count: 0, call_count: 0 }, statement_types: {} },
      ],
      edges: [],
      entry_points: ['MAIN-LOGIC'],
      unreachable_nodes: [],
    };
    const index = buildLineIndex(report);
    assert.strictEqual(index['MAIN_LOGIC'], 10);
    assert.strictEqual(index['N_1000_INIT'], 20);
  });
});
