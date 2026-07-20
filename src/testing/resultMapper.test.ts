// src/testing/resultMapper.test.ts
import * as assert from 'assert';
import { mapResults, unattributedFailures } from './resultMapper';
import { JUnitTestSuite } from './junitParser';

describe('mapResults', () => {
  it('marks a case passed when junit reports no failure/error child', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 0, errors: 0,
      cases: [{ name: 'case-a', status: 'passed', messages: [] }],
    };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), { kind: 'passed' });
  });

  it('carries failure messages through, joined by newline, for a failed case', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 1, errors: 0,
      cases: [{ name: 'case-a', status: 'failed', messages: ['expected 10 got 8', 'second reason'] }],
    };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), {
      kind: 'failed',
      message: 'expected 10 got 8\nsecond reason',
    });
  });

  it('carries an error message through for a crashed case', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 0, errors: 1,
      cases: [{ name: 'case-a', status: 'errored', messages: ['binary exited with code 139'] }],
    };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), { kind: 'errored', message: 'binary exited with code 139' });
  });

  it('marks a case not present in the junit output as not-run', () => {
    const suite: JUnitTestSuite = { name: 's', tests: 0, failures: 0, errors: 0, cases: [] };
    const outcomes = mapResults(['case-a'], suite);
    assert.deepStrictEqual(outcomes.get('case-a'), {
      kind: 'not-run',
      message: 'did not run — an earlier case in this suite crashed',
    });
  });

  it('marks every expected case errored when no junit xml was produced at all', () => {
    const outcomes = mapResults(['case-a', 'case-b'], null, 'PARSE_WARNING: dropped statement');
    assert.deepStrictEqual(outcomes.get('case-a'), { kind: 'errored', message: 'PARSE_WARNING: dropped statement' });
    assert.deepStrictEqual(outcomes.get('case-b'), { kind: 'errored', message: 'PARSE_WARNING: dropped statement' });
  });

  it('falls back to a generic message when no junit xml and no process message given', () => {
    const outcomes = mapResults(['case-a'], null);
    assert.deepStrictEqual(outcomes.get('case-a'), {
      kind: 'errored',
      message: 'mockymock run did not produce results (refused or failed to compile)',
    });
  });
});

describe('unattributedFailures', () => {
  it('picks out an orphan-<id> testcase not among the expected case names', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 2, failures: 0, errors: 1,
      cases: [
        { name: 'case-a', status: 'passed', messages: [] },
        { name: 'orphan-7', status: 'errored', messages: ['FAIL for unknown case id 7'] },
      ],
    };
    assert.deepStrictEqual(unattributedFailures(['case-a'], suite), [
      { caseId: 'orphan-7', message: 'FAIL for unknown case id 7' },
    ]);
  });

  it('ignores extra passed testcases (nothing failed, nothing to surface)', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 0, errors: 0,
      cases: [{ name: 'case-b', status: 'passed', messages: [] }],
    };
    assert.deepStrictEqual(unattributedFailures(['case-a'], suite), []);
  });

  it('returns nothing when there is no junit suite at all', () => {
    assert.deepStrictEqual(unattributedFailures(['case-a'], null), []);
  });

  it('falls back to the bare status when an orphan testcase carries no message', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 1, failures: 0, errors: 1,
      cases: [{ name: 'orphan-3', status: 'errored', messages: [] }],
    };
    assert.deepStrictEqual(unattributedFailures([], suite), [
      { caseId: 'orphan-3', message: 'errored' },
    ]);
  });
});
