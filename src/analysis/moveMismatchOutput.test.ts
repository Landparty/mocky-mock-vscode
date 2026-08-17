import * as assert from 'assert';
import { anchorViolationLine, parseMoveMismatchOutput } from './moveMismatchOutput';

describe('parseMoveMismatchOutput', () => {
  it('returns nothing for a clean run', () => {
    const stdout = JSON.stringify({
      source_file: 'PROG.cbl',
      program_id: 'PROG',
      error_count: 0,
      warning_count: 0,
      unresolved_count: 0,
      violations: [],
    });
    assert.deepStrictEqual(parseMoveMismatchOutput(stdout), { problems: [], unresolvedCount: 0 });
  });

  it('parses an ERROR violation into a problem at its 1-based line', () => {
    const stdout = JSON.stringify({
      unresolved_count: 0,
      violations: [
        {
          kind: 'ERROR',
          source: 'CUST-NAME',
          target: 'CUST-BALANCE',
          source_category: 'ALPHABETIC',
          target_category: 'NUMERIC',
          location: { line: 42, column: 5 },
          message: "Illegal MOVE: cannot move ALPHABETIC item 'CUST-NAME' to NUMERIC item 'CUST-BALANCE'",
        },
      ],
    });
    assert.deepStrictEqual(parseMoveMismatchOutput(stdout), {
      problems: [
        {
          line: 42,
          severity: 'ERROR',
          message: "Illegal MOVE: cannot move ALPHABETIC item 'CUST-NAME' to NUMERIC item 'CUST-BALANCE'",
          source: 'CUST-NAME',
          target: 'CUST-BALANCE',
        },
      ],
      unresolvedCount: 0,
    });
  });

  it('parses a WARNING violation into a problem with WARNING severity', () => {
    const stdout = JSON.stringify({
      unresolved_count: 0,
      violations: [
        {
          kind: 'WARNING',
          source: 'RAW-INPUT',
          target: 'AMOUNT',
          source_category: 'ALPHANUMERIC',
          target_category: 'NUMERIC',
          location: { line: 10, column: 8 },
          message: 'Suspicious MOVE: moving ALPHANUMERIC item to NUMERIC item may lose data',
        },
      ],
    });
    const { problems } = parseMoveMismatchOutput(stdout);
    assert.strictEqual(problems.length, 1);
    assert.strictEqual(problems[0].severity, 'WARNING');
    assert.strictEqual(problems[0].line, 10);
  });

  it('skips violations with no location (unresolved operands)', () => {
    const stdout = JSON.stringify({
      unresolved_count: 1,
      violations: [
        {
          kind: 'ERROR',
          source: 'X',
          target: 'Y',
          source_category: 'ALPHABETIC',
          target_category: 'NUMERIC',
          location: null,
          message: 'unresolved',
        },
      ],
    });
    assert.deepStrictEqual(parseMoveMismatchOutput(stdout), { problems: [], unresolvedCount: 1 });
  });

  it('returns nothing for stdout that is not valid JSON', () => {
    assert.deepStrictEqual(parseMoveMismatchOutput('usage: mockymock analyze [-h] ...\n'), {
      problems: [],
      unresolvedCount: 0,
    });
  });

  it('returns nothing when the parsed JSON has no violations array', () => {
    assert.deepStrictEqual(parseMoveMismatchOutput(JSON.stringify({ source_file: 'PROG.cbl' })), {
      problems: [],
      unresolvedCount: 0,
    });
  });

  // A file whose MOVE operands couldn't be resolved to a known data category
  // (e.g. an unresolved COPY, empirically confirmed against a real
  // cobol-parser run) reports zero violations *and* a non-zero
  // unresolved_count -- "nothing found wrong" is not the same as "everything
  // was checked", and the diagnostics layer must be able to tell them apart
  // instead of treating both as a clean file.
  it('extracts unresolvedCount even when there are no violations to report', () => {
    const stdout = JSON.stringify({ unresolved_count: 3, violations: [] });
    assert.deepStrictEqual(parseMoveMismatchOutput(stdout), { problems: [], unresolvedCount: 3 });
  });

  it('treats a non-numeric unresolved_count as 0', () => {
    const stdout = JSON.stringify({ unresolved_count: 'oops', violations: [] });
    assert.deepStrictEqual(parseMoveMismatchOutput(stdout), { problems: [], unresolvedCount: 0 });
  });
});

// cobolparser locations are relative to the copybook-EXPANDED text; these
// tests pin the content-based re-anchoring back onto the on-disk source.
describe('anchorViolationLine', () => {
  const lines = [
    /* 1 */ '       IDENTIFICATION DIVISION.',
    /* 2 */ '       DATA DIVISION.',
    /* 3 */ '       COPY CUSTREC.',
    /* 4 */ '       PROCEDURE DIVISION.',
    /* 5 */ '       MAIN-PARA.',
    /* 6 */ '           MOVE CUST-NAME TO CUST-BALANCE',
    /* 7 */ '           MOVE ZERO TO WS-TOTAL',
    /* 8 */ '           STOP RUN.',
  ];

  it('keeps the reported line when it already reads as the right MOVE (no expansion)', () => {
    assert.strictEqual(anchorViolationLine(lines, 6, 'CUST-NAME'), 6);
  });

  it('re-anchors a line pushed down by copybook expansion onto the nearest matching MOVE above', () => {
    // A 49-line CUSTREC copybook shifts the reported line from 6 to 55.
    assert.strictEqual(anchorViolationLine(lines, 55, 'CUST-NAME'), 6);
  });

  it('does not match the source operand inside a longer hyphenated name', () => {
    const src = ['           MOVE PREFIX-CUST-NAME TO A', '           MOVE CUST-NAME TO B'];
    assert.strictEqual(anchorViolationLine(src, 2, 'CUST-NAME'), 2);
  });

  it('falls back to the nearest matching MOVE below when nothing matches above', () => {
    assert.strictEqual(anchorViolationLine(lines, 2, 'CUST-NAME'), 6);
  });

  it('clamps into the document when the operand is unknown or never found', () => {
    assert.strictEqual(anchorViolationLine(lines, 55, undefined), 8);
    assert.strictEqual(anchorViolationLine(lines, 55, 'NO-SUCH-ITEM'), 8);
    assert.strictEqual(anchorViolationLine(lines, 0, undefined), 1);
  });
});
