import * as assert from 'assert';
import {
  ROWS_CATEGORIES,
  BoundaryInfo,
  boundaryKeyCandidates,
  collectBoundaries,
  parseCollectPayload,
  detectCompletionContext,
  flowTargetsFromSource,
  keyFromDirective,
  keyReplaceLengthAfterCursor,
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

  it('still offers categories once a category is partly typed', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK R'), { kind: 'category' });
    assert.deepStrictEqual(detectCompletionContext('    MOCK REA'), { kind: 'category' });
  });

  it('keeps the key position inside an unclosed quoted key that contains a space', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK SQL "UPDATE '), {
      kind: 'key',
      category: 'SQL',
      partial: '"UPDATE ',
    });
    assert.deepStrictEqual(detectCompletionContext('    MOCK SQL "UPDATE O'), {
      kind: 'key',
      category: 'SQL',
      partial: '"UPDATE O',
    });
  });

  it('detects the key position after MOCK <category> <partial key>', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK CALL SUB'), {
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

  it('offers ROWS after a complete key on a ROWS-capable category', () => {
    assert.deepStrictEqual(detectCompletionContext('    MOCK CALL "CBLTDLI" '), { kind: 'rows', partial: '' });
    assert.deepStrictEqual(detectCompletionContext('    MOCK SQL "FETCH CUR1" RO'), { kind: 'rows', partial: 'RO' });
    assert.deepStrictEqual(detectCompletionContext('    MOCK READ CUST-FILE ro'), { kind: 'rows', partial: 'ro' });
    assert.deepStrictEqual(detectCompletionContext('    MOCK DLI "GN" '), { kind: 'rows', partial: '' });
    assert.deepStrictEqual(detectCompletionContext('    MOCK CICS "LINK PROGRAM" '), { kind: 'rows', partial: '' });
  });

  it('does not offer ROWS for categories without a ROWS block, or mid-quote', () => {
    assert.strictEqual(detectCompletionContext('    MOCK WRITE OUT-FILE '), null);
    assert.strictEqual(detectCompletionContext('    MOCK PARAGRAPH 1000-X '), null);
    assert.strictEqual(detectCompletionContext('    MOCK SQL "SELECT ')?.kind, 'key');
  });

  it('offers nothing after a lowercase MOCK or category, which the CLI rejects', () => {
    assert.strictEqual(detectCompletionContext('    mock '), null);
    assert.strictEqual(detectCompletionContext('    MOCK call '), null);
    assert.strictEqual(detectCompletionContext('    Mock Read IN-FILE '), null);
    assert.strictEqual(detectCompletionContext('    MOCK read IN-FILE '), null);
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

  it('treats MQ as an alias for CALL (quoted), without the bare dynamic-CALL identifiers', () => {
    assert.deepStrictEqual(texts('MQ'), ['"SUBPROG"']);
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

describe('keyReplaceLengthAfterCursor', () => {
  // Apply a key completion the way the provider does: replace `partial`
  // before the cursor plus the returned length after it.
  const accept = (line: string, cursor: number, insertText: string): string => {
    const context = detectCompletionContext(line.slice(0, cursor));
    assert.ok(context && context.kind === 'key');
    const end = cursor + keyReplaceLengthAfterCursor(context.partial, line.slice(cursor));
    return line.slice(0, cursor - context.partial.length) + insertText + line.slice(end);
  };

  it('replaces the auto-closed quote after the cursor', () => {
    assert.strictEqual(accept('    MOCK CALL ""', 15, '"DISCRATE"'), '    MOCK CALL "DISCRATE"');
    assert.strictEqual(accept('    MOCK CALL "DIS"', 18, '"DISCRATE"'), '    MOCK CALL "DISCRATE"');
    assert.strictEqual(
      accept('    MOCK SQL "UPDATE "', 21, '"UPDATE ORDERS"'),
      '    MOCK SQL "UPDATE ORDERS"'
    );
  });

  it('replaces nothing after the cursor without an opening and a following quote', () => {
    assert.strictEqual(keyReplaceLengthAfterCursor('"DIS', ''), 0);
    assert.strictEqual(keyReplaceLengthAfterCursor('"DIS', ' ROWS'), 0);
    assert.strictEqual(keyReplaceLengthAfterCursor('INV-F', '"'), 0);
  });
});

describe('QUOTED_CATEGORIES', () => {
  it("matches mocky-mock's dsl/parser.py _QUOTED_CATS", () => {
    assert.deepStrictEqual([...QUOTED_CATEGORIES].sort(), ['CALL', 'CICS', 'DLI', 'MQ', 'SQL']);
  });
});

describe('ROWS_CATEGORIES', () => {
  // mocky-mock 0.10.2's dsl/model.py: ROWS_CATEGORIES = {SQL, READ, RETURN}
  // | SEQUENCED_CALL_CATEGORIES, the latter {CALL, DYNCALL, DLI, CICS, ACCEPT}.
  // DYNCALL is spelled `MOCK CALL <bare-word>` and MQ is CALL at parse time.
  it("matches mocky-mock's dsl/model.py ROWS_CATEGORIES (MQ spelled as the DSL writes it)", () => {
    assert.deepStrictEqual([...ROWS_CATEGORIES].sort(), ['ACCEPT', 'CALL', 'CICS', 'DLI', 'MQ', 'READ', 'RETURN', 'SQL']);
  });
});

describe('flowTargetsFromSource', () => {
  // Shaped like mocky-mock's examples/flowmock/FLOWMOCK.cbl, whose `collect
  // --boundaries` lists only its CALL.
  const source = [
    '       IDENTIFICATION DIVISION.',
    '       PROGRAM-ID. FLOWMOCK.',
    '       DATA DIVISION.',
    '       WORKING-STORAGE SECTION.',
    '       01  WS-TOTAL PIC 9(5) VALUE 0.',
    '       PROCEDURE DIVISION.',
    '       MAIN-PROCESS.',
    '           PERFORM CALC-TOTALS',
    '           PERFORM RPT-BLOCK',
    '           GOBACK.',
    '       CALC-TOTALS.',
    '           CALL "RATECALC" USING WS-TOTAL.',
    '       RPT-BLOCK SECTION.',
    '       RPT-HEADER.',
    '           DISPLAY "HEADER".',
    '       RPT-BODY.',
    '           DISPLAY "BODY".',
  ];

  it('lists every PROCEDURE DIVISION paragraph, including those inside a section', () => {
    assert.deepStrictEqual(
      flowTargetsFromSource(source).paragraphs.map((t) => t.name),
      ['MAIN-PROCESS', 'CALC-TOTALS', 'RPT-HEADER', 'RPT-BODY']
    );
  });

  it('lists PROCEDURE DIVISION sections without the SECTION suffix, and no DATA DIVISION ones', () => {
    assert.deepStrictEqual(flowTargetsFromSource(source).sections, [{ name: 'RPT-BLOCK', line: 13 }]);
  });
});

describe('collectBoundaries (#100)', () => {
  const sql: BoundaryInfo = {
    category: 'SQL',
    key: 'OPEN C1',
    keys: ['OPEN C1'],
    label: 'OPEN C1',
    paragraph: 'MAIN',
    line: 12,
    matchText: null,
  };

  it('takes the boundaries a current CLI reports next to a suite parse error', async () => {
    let throwawayCalls = 0;
    const payload = await collectBoundaries(
      '/w/P.cut',
      async () => ({ stdout: JSON.stringify({ error: 'line 3: malformed MOCK directive', boundaries: [sql] }) }),
      async () => {
        throwawayCalls++;
        return { stdout: '{}' };
      }
    );
    assert.deepStrictEqual(payload.boundaries, [sql]);
    assert.strictEqual(throwawayCalls, 0);
  });

  it('asks an older CLI again with a throwaway suite when the real one does not parse', async () => {
    const asked: string[] = [];
    const payload = await collectBoundaries(
      '/w/P.cut',
      async (suite) => {
        asked.push(suite);
        return { stdout: JSON.stringify({ error: 'line 3: malformed MOCK directive' }) };
      },
      async () => ({ stdout: JSON.stringify({ version: 1, boundaries: [sql] }) })
    );
    assert.deepStrictEqual(asked, ['/w/P.cut']);
    assert.deepStrictEqual(payload.boundaries, [sql]);
  });

  it('does not retry when the CLI printed nothing usable (absent, program does not parse)', async () => {
    let throwawayCalls = 0;
    const payload = await collectBoundaries(
      '/w/P.cut',
      async () => ({ stdout: 'Traceback ...' }),
      async () => {
        throwawayCalls++;
        return { stdout: '{}' };
      }
    );
    assert.deepStrictEqual(payload, {});
    assert.strictEqual(throwawayCalls, 0);
  });

  it('ignores a non-object document and a non-array boundaries field', () => {
    assert.deepStrictEqual(parseCollectPayload('null'), {});
    assert.deepStrictEqual(parseCollectPayload('{"boundaries": "x"}'), { boundaries: undefined, error: undefined });
  });
});
