import * as assert from 'assert';
import { describePartialFill, hasSuggestedFix, parseFillOutcome } from './lintCodeActionLogic';

describe('hasSuggestedFix', () => {
  it('recognizes a mockymock diagnostic carrying the suggested-fix continuation line', () => {
    assert.strictEqual(
      hasSuggestedFix({
        source: 'mockymock',
        message:
          "refused (UNMOCKED_CALL): CALL 'SUBPROG' at line 12 has no MOCK\n    Add to this TESTCASE:\n    MOCK CALL SUBPROG RETURNING 0",
      }),
      true
    );
  });

  it('rejects a mockymock diagnostic with no suggested fix', () => {
    assert.strictEqual(
      hasSuggestedFix({ source: 'mockymock', message: 'refused (UNRESOLVED_COPYBOOK): COPY CUSTMAST not found' }),
      false
    );
  });

  it('rejects a diagnostic from a different source even if the text matches', () => {
    assert.strictEqual(
      hasSuggestedFix({ source: 'eslint', message: 'Add to this TESTCASE:' }),
      false
    );
  });

  it('rejects a diagnostic with no source at all', () => {
    assert.strictEqual(hasSuggestedFix({ source: undefined, message: 'Add to this TESTCASE:' }), false);
  });
});

describe('parseFillOutcome', () => {
  // generate --fill's stdout when it inserted blocks and still exited 1.
  const partial = [
    'mockymock generate --fill: added 4 mock block(s) across 1 test case(s)',
    '/w/fill.cut:12: MOCK CALL "X"',
    "mockymock generate: refused (UNKNOWN_PARAGRAPH): PERFORM target 'NO-SUCH-PARA' not found in PROCEDURE DIVISION",
    '',
  ].join('\n');

  it('reads the added count and the problems left over', () => {
    assert.deepStrictEqual(parseFillOutcome(partial), {
      added: 4,
      leftovers: ["refused (UNKNOWN_PARAGRAPH): PERFORM target 'NO-SUCH-PARA' not found in PROCEDURE DIVISION"],
    });
  });

  it('reports 0 added when the header says so or is missing', () => {
    assert.strictEqual(parseFillOutcome('mockymock generate --fill: added 0 mock block(s) across 0 test case(s)').added, 0);
    assert.strictEqual(parseFillOutcome('').added, 0);
  });

  it('words a partial fill as a warning naming what is left', () => {
    const message = describePartialFill(parseFillOutcome(partial));
    assert.match(message, /^mockymock: added 4 mock blocks, but lint still refuses/);
    assert.match(message, /UNKNOWN_PARAGRAPH/);
  });
});
