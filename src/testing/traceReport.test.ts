import * as assert from 'assert';
import { parseTraceJson, formatTraceOutput, TraceReport } from './traceReport';

const SAMPLE = JSON.stringify({
  version: 1,
  cutFile: 't.cut',
  programFile: 'P.cbl',
  case: { name: 'posts a credit', line: 12 },
  path: [
    { line: 45, statement: 'MOVE' },
    { line: 88, paragraph: 'CALC-INTEREST' },
  ],
  mocks: [
    { order: 1, label: "CALL 'CUSTLOOK'" },
    { order: 2, label: 'READ ACCT-FILE' },
  ],
  truncated: false,
});

describe('parseTraceJson', () => {
  it('parses the full contract shape', () => {
    const report = parseTraceJson(SAMPLE);
    assert.ok(report);
    assert.strictEqual(report!.caseName, 'posts a credit');
    assert.strictEqual(report!.caseLine, 12);
    assert.deepStrictEqual(report!.path[0], { line: 45, statement: 'MOVE', paragraph: null });
    assert.deepStrictEqual(report!.path[1], { line: 88, statement: null, paragraph: 'CALC-INTEREST' });
    assert.deepStrictEqual(report!.mocks, [
      { order: 1, label: "CALL 'CUSTLOOK'" },
      { order: 2, label: 'READ ACCT-FILE' },
    ]);
    assert.strictEqual(report!.truncated, false);
  });

  it('returns null for malformed or alien documents', () => {
    assert.strictEqual(parseTraceJson('not json'), null);
    assert.strictEqual(parseTraceJson('{"version":1}'), null);
  });

  it('is tolerant of a missing case object', () => {
    const report = parseTraceJson(JSON.stringify({ path: [], mocks: [] }));
    assert.ok(report);
    assert.strictEqual(report!.caseName, '');
    assert.strictEqual(report!.caseLine, null);
  });

  it('skips path/mock entries missing their required fields', () => {
    const report = parseTraceJson(
      JSON.stringify({
        path: [{ line: 1, statement: 'MOVE' }, { statement: 'no line' }],
        mocks: [{ order: 1, label: 'ok' }, { label: 'no order' }],
      })
    );
    assert.ok(report);
    assert.strictEqual(report!.path.length, 1);
    assert.strictEqual(report!.mocks.length, 1);
  });
});

describe('formatTraceOutput', () => {
  const report: TraceReport = {
    version: 1,
    cutFile: 't.cut',
    programFile: 'P.cbl',
    caseName: 'posts a credit',
    caseLine: 12,
    path: [{ line: 45, statement: 'MOVE', paragraph: null }],
    mocks: [{ order: 1, label: "CALL 'CUSTLOOK'" }],
    truncated: false,
  };

  it('lists mocks in order and the statement count', () => {
    const text = formatTraceOutput(report);
    assert.match(text, /posts a credit/);
    assert.match(text, /1\. CALL 'CUSTLOOK'/);
    assert.match(text, /statements executed: 1/);
  });

  it('says so when no mocks fired', () => {
    const text = formatTraceOutput({ ...report, mocks: [] });
    assert.match(text, /mocks fired: none/);
  });

  it('flags truncation', () => {
    const text = formatTraceOutput({ ...report, truncated: true });
    assert.match(text, /truncated/);
  });
});
