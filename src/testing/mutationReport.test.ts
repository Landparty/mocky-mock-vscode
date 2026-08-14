import * as assert from 'assert';
import { parseMutationJson, survivorsOf } from './mutationReport';

const SAMPLE = JSON.stringify({
  program: 'PROG.cbl',
  cut: 'PROG.cut',
  score: 0.75,
  totals: { generated: 5, killed: 3, timeouts: 0, survived: 1, stillborn: 1 },
  mutants: [
    {
      line: 12,
      operator: 'rel-swap',
      description: "'>' -> '>='",
      original: '           IF WS-BALANCE > 0',
      mutated: '           IF WS-BALANCE >= 0',
      status: 'killed',
      detail: 'EXPECT WS-STATUS failed',
    },
    {
      line: 42,
      operator: 'boundary-literal',
      description: '> 65 -> > 66',
      original: '           IF WS-AGE > 65',
      mutated: '           IF WS-AGE > 66',
      status: 'survived',
      detail: '',
    },
  ],
});

describe('parseMutationJson', () => {
  it('parses a full report', () => {
    const report = parseMutationJson(SAMPLE);
    assert.ok(report);
    assert.strictEqual(report!.program, 'PROG.cbl');
    assert.strictEqual(report!.cut, 'PROG.cut');
    assert.strictEqual(report!.score, 0.75);
    assert.strictEqual(report!.generated, 5);
    assert.strictEqual(report!.killed, 3);
    assert.strictEqual(report!.survived, 1);
    assert.strictEqual(report!.stillborn, 1);
    assert.strictEqual(report!.mutants.length, 2);
    assert.deepStrictEqual(report!.mutants[1], {
      line: 42,
      operator: 'boundary-literal',
      description: '> 65 -> > 66',
      original: '           IF WS-AGE > 65',
      mutated: '           IF WS-AGE > 66',
      status: 'survived',
      detail: '',
    });
  });

  it('returns null for malformed or alien documents', () => {
    assert.strictEqual(parseMutationJson('nope'), null);
    assert.strictEqual(parseMutationJson('42'), null);
    assert.strictEqual(parseMutationJson('{"score": 1}'), null);
  });

  it('accepts a null score (no scorable mutants)', () => {
    const report = parseMutationJson(JSON.stringify({ score: null, totals: {}, mutants: [] }));
    assert.ok(report);
    assert.strictEqual(report!.score, null);
  });

  it('rejects the whole report when any mutant entry has a missing line', () => {
    // A malformed row must not silently vanish: if it happened to be the
    // one true survivor, dropping it alone would turn a real failure into
    // an artificial pass.
    const report = parseMutationJson(
      JSON.stringify({
        mutants: [
          { line: 7, operator: 'stmt-delete', description: 'delete MOVE statement', original: 'a', mutated: 'b', status: 'timeout' },
          { operator: 'rel-swap', status: 'survived' },
        ],
      })
    );
    assert.strictEqual(report, null);
  });

  it('rejects the whole report when any mutant entry has an unknown status', () => {
    assert.strictEqual(
      parseMutationJson(JSON.stringify({ mutants: [{ line: 3, status: 'exploded' }] })),
      null
    );
  });

  it('derives totals from the mutant list when the totals block is missing', () => {
    const report = parseMutationJson(
      JSON.stringify({
        mutants: [
          { line: 1, operator: 'a', description: '', original: '', mutated: '', status: 'killed', detail: '' },
          { line: 2, operator: 'b', description: '', original: '', mutated: '', status: 'survived', detail: '' },
        ],
      })
    );
    assert.ok(report);
    assert.strictEqual(report!.generated, 2);
    assert.strictEqual(report!.killed, 1);
    assert.strictEqual(report!.survived, 1);
    assert.strictEqual(report!.timeouts, 0);
    assert.strictEqual(report!.stillborn, 0);
  });
});

describe('survivorsOf', () => {
  it('returns only survived mutants, in report order', () => {
    const report = parseMutationJson(SAMPLE)!;
    const survivors = survivorsOf(report);
    assert.strictEqual(survivors.length, 1);
    assert.strictEqual(survivors[0].line, 42);
  });
});
