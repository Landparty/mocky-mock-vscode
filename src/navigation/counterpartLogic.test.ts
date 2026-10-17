import * as assert from 'assert';
import * as path from 'path';
import { counterpartOf } from './counterpartLogic';
import { setPairings } from '../discovery/suitePairing';

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

describe('counterpartOf with a CLI pairing error', () => {
  afterEach(() => setPairings([]));

  it("reports the CLI's reason instead of a guessed sibling program", () => {
    const cut = path.join(path.sep, 'ws', 'tests', 'PAY.cut');
    const error = 'PROGRAM \'../src/PAYY.cbl\' does not exist';
    setPairings([{ root: '', testsDir: '', sourceRoot: '', suites: [{ cut, program: null, error }] }]);
    const pair = counterpartOf(cut, () => true);
    assert.ok(pair && pair.kind === 'program');
    assert.strictEqual(pair.exists, false);
    assert.strictEqual(pair.error, error);
  });
});
