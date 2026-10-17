// src/testing/resultMapper.test.ts
import * as assert from 'assert';
import { mapResults, mapResultsForCases, unattributedFailures, unexplainedExitProblem } from './resultMapper';
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
      message: 'did not run — not present in the run report (an earlier crash, or a name mismatch between discovery and the CLI)',
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

describe('mapResultsForCases', () => {
  it('keeps a failing same-named case red when a later one passes', () => {
    const suite: JUnitTestSuite = {
      name: 's', tests: 2, failures: 1, errors: 0,
      cases: [
        { name: 'dup', status: 'failed', messages: ['expected 1 got 2'] },
        { name: 'dup', status: 'passed', messages: [] },
      ],
    };
    const outcomes = mapResultsForCases([{ name: 'dup', line: 6 }, { name: 'dup', line: 44 }], suite);
    assert.deepStrictEqual(outcomes, [
      { kind: 'failed', message: 'expected 1 got 2' },
      { kind: 'passed' },
    ]);
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

describe('unexplainedExitProblem', () => {
  it('flags a nonzero exit when every case passed', () => {
    assert.strictEqual(
      unexplainedExitProblem(1, false, 'binary timed out (exit 124)\n', 'ok\n'),
      'mockymock run exited 1 although every case passed:\nbinary timed out (exit 124)'
    );
  });

  it('falls back to the tail of stdout when stderr is empty', () => {
    const stdout = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const problem = unexplainedExitProblem(1, false, '', stdout)!;
    assert.match(problem, /line 29$/);
    assert.doesNotMatch(problem, /line 9\n/);
  });

  it('says nothing when the exit code is 0 or a case already failed', () => {
    assert.strictEqual(unexplainedExitProblem(0, false, '', ''), undefined);
    assert.strictEqual(unexplainedExitProblem(1, true, 'x', ''), undefined);
  });
});
