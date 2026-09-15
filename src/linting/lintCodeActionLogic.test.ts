import * as assert from 'assert';
import { hasSuggestedFix } from './lintCodeActionLogic';

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
