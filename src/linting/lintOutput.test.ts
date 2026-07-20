import * as assert from 'assert';
import { parseLintOutput } from './lintOutput';

describe('parseLintOutput', () => {
  it('returns nothing for a clean run', () => {
    assert.deepStrictEqual(parseLintOutput('mockymock lint: no problems found.\n'), []);
  });

  it('parses a refused line with its code, at file level when no line is named', () => {
    const problems = parseLintOutput(
      'mockymock lint: refused (UNRESOLVED_COPYBOOK): COPY CUSTMAST could not be resolved\n' +
        'mockymock lint: 1 problem(s) found.\n'
    );
    assert.deepStrictEqual(problems, [
      {
        line: null,
        message: 'COPY CUSTMAST could not be resolved',
        code: 'UNRESOLVED_COPYBOOK',
      },
    ]);
  });

  it('extracts an embedded line reference from a refusal message', () => {
    const problems = parseLintOutput(
      'mockymock lint: refused (UNSUPPORTED_TERMINATOR_LAYOUT): TESTCASE at line 12 reaches STOP RUN\n'
    );
    assert.strictEqual(problems[0].line, 12);
    assert.strictEqual(problems[0].code, 'UNSUPPORTED_TERMINATOR_LAYOUT');
  });

  it('parses a .cut parse error with its line number', () => {
    const problems = parseLintOutput(
      'mockymock lint: invalid .cut file /p/PROG.cut: line 7: unrecognized statement: \'JUNK\'\n' +
        'mockymock lint: 1 problem(s) found.\n'
    );
    assert.deepStrictEqual(problems, [
      { line: 7, message: "unrecognized statement: 'JUNK'", code: 'CUT_PARSE_ERROR' },
    ]);
  });

  it('folds indented parse-error detail lines into the preceding problem', () => {
    const problems = parseLintOutput(
      'mockymock lint: refused (PARSE_ERROR): 2 parse error(s)\n' +
        '  line 3: unexpected token\n' +
        '  line 9: missing period\n' +
        'mockymock lint: 1 problem(s) found.\n'
    );
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0].message, /2 parse error\(s\)\nline 3: unexpected token\nline 9: missing period/);
  });

  it('never reports the summary or the all-clean line as problems', () => {
    const problems = parseLintOutput(
      'mockymock lint: refused (X_CODE): something\nmockymock lint: 1 problem(s) found.\n'
    );
    assert.strictEqual(problems.length, 1);
  });
});
