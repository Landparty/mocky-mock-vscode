import * as assert from 'assert';
import { evaluateLintResult } from './lintGate';

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
