import * as assert from 'assert';
import { parseMoveMismatchOutput } from './moveMismatchOutput';

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
