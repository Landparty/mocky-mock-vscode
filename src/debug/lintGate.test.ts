import * as assert from 'assert';
import { evaluateCaseSelection, evaluateLintResult } from './lintGate';

describe('evaluateLintResult', () => {
  it('does not block on a clean lint (exit 0)', () => {
    assert.deepStrictEqual(evaluateLintResult({ code: 0, stdout: 'no problems found.\n', stderr: '' }), {
      blocked: false,
    });
  });

  it('does not block when the CLI could not be spawned (exit -1)', () => {
    assert.deepStrictEqual(evaluateLintResult({ code: -1, stdout: '', stderr: 'command not found' }), {
      blocked: false,
    });
  });

  it('does not block on a nonzero exit with nothing parseable (CLI predating lint)', () => {
    assert.deepStrictEqual(evaluateLintResult({ code: 2, stdout: 'usage: mockymock [-h] ...\n', stderr: '' }), {
      blocked: false,
    });
  });

  it('blocks and includes each problem, its code, and its line when lint finds real problems', () => {
    const result = evaluateLintResult({
      code: 1,
      stdout: 'mockymock lint: refused (UNRESOLVED_COPYBOOK): copybook FOO not found on line 12\n',
      stderr: '',
    });
    assert.strictEqual(result.blocked, true);
    const message = (result as { blocked: true; message: string }).message;
    assert.match(message, /UNRESOLVED_COPYBOOK/);
    assert.match(message, /line 12/);
    assert.match(message, /copybook FOO not found/);
  });

  it('does not put a .cbl line at the front as if it were a .cut location', () => {
    const result = evaluateLintResult({
      code: 1,
      stdout:
        'mockymock lint: refused (UNMOCKED_CALL): dynamic CALL boundary at line 15 is unmocked\n' +
        'mockymock lint: refused (UNKNOWN_DATA_NAME): .cut line 6: EXPECT WS-NOPE is not a data item of RATERTE\n',
      stderr: '',
    });
    const message = (result as { blocked: true; message: string }).message;
    assert.match(message, /^\[UNMOCKED_CALL\] dynamic CALL boundary at line 15 is unmocked$/m);
    assert.match(message, /^\[UNKNOWN_DATA_NAME\] \.cut line 6: EXPECT WS-NOPE/m);
  });

  it('prefixes the .cut line of a .cut parse error', () => {
    const result = evaluateLintResult({
      code: 1,
      stdout: "mockymock lint: invalid .cut file x.cut: line 7: unrecognized statement: 'JUNK'\n",
      stderr: '',
    });
    const message = (result as { blocked: true; message: string }).message;
    assert.match(message, /\[CUT_PARSE_ERROR\] line 7: unrecognized statement/);
  });

  it('blocks with a bare message when the problem has no code and no line (file-level, generic)', () => {
    const result = evaluateLintResult({
      code: 1,
      stdout: 'mockymock lint: something else is wrong\n',
      stderr: '',
    });
    assert.strictEqual(result.blocked, true);
    const message = (result as { blocked: true; message: string }).message;
    assert.match(message, /something else is wrong/);
    assert.doesNotMatch(message, /\[.*\]/);
    assert.doesNotMatch(message, /line \d+:/);
  });
});

describe('evaluateCaseSelection', () => {
  const collect = JSON.stringify({
    suite: { name: 'CUSTPROG tests', line: 1 },
    cases: [
      { name: 'happy path', line: 2, tags: [] },
      { name: 'bad input', line: 9, tags: [] },
    ],
  });

  it('does not block when the case exists', () => {
    assert.deepStrictEqual(evaluateCaseSelection({ code: 0, stdout: collect, stderr: '' }, 'bad input', '/w/CUSTPROG.cut'), {
      blocked: false,
    });
  });

  it("blocks on the launch.json placeholder case, naming the suite's cases", () => {
    const result = evaluateCaseSelection({ code: 0, stdout: collect, stderr: '' }, 'the testcase name', '/w/CUSTPROG.cut');
    assert.strictEqual(result.blocked, true);
    const message = (result as { blocked: true; message: string }).message;
    assert.match(message, /CUSTPROG\.cut has no TESTCASE named "the testcase name"/);
    assert.match(message, /available: "happy path", "bad input"/);
  });

  it('does not block when collect failed or is not a collect document', () => {
    assert.deepStrictEqual(evaluateCaseSelection({ code: 2, stdout: 'usage: ...', stderr: '' }, 'x', '/w/A.cut'), {
      blocked: false,
    });
    assert.deepStrictEqual(evaluateCaseSelection({ code: 0, stdout: '{"error": "bad"}', stderr: '' }, 'x', '/w/A.cut'), {
      blocked: false,
    });
  });
});
