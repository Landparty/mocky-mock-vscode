import * as assert from 'assert';
import {
  BoundaryInfo,
  boundaryKeyCandidates,
  detectCompletionContext,
  keyFromDirective,
  MOCK_CATEGORIES,
  QUOTED_CATEGORIES,
} from './cutCompletionLogic';

describe('detectCompletionContext', () => {
  it('detects the category position right after MOCK', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK '), { kind: 'category' });
  });

  it('does not offer categories before the space after MOCK (the editor would replace MOCK)', () => {
    assert.strictEqual(detectCompletionContext('MOCK'), null);
  });

  it('detects the key position after MOCK <category> <partial key>, uppercasing the category', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK call SUB'), {
      kind: 'key',
      category: 'CALL',
      partial: 'SUB',
    });
  });

  it('reports the typed partial including an opening quote, so it can be replaced whole', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK CALL "SUB'), {
      kind: 'key',
      category: 'CALL',
      partial: '"SUB',
    });
    assert.deepStrictEqual(detectCompletionContext('    MOCK READ '), {
      kind: 'key',
      category: 'READ',
      partial: '',
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

describe('boundaryKeyCandidates', () => {
  const boundaries: BoundaryInfo[] = [
    {
      category: 'CALL',
      key: 'SUBPROG',
      keys: ['SUBPROG'],
      directive: 'MOCK CALL "SUBPROG"',
      label: 'CALL SUBPROG',
      paragraph: 'MAIN-PARA',
      line: 10,
      matchText: 'CALL SUBPROG',
    },
    {
      category: 'CALL',
      key: 'SUBPROG',
      keys: ['SUBPROG'],
      directive: 'MOCK CALL "SUBPROG"',
      label: 'CALL SUBPROG',
      paragraph: 'OTHER-PARA',
      line: 20,
      matchText: 'CALL SUBPROG',
    },
    {
      category: 'DYNCALL',
      key: 'WS-PGM',
      keys: ['WS-PGM'],
      directive: 'MOCK CALL WS-PGM',
      label: 'CALL WS-PGM',
      paragraph: 'MAIN-PARA',
      line: 12,
      matchText: 'CALL WS-PGM',
    },
    {
      category: 'OPEN',
      key: 'INV-FILE',
      keys: ['INV-FILE', 'RPT-FILE'],
      directive: 'MOCK OPEN INV-FILE',
      label: 'OPEN INV-FILE RPT-FILE',
      paragraph: 'MAIN-PARA',
      line: 14,
      matchText: 'OPEN INPUT INV-FILE OUTPUT RPT-FILE',
    },
    {
      category: 'READ',
      key: 'CUST-FILE',
      keys: ['CUST-FILE'],
      directive: 'MOCK READ CUST-FILE',
      label: 'READ CUST-FILE',
      paragraph: 'MAIN-PARA',
      line: 15,
      matchText: 'READ CUST-FILE',
    },
    {
      category: 'SQL',
      key: null,
      keys: [],
      directive: 'MOCK SQL "UPDATE INVENTORY"',
      label: 'EXEC SQL',
      paragraph: 'MAIN-PARA',
      line: 16,
      matchText: 'UPDATE INVENTORY SET TOTAL_QTY = :WS-TOTAL-QTY',
    },
    {
      category: 'PARAGRAPH',
      key: null,
      keys: [],
      directive: null,
      label: 'PARAGRAPH',
      paragraph: 'MAIN-PARA',
      line: 5,
      matchText: null,
    },
  ];
  const texts = (category: string) => boundaryKeyCandidates(boundaries, category).map((c) => c.insertText);

  it('filters to the requested category, case-insensitively, bare key for a bare-key category', () => {
    assert.deepStrictEqual(texts('read'), ['CUST-FILE']);
  });

  it('quotes the key for the categories the DSL requires quoted, and de-duplicates', () => {
    assert.deepStrictEqual(texts('CALL'), ['"SUBPROG"', 'WS-PGM']);
  });

  it('offers a dynamic CALL site as the bare identifier under CALL', () => {
    assert.ok(texts('CALL').includes('WS-PGM'));
  });

  it('treats MQ as an alias for CALL (quoted)', () => {
    assert.deepStrictEqual(texts('MQ'), ['"SUBPROG"', 'WS-PGM']);
  });

  it('offers every key of a multi-key site', () => {
    assert.deepStrictEqual(texts('OPEN'), ['INV-FILE', 'RPT-FILE']);
  });

  it('uses the CLI-rendered directive for SQL/CICS/DLI, which have no key of their own', () => {
    assert.deepStrictEqual(texts('SQL'), ['"UPDATE INVENTORY"']);
  });

  it('offers nothing for a key-less site without a directive', () => {
    assert.deepStrictEqual(texts('PARAGRAPH'), []);
  });

  it('returns nothing for a category with no matching boundaries', () => {
    assert.deepStrictEqual(texts('CICS'), []);
  });

  it('tolerates an older CLI that emits no directive field', () => {
    const legacy = boundaries.map(({ directive: _drop, ...rest }) => rest);
    assert.deepStrictEqual(
      boundaryKeyCandidates(legacy, 'CALL').map((c) => c.insertText),
      ['"SUBPROG"', 'WS-PGM']
    );
    assert.deepStrictEqual(boundaryKeyCandidates(legacy, 'SQL'), []);
  });
});

describe('keyFromDirective', () => {
  it('strips the MOCK <category> prefix and a trailing ROWS', () => {
    assert.strictEqual(keyFromDirective('MOCK SQL "UPDATE INVENTORY"'), '"UPDATE INVENTORY"');
    assert.strictEqual(keyFromDirective('MOCK READ INV-FILE ROWS'), 'INV-FILE');
    assert.strictEqual(keyFromDirective(null), null);
    assert.strictEqual(keyFromDirective(undefined), null);
  });
});

describe('QUOTED_CATEGORIES', () => {
  it("matches mocky-mock's dsl/parser.py _QUOTED_CATS", () => {
    assert.deepStrictEqual([...QUOTED_CATEGORIES].sort(), ['CALL', 'CICS', 'DLI', 'MQ', 'SQL']);
  });
});
