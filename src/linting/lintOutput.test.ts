import * as assert from 'assert';
import { cutRelativeLine, parseLintOutput } from './lintOutput';

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

  // Wording below is transcribed verbatim from mocky-mock's
  // mockymock/analysis/refusal.py, not invented -- these two codes are the
  // ones the linter-breaks-on-copybooks bug actually shipped with, because
  // the earlier (fabricated) fixtures here didn't carry a "line N" at all
  // and so never exercised the embedded-line path against real wording.
  it('extracts an embedded line reference from an UNRESOLVED_COPYBOOK refusal, but it is a .cbl line, not a .cut one', () => {
    const problems = parseLintOutput(
      'mockymock lint: refused (UNRESOLVED_COPYBOOK): unresolved COPY statement at line 45 -- ' +
        'the DATA DIVISION section it belongs to has no expanded content (cobolparser does not ' +
        'raise a parse error for an unresolved COPY; it silently produces an empty data-item list ' +
        'instead), so splicing/compiling would proceed with missing WORKING-STORAGE fields -- pass ' +
        '--copybook-path pointing at the copybook\'s directory\n'
    );
    assert.strictEqual(problems[0].line, 45);
    assert.strictEqual(problems[0].code, 'UNRESOLVED_COPYBOOK');
    // The line IS parsed (useful for lintGate.ts's dialog text) but must
    // never be treated as a position inside the .cut document being linted.
    assert.strictEqual(cutRelativeLine(problems[0]), null);
  });

  it('extracts an embedded line reference from an UNSUPPORTED_TERMINATOR_LAYOUT refusal, also a .cbl line', () => {
    const problems = parseLintOutput(
      "mockymock lint: refused (UNSUPPORTED_TERMINATOR_LAYOUT): STOP RUN at line 12 (paragraph " +
        "'MAIN-PARA') is reachable from 'MAIN-PARA' but not via a chain of plain, unconditional, " +
        'top-level PERFORM statements -- this is the only shape this feature can safely neutralize today\n'
    );
    assert.strictEqual(problems[0].line, 12);
    assert.strictEqual(problems[0].code, 'UNSUPPORTED_TERMINATOR_LAYOUT');
    assert.strictEqual(cutRelativeLine(problems[0]), null);
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

describe('cutRelativeLine', () => {
  it('trusts the line only for CUT_PARSE_ERROR, the one code the CLI documents as .cut-relative', () => {
    assert.strictEqual(cutRelativeLine({ line: 7, message: 'x', code: 'CUT_PARSE_ERROR' }), 7);
  });

  it('discards the line for every other code, even when one is present', () => {
    assert.strictEqual(cutRelativeLine({ line: 45, message: 'x', code: 'UNRESOLVED_COPYBOOK' }), null);
    assert.strictEqual(cutRelativeLine({ line: 12, message: 'x', code: 'UNSUPPORTED_TERMINATOR_LAYOUT' }), null);
    // Unknown/future code with a line-bearing message: fails closed to
    // file-level rather than assuming it's safe to position with.
    assert.strictEqual(cutRelativeLine({ line: 3, message: 'x', code: 'SOME_NEW_CODE' }), null);
  });

  it('is null when there is no line to begin with', () => {
    assert.strictEqual(cutRelativeLine({ line: null, message: 'x', code: 'CUT_PARSE_ERROR' }), null);
    assert.strictEqual(cutRelativeLine({ line: null, message: 'x', code: null }), null);
  });
});
