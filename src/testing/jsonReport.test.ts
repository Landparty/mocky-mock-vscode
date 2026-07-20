import * as assert from 'assert';
import { parseJsonReport, mapJsonReport } from './jsonReport';

const SAMPLE_REPORT = JSON.stringify({
  version: 1,
  suite: { name: 'ORDRPROC discount calculation', line: 1 },
  cutFile: 'PROG.cut',
  programFile: 'PROG.cbl',
  cases: [
    { name: 'happy path', line: 3, tags: ['fast'], status: 'passed', failures: [] },
    {
      name: 'failing case',
      line: 11,
      tags: [],
      status: 'failed',
      failures: [
        {
          message: 'expected WS-NET-AMOUNT = 50.00, got 090.00',
          kind: 'expect',
          line: 15,
          expected: '50.00',
          actual: '090.00',
        },
        {
          message: 'VERIFY CALL DISCRATE WAS CALLED 2 TIMES, got 1',
          kind: 'verify',
          line: 17,
          expected: '2 TIMES',
          actual: '1',
        },
      ],
    },
    {
      name: 'crashed case',
      line: 19,
      tags: [],
      status: 'crashed',
      failures: [],
      crashDetail: 'binary exited with code 139',
    },
    {
      name: 'never ran',
      line: 25,
      tags: [],
      status: 'not_run',
      failures: [],
      crashDetail: 'binary exited with code 139',
    },
  ],
  orphanFailures: [{ caseId: '007', message: 'mystery' }],
  summary: { testsRun: 3, casesFailed: 1, casesCrashed: 1, casesNotRun: 1 },
});

describe('parseJsonReport', () => {
  it('parses a full report', () => {
    const report = parseJsonReport(SAMPLE_REPORT);
    assert.ok(report);
    assert.strictEqual(report!.version, 1);
    assert.strictEqual(report!.suite.name, 'ORDRPROC discount calculation');
    assert.strictEqual(report!.cases.length, 4);
    assert.deepStrictEqual(report!.cases[0].tags, ['fast']);
    assert.strictEqual(report!.cases[1].failures[0].expected, '50.00');
    assert.deepStrictEqual(report!.orphanFailures, [{ caseId: '007', message: 'mystery' }]);
  });

  it('returns null for malformed JSON', () => {
    assert.strictEqual(parseJsonReport('not json'), null);
  });

  it('returns null for a structurally alien document', () => {
    assert.strictEqual(parseJsonReport('{"something":"else"}'), null);
  });

  it('tolerates missing optional fields per case', () => {
    const report = parseJsonReport(JSON.stringify({ cases: [{ name: 'x', status: 'passed' }] }));
    assert.ok(report);
    assert.strictEqual(report!.cases[0].line, null);
    assert.deepStrictEqual(report!.cases[0].tags, []);
  });
});

describe('mapJsonReport', () => {
  const report = parseJsonReport(SAMPLE_REPORT)!;

  it('maps passed/failed with structured details', () => {
    const outcomes = mapJsonReport(['happy path', 'failing case'], report);
    assert.deepStrictEqual(outcomes.get('happy path'), { kind: 'passed' });
    const failing = outcomes.get('failing case');
    assert.strictEqual(failing?.kind, 'failed');
    if (failing?.kind === 'failed') {
      assert.strictEqual(failing.details?.length, 2);
      assert.deepStrictEqual(failing.details?.[0], {
        message: 'expected WS-NET-AMOUNT = 50.00, got 090.00',
        line: 15,
        expected: '50.00',
        actual: '090.00',
      });
    }
  });

  it('maps a crashed case to errored with the crash detail', () => {
    const outcomes = mapJsonReport(['crashed case'], report);
    const outcome = outcomes.get('crashed case');
    assert.strictEqual(outcome?.kind, 'errored');
    if (outcome?.kind === 'errored') {
      assert.match(outcome.message, /binary exited with code 139/);
    }
  });

  it('maps an explicit not_run entry (and a missing case) to not-run', () => {
    const outcomes = mapJsonReport(['never ran', 'totally absent'], report);
    const explicit = outcomes.get('never ran');
    assert.strictEqual(explicit?.kind, 'not-run');
    if (explicit?.kind === 'not-run') {
      assert.match(explicit.message, /earlier case in this suite crashed/);
      assert.match(explicit.message, /code 139/);
    }
    assert.strictEqual(outcomes.get('totally absent')?.kind, 'not-run');
  });

  it('marks every expected case errored when no report was produced', () => {
    const outcomes = mapJsonReport(['a', 'b'], null, 'refused: PARSE_WARNING');
    assert.deepStrictEqual(outcomes.get('a'), { kind: 'errored', message: 'refused: PARSE_WARNING' });
    assert.deepStrictEqual(outcomes.get('b'), { kind: 'errored', message: 'refused: PARSE_WARNING' });
  });
});
