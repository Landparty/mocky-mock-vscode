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
});
