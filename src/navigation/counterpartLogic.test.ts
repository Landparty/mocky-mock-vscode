import * as assert from 'assert';
import * as path from 'path';
import { counterpartOf } from './counterpartLogic';

const dir = path.join(path.sep, 'w');
const p = (name: string) => path.join(dir, name);

describe('counterpartOf', () => {
  it('pairs a program with its suite, reporting whether the suite exists', () => {
    assert.deepStrictEqual(counterpartOf(p('PAY.cbl'), (f) => f === p('PAY.cut')), {
      kind: 'suite',
      path: p('PAY.cut'),
      exists: true,
    });
    assert.deepStrictEqual(counterpartOf(p('PAY.cob'), () => false), {
      kind: 'suite',
      path: p('PAY.cut'),
      exists: false,
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
