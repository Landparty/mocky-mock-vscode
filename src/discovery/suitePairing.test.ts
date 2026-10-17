import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveCblPath, resolveCutPath, suitesForProgram } from './cutDiscovery';
import {
  parseProgramSuites,
  parseSuitesListing,
  pairedProgram,
  pairedSuites,
  pairingError,
  isProjectConfigFile,
  projectConfigDir,
  readProgramLine,
  rememberPairing,
  setPairings,
  suiteBaseName,
  validateSuiteTopic,
} from './suitePairing';

// Resolved, so on Windows it carries a drive like the paths VS Code hands out.
const root = path.resolve(path.sep, 'repo');
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

  it("keeps the CLI's reason for a suite it could not pair, until the suite is paired", () => {
    const ambiguous = '2 programs named PAY under src (src/a/PAY.cbl, src/b/PAY.cbl); add a PROGRAM line';
    setPairings([
      {
        root: at(),
        testsDir: at('tests'),
        sourceRoot: at('src'),
        suites: [
          { cut: at('tests', 'PAY.cut'), program: null, error: ambiguous },
          { cut: at('tests', 'OK.cut'), program: at('src', 'OK.cbl') },
          { cut: at('tests', 'LOST.cut'), program: null },
        ],
      },
    ]);
    assert.strictEqual(pairingError(at('tests', 'PAY.cut')), ambiguous);
    assert.strictEqual(pairingError(at('tests', 'OK.cut')), undefined);
    assert.strictEqual(pairingError(at('tests', 'LOST.cut')), undefined);
    rememberPairing(at('tests', 'PAY.cut'), at('src', 'a', 'PAY.cbl'));
    assert.strictEqual(pairingError(at('tests', 'PAY.cut')), undefined);
  });

  it("lets a nested project's listing win over the workspace root's for the suites it lists", () => {
    const cut = at('proj', 'tests', 'PAY.cut');
    setPairings([
      { root: at(), testsDir: at('tests'), sourceRoot: at('src'), suites: [{ cut, program: null, error: '2 programs named PAY' }] },
      {
        root: at('proj'),
        testsDir: at('proj', 'tests'),
        sourceRoot: at('proj', 'cobol'),
        suites: [{ cut, program: at('proj', 'cobol', 'PAY.cbl'), rule: 'mirror' }],
      },
    ]);
    assert.strictEqual(pairedProgram(cut), at('proj', 'cobol', 'PAY.cbl'));
    assert.strictEqual(pairingError(cut), undefined);
    assert.deepStrictEqual(pairedSuites(at('proj', 'cobol', 'PAY.cbl')), [cut]);
  });

  it('runs the CLI from the nearest project config between a file and its workspace folder', () => {
    const files = new Map<string, string>([
      [at('proj', 'mockymock.toml'), 'source_root = "cobol"\n'],
      [at('py', 'pyproject.toml'), '[tool.black]\nline-length = 88\n'],
      [at('py2', 'pyproject.toml'), '[tool.mockymock]\ntest_root = "tests"\n'],
    ]);
    const exists = (p: string) => files.has(p);
    const read = (p: string) => files.get(p);
    assert.strictEqual(projectConfigDir(at('proj', 'cobol'), at(), exists, read), at('proj'));
    assert.strictEqual(projectConfigDir(at('proj'), at(), exists, read), at('proj'));
    assert.strictEqual(projectConfigDir(at('other', 'cobol'), at(), exists, read), at());
    assert.strictEqual(projectConfigDir(at('py', 'src'), at(), exists, read), at());
    assert.strictEqual(projectConfigDir(at('py2', 'src'), at(), exists, read), at('py2'));
    assert.strictEqual(projectConfigDir(path.join(path.sep, 'elsewhere'), at(), exists, read), at());
    assert.strictEqual(isProjectConfigFile(at('py', 'pyproject.toml'), read), false);
    assert.strictEqual(isProjectConfigFile(at('py2', 'pyproject.toml'), read), true);
    assert.strictEqual(isProjectConfigFile(at('x', 'cobol.yml'), () => undefined), true);
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

describe('suitePairing through a symlinked workspace', () => {
  let tmp: string;
  afterEach(() => {
    setPairings([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it('pairs a suite opened through a symlink the way the CLI (which reports realpaths) does', function () {
    // .native: on Windows it also expands 8.3 short names (RUNNER~1), as
    // Python's Path.resolve() does for the CLI's paths.
    tmp = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), 'mockymock-link-')));
    const real = path.join(tmp, 'real', 'proj');
    const link = path.join(tmp, 'linkproj');
    fs.mkdirSync(path.join(real, 'src', 'pay'), { recursive: true });
    fs.mkdirSync(path.join(real, 'tests', 'pay'), { recursive: true });
    fs.writeFileSync(path.join(real, 'src', 'pay', 'PAYCALC.cbl'), '');
    fs.writeFileSync(path.join(real, 'tests', 'pay', 'PAYCALC.cut'), 'TESTSUITE "s"\n');
    try {
      fs.symlinkSync(real, link, 'dir');
    } catch {
      this.skip(); // no symlink permission (Windows without developer mode)
    }
    setPairings([
      {
        root: real,
        testsDir: path.join(real, 'tests'),
        sourceRoot: path.join(real, 'src'),
        suites: [
          {
            cut: path.join(real, 'tests', 'pay', 'PAYCALC.cut'),
            program: path.join(real, 'src', 'pay', 'PAYCALC.cbl'),
            rule: 'mirror',
          },
        ],
      },
    ]);
    const linkedCut = path.join(link, 'tests', 'pay', 'PAYCALC.cut');
    const linkedProgram = path.join(link, 'src', 'pay', 'PAYCALC.cbl');
    // Answered in the workspace's own (symlinked) spelling, both ways.
    assert.strictEqual(resolveCblPath(linkedCut), linkedProgram);
    assert.deepStrictEqual(pairedSuites(linkedProgram), [linkedCut]);
    assert.deepStrictEqual(suitesForProgram(linkedProgram), [linkedCut]);
  });
});
