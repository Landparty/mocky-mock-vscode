import * as assert from 'assert';
import { parseCoverageJson, mergeCoverage } from './coverageReport';

const SAMPLE = JSON.stringify({
  version: 1,
  programFile: 'PROG.cbl',
  instrumented: { sourceName: 'PROG.cbl', percentage: 76.3, totalExecutable: 907, totalCovered: 692 },
  original: {
    totalExecutable: 3,
    totalCovered: 2,
    lines: [
      { line: 6, covered: true },
      { line: 7, covered: true },
      { line: 9, covered: false },
    ],
  },
});

describe('parseCoverageJson', () => {
  it('parses the original-line coverage section', () => {
    const data = parseCoverageJson(SAMPLE);
    assert.ok(data);
    assert.strictEqual(data!.programFile, 'PROG.cbl');
    assert.strictEqual(data!.totalExecutable, 3);
    assert.strictEqual(data!.totalCovered, 2);
    assert.deepStrictEqual(data!.lines[2], { line: 9, covered: false });
  });

  it('returns null for malformed or alien documents', () => {
    assert.strictEqual(parseCoverageJson('nope'), null);
    assert.strictEqual(parseCoverageJson('{"instrumented": {}}'), null);
  });

  it('derives totals from the lines when the totals are missing', () => {
    const data = parseCoverageJson(
      JSON.stringify({ original: { lines: [{ line: 1, covered: true }, { line: 2, covered: false }] } })
    );
    assert.ok(data);
    assert.strictEqual(data!.totalExecutable, 2);
    assert.strictEqual(data!.totalCovered, 1);
  });
});

describe('mergeCoverage', () => {
  it('covers a line when any suite covered it', () => {
    const a = {
      programFile: 'PAY.cbl',
      lines: [
        { line: 5, covered: true },
        { line: 9, covered: false },
      ],
      totalExecutable: 2,
      totalCovered: 1,
    };
    const b = {
      programFile: 'PAY.cbl',
      lines: [
        { line: 9, covered: true },
        { line: 5, covered: false },
        { line: 12, covered: false },
      ],
      totalExecutable: 3,
      totalCovered: 1,
    };
    assert.deepStrictEqual(mergeCoverage(a, b), {
      programFile: 'PAY.cbl',
      lines: [
        { line: 5, covered: true },
        { line: 9, covered: true },
        { line: 12, covered: false },
      ],
      totalExecutable: 3,
      totalCovered: 2,
    });
  });
});
