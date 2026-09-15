import * as assert from 'assert';
import { isStubExpectComment, matchIdentifier } from './cutHoverLogic';

describe('matchIdentifier', () => {
  it('matches a tally counter', () => {
    assert.deepStrictEqual(matchIdentifier('UT-CALL-SUBPROG-TALLY', 'IF UT-CALL-SUBPROG-TALLY = 1'), {
      kind: 'tally',
    });
  });

  it('excludes the driver-internal UT-TALLY-EDITED scratch field', () => {
    assert.strictEqual(matchIdentifier('UT-TALLY-EDITED', 'MOVE UT-TALLY-EDITED TO WS-X'), null);
  });

  it('matches a capture target ahead of a tally counter for the same word shape', () => {
    assert.deepStrictEqual(matchIdentifier('UT-CAP-SUBPROG-ARG1', 'EXPECT UT-CAP-SUBPROG-ARG1 = "X"'), {
      kind: 'capture',
    });
  });

  it('matches a refusal code only inside a *> comment', () => {
    assert.deepStrictEqual(
      matchIdentifier('UNRESOLVED_COPYBOOK', '*> UNRESOLVED_COPYBOOK: COPY CUSTMAST not found'),
      { kind: 'refusalCode', code: 'UNRESOLVED_COPYBOOK' }
    );
  });

  it('does not treat an all-caps underscored word as a refusal code outside a comment', () => {
    assert.strictEqual(matchIdentifier('UNRESOLVED_COPYBOOK', 'MOVE UNRESOLVED_COPYBOOK TO WS-X'), null);
  });

  it('returns null for an ordinary identifier', () => {
    assert.strictEqual(matchIdentifier('WS-CUSTOMER-ID', 'MOVE WS-CUSTOMER-ID TO WS-OUT'), null);
  });

  it('requires at least one underscore for a refusal code match', () => {
    assert.strictEqual(matchIdentifier('CALL', '*> CALL SUBPROG'), null);
  });
});

describe('isStubExpectComment', () => {
  it('matches the stub expect protocol comment', () => {
    assert.strictEqual(isStubExpectComment('    *> STUB EXPECT'), true);
  });

  it('matches with extra trailing text', () => {
    assert.strictEqual(isStubExpectComment('*> STUB EXPECT WS-RESULT'), true);
  });

  it('is case sensitive to the exact protocol text', () => {
    assert.strictEqual(isStubExpectComment('*> stub expect'), false);
  });

  it('rejects an unrelated comment', () => {
    assert.strictEqual(isStubExpectComment('*> just a note'), false);
  });
});
