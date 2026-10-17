import * as assert from 'assert';
import * as path from 'path';
import { resolveCblPath, resolveCutPath, suitesForProgram } from './cutDiscovery';
import {
  parseProgramSuites,
  parseSuitesListing,
  pairedProgram,
  pairedSuites,
  readProgramLine,
  rememberPairing,
  setPairings,
  suiteBaseName,
  validateSuiteTopic,
} from './suitePairing';

const root = path.join(path.sep, 'repo');
const at = (...parts: string[]) => path.join(root, ...parts);

describe('suitePairing', () => {
  afterEach(() => setPairings([]));

  it('parses `mockymock suites --json`, keeping unpaired suites as null', () => {
    const listing = parseSuitesListing(
      JSON.stringify({
        version: 1,
        root: at(),
        testsDir: at('tests'),
        sourceRoot: at('src'),
        suites: [
          { cut: at('tests', 'PAY.cut'), program: at('src', 'PAY.cbl'), rule: 'mirror' },
          { cut: at('tests', 'LOST.cut'), program: null, error: 'no COBOL program found' },
          { nonsense: true },
        ],
      })
    );
    assert.ok(listing);
    assert.strictEqual(listing.testsDir, at('tests'));
    assert.deepStrictEqual(
      listing.suites.map((s) => [path.basename(s.cut), s.program && path.basename(s.program)]),
      [
        ['PAY.cut', 'PAY.cbl'],
        ['LOST.cut', null],
      ]
    );
    assert.strictEqual(parseSuitesListing('not json'), undefined);
    assert.strictEqual(parseSuitesListing('{"version":1}'), undefined);
  });

  it('parses one program\'s suites and where a new one goes', () => {
    const parsed = parseProgramSuites(
      JSON.stringify({ program: at('src', 'PAY.cbl'), suites: [at('tests', 'PAY.cut')], newSuitePath: at('tests', 'PAY.errors.cut') })
    );
    assert.deepStrictEqual(parsed, {
      program: at('src', 'PAY.cbl'),
      suites: [at('tests', 'PAY.cut')],
      newSuitePath: at('tests', 'PAY.errors.cut'),
    });
    assert.strictEqual(parseProgramSuites(JSON.stringify({ error: 'no such file' })), undefined);
  });

  it('reads the PROGRAM line only before the first TESTCASE', () => {
    assert.strictEqual(readProgramLine('TESTSUITE "S"\n  PROGRAM "../src/PAY.cbl"\nTESTCASE "t"\n'), '../src/PAY.cbl');
    assert.strictEqual(readProgramLine('TESTSUITE "S"\nTESTCASE "t"\nPROGRAM "X.cbl"\n'), undefined);
    assert.strictEqual(readProgramLine('TESTSUITE "S"\n'), undefined);
  });

  it('takes the base name up to the first dot', () => {
    assert.strictEqual(suiteBaseName(at('PAY.errors.cut')), 'PAY');
    assert.strictEqual(suiteBaseName(at('PAY.cut')), 'PAY');
  });

  it('accepts simple topics and explains bad ones', () => {
    assert.strictEqual(validateSuiteTopic('month-end'), undefined);
    assert.ok(validateSuiteTopic(''));
    assert.ok(validateSuiteTopic('two.parts'));
    assert.ok(validateSuiteTopic('has space'));
  });

  it('answers from the CLI pairing first, both directions', () => {
    setPairings([
      {
        root: at(),
        testsDir: at('tests'),
        sourceRoot: at('src'),
        suites: [
          { cut: at('tests', 'pay', 'PAY.errors.cut'), program: at('src', 'pay', 'PAY.cbl') },
          { cut: at('tests', 'pay', 'PAY.cut'), program: at('src', 'pay', 'PAY.cbl') },
          { cut: at('tests', 'LOST.cut'), program: null },
        ],
      },
    ]);
    const exists = () => true;
    assert.strictEqual(resolveCblPath(at('tests', 'pay', 'PAY.cut'), exists), at('src', 'pay', 'PAY.cbl'));
    assert.deepStrictEqual(pairedSuites(at('src', 'pay', 'PAY.cbl')), [
      at('tests', 'pay', 'PAY.cut'),
      at('tests', 'pay', 'PAY.errors.cut'),
    ]);
    assert.strictEqual(pairedProgram(at('tests', 'LOST.cut')), undefined);
    assert.deepStrictEqual(suitesForProgram(at('src', 'pay', 'PAY.cbl'), exists, () => []), [
      at('tests', 'pay', 'PAY.cut'),
      at('tests', 'pay', 'PAY.errors.cut'),
    ]);
  });

  it('remembers a just-created suite until the next refresh', () => {
    rememberPairing(at('tests', 'NEW.cut'), at('src', 'NEW.cbl'));
    assert.strictEqual(resolveCblPath(at('tests', 'NEW.cut'), () => true), at('src', 'NEW.cbl'));
    assert.deepStrictEqual(pairedSuites(at('src', 'NEW.cbl')), [at('tests', 'NEW.cut')]);
  });

  it('falls back to the PROGRAM line, then to siblings by stem and base name', () => {
    const cut = at('tests', 'q3.cut');
    const declared = resolveCblPath(cut, () => true, () => 'TESTSUITE "q3"\nPROGRAM "../src/PAY.cbl"\n');
    assert.strictEqual(declared, at('src', 'PAY.cbl'));

    const named = at('src', 'PAY.errors.cut');
    assert.strictEqual(resolveCblPath(named, (f) => f === at('src', 'PAY.cbl'), () => undefined), at('src', 'PAY.cbl'));
  });

  it('finds the sibling suite of an uppercase PROG.CBL without the CLI pairing', () => {
    const program = at('UPPROG.CBL');
    const exists = (f: string) => f === program || f === at('UPPROG.cut');
    assert.deepStrictEqual(suitesForProgram(program, exists, () => ['UPPROG.CBL', 'UPPROG.cut']), [at('UPPROG.cut')]);
  });

  it('names the sibling path for a new suite, with an optional topic', () => {
    assert.strictEqual(resolveCutPath(at('PAY.cbl')), at('PAY.cut'));
    assert.strictEqual(resolveCutPath(at('PAY.cbl'), 'errors'), at('PAY.errors.cut'));
  });
});
