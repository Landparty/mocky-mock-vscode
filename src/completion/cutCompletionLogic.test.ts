import * as assert from 'assert';
import {
  BoundaryInfo,
  detectCompletionContext,
  filterBoundaryKeysForCategory,
  MOCK_CATEGORIES,
} from './cutCompletionLogic';

describe('detectCompletionContext', () => {
  it('detects the category position right after MOCK', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK '), { kind: 'category' });
  });

  it('detects the category position with no trailing space yet', () => {
    assert.deepStrictEqual(detectCompletionContext('MOCK'), { kind: 'category' });
  });

  it('detects the key position after MOCK <category> <partial key>, uppercasing the category', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK call SUB'), {
      kind: 'key',
      category: 'CALL',
    });
  });

  it('returns null once a key has already been completed with trailing text', () => {
    assert.strictEqual(detectCompletionContext('    MOCK CALL SUBPROG RETURNING'), null);
  });

  it('returns null on an unrelated line', () => {
    assert.strictEqual(detectCompletionContext('    TESTCASE "happy path"'), null);
  });
});

describe('MOCK_CATEGORIES', () => {
  it('has no duplicates', () => {
    assert.strictEqual(new Set(MOCK_CATEGORIES).size, MOCK_CATEGORIES.length);
  });
});

describe('filterBoundaryKeysForCategory', () => {
  const boundaries: BoundaryInfo[] = [
    {
      category: 'CALL',
      key: 'SUBPROG',
      keys: ['SUBPROG'],
      label: 'CALL SUBPROG',
      paragraph: 'MAIN-PARA',
      line: 10,
      matchText: 'CALL SUBPROG',
    },
    {
      category: 'CALL',
      key: 'SUBPROG',
      keys: ['SUBPROG'],
      label: 'CALL SUBPROG',
      paragraph: 'OTHER-PARA',
      line: 20,
      matchText: 'CALL SUBPROG',
    },
    {
      category: 'READ',
      key: 'CUST-FILE',
      keys: ['CUST-FILE'],
      label: 'READ CUST-FILE',
      paragraph: 'MAIN-PARA',
      line: 15,
      matchText: 'READ CUST-FILE',
    },
    {
      category: 'PARAGRAPH',
      key: null,
      keys: [],
      label: 'PARAGRAPH',
      paragraph: 'MAIN-PARA',
      line: 5,
      matchText: null,
    },
  ];

  it('filters to the requested category, case-insensitively', () => {
    const result = filterBoundaryKeysForCategory(boundaries, 'read');
    assert.deepStrictEqual(
      result.map((b) => b.key),
      ['CUST-FILE']
    );
  });

  it('de-duplicates repeated keys across boundaries', () => {
    const result = filterBoundaryKeysForCategory(boundaries, 'CALL');
    assert.deepStrictEqual(
      result.map((b) => b.key),
      ['SUBPROG']
    );
  });

  it('treats MQ as an alias for CALL', () => {
    const result = filterBoundaryKeysForCategory(boundaries, 'MQ');
    assert.deepStrictEqual(
      result.map((b) => b.key),
      ['SUBPROG']
    );
  });

  it('excludes boundaries with no key', () => {
    const result = filterBoundaryKeysForCategory(boundaries, 'PARAGRAPH');
    assert.deepStrictEqual(result, []);
  });

  it('returns nothing for a category with no matching boundaries', () => {
    assert.deepStrictEqual(filterBoundaryKeysForCategory(boundaries, 'SQL'), []);
  });
});
