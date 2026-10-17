import * as assert from 'assert';
import * as path from 'path';
import { counterpartOf, isExportedProgram, originalOfExport } from './counterpartLogic';

const dir = path.join(path.sep, 'w');
const p = (name: string) => path.join(dir, name);

describe('counterpartOf', () => {
  it('pairs a program with its suite, reporting whether the suite exists', () => {
    assert.deepStrictEqual(
      counterpartOf(p('PAY.cbl'), (f) => f === p('PAY.cut') || f === p('PAY.cbl'), () => ['PAY.cbl', 'PAY.cut']),
      { kind: 'suite', path: p('PAY.cut'), exists: true, all: [p('PAY.cut')] }
    );
    assert.deepStrictEqual(counterpartOf(p('PAY.cob'), () => false, () => []), {
      kind: 'suite',
      path: p('PAY.cut'),
      exists: false,
      all: [],
    });
  });

  it('lists every sibling suite of a program, PROG.<topic>.cut included', () => {
    const files = ['PAY.cbl', 'PAY.cut', 'PAY.errors.cut', 'PAYROLL.cut', 'OTHER.cut'];
    const onDisk = new Set(files.map(p));
    const pair = counterpartOf(p('PAY.cbl'), (f) => onDisk.has(f), () => files);
    assert.deepStrictEqual(pair, {
      kind: 'suite',
      path: p('PAY.cut'),
      exists: true,
      all: [p('PAY.cut'), p('PAY.errors.cut')],
    });
  });

  it('pairs a named second suite back to its program', () => {
    assert.deepStrictEqual(counterpartOf(p('PAY.errors.cut'), (f) => f === p('PAY.cbl')), {
      kind: 'program',
      path: p('PAY.cbl'),
      exists: true,
    });
  });

  it('pairs a suite with whichever program extension is on disk', () => {
    assert.deepStrictEqual(counterpartOf(p('PAY.cut'), (f) => f === p('PAY.cobol')), {
      kind: 'program',
      path: p('PAY.cobol'),
      exists: true,
    });
  });

  it('reports a suite whose program is missing', () => {
    assert.deepStrictEqual(counterpartOf(p('PAY.cut'), () => false), {
      kind: 'program',
      path: p('PAY.cbl'),
      exists: false,
    });
  });

  it('ignores exported mainframe builds and unrelated files', () => {
    assert.strictEqual(counterpartOf(p('PAY.mainframe.cbl'), () => true), undefined);
    assert.strictEqual(counterpartOf(p('PAY.cpy'), () => true), undefined);
    assert.strictEqual(counterpartOf(p('README.md'), () => true), undefined);
  });
});

describe('originalOfExport', () => {
  it('finds the program an exported PROG.mainframe.cbl came from', () => {
    assert.strictEqual(isExportedProgram(p('PAY.mainframe.cbl')), true);
    assert.strictEqual(isExportedProgram(p('PAY.cbl')), false);
    assert.strictEqual(originalOfExport(p('PAY.mainframe.cbl'), (f) => f === p('PAY.cob')), p('PAY.cob'));
  });

  it('is undefined for an ordinary program or when the original is gone', () => {
    assert.strictEqual(originalOfExport(p('PAY.cbl'), () => true), undefined);
    assert.strictEqual(originalOfExport(p('PAY.mainframe.cbl'), () => false), undefined);
  });
});
