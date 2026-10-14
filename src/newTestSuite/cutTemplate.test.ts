import assert from 'node:assert/strict';
import {
  buildGenerateArgs,
  buildInitArgs,
  buildStarterCut,
  describeCreatedSuite,
  parseGeneratedCaseCount,
  parseInitOutcome,
  starterCutFacts,
} from './cutTemplate';

const AREA_A = ' '.repeat(7);
const AREA_B = ' '.repeat(11);

describe('buildGenerateArgs', () => {
  it('invokes the Docker-free scaffolder with an explicit output path', () => {
    assert.deepEqual(buildGenerateArgs('/w/PROG.cbl', '/w/PROG.cut', []), [
      'generate',
      '/w/PROG.cbl',
      '--output',
      '/w/PROG.cut',
    ]);
  });

  it('passes every copybook path through', () => {
    assert.deepEqual(buildGenerateArgs('/w/PROG.cbl', '/w/PROG.cut', ['/w/cpy', '/lib/cpy']), [
      'generate',
      '/w/PROG.cbl',
      '--output',
      '/w/PROG.cut',
      '--copybook-path',
      '/w/cpy',
      '--copybook-path',
      '/lib/cpy',
    ]);
  });
});

describe('buildGenerateArgs --per-paragraph', () => {
  it('adds the flag only when asked', () => {
    assert.deepEqual(buildGenerateArgs('/w/PROG.cbl', '/w/PROG.cut', ['/w/cpy'], true), [
      'generate',
      '/w/PROG.cbl',
      '--output',
      '/w/PROG.cut',
      '--per-paragraph',
      '--copybook-path',
      '/w/cpy',
    ]);
  });
});

describe('buildInitArgs', () => {
  it('runs init with an explicit output path and every copybook path', () => {
    assert.deepEqual(buildInitArgs('/w/PROG.cbl', '/w/PROG.cut', ['/w/cpy']), [
      'init',
      '/w/PROG.cbl',
      '--output',
      '/w/PROG.cut',
      '--copybook-path',
      '/w/cpy',
    ]);
  });
});

describe('parseInitOutcome', () => {
  // Wording transcribed from mocky-mock's _cmd_init / _cmd_run.
  it('reads the recorded count', () => {
    const stdout =
      'mockymock init: scaffolding PROG.cut from PROG.cbl (--with-data)\n' +
      'mockymock generate: wrote 1 test case(s) -> PROG.cut\n' +
      'mockymock init: running PROG.cut to record expected values\n' +
      'mockymock run: --record-expectations: recorded 4, skipped 0\n';
    assert.deepEqual(parseInitOutcome(stdout), { recorded: 4, dockerSkipped: false });
  });

  it("notices when init skipped the run because Docker wasn't ready", () => {
    const stdout =
      "mockymock init: Docker isn't available, so I generated a suite with real test data but could not " +
      "run it to record expected values. Run 'mockymock run PROG.cbl --cut PROG.cut --record-expectations' once";
    assert.deepEqual(parseInitOutcome(stdout), { recorded: null, dockerSkipped: true });
  });
});

describe('describeCreatedSuite', () => {
  const base = { cblName: 'PROG.cbl', cutName: 'PROG.cut', caseCount: 2, perParagraph: false };

  it('says the EXPECT lines record current behavior after init', () => {
    const text = describeCreatedSuite({ ...base, recorded: 5 });
    assert.match(text, /created PROG\.cut with 2 test cases\. Its EXPECT lines record what the program does today \(5 values\)/);
  });

  it("says nothing is asserted and why when Docker isn't running", () => {
    const text = describeCreatedSuite({ ...base, dockerDown: true });
    assert.match(text, /nothing is asserted yet/);
    assert.match(text, /Docker isn't running/);
    assert.match(text, /mockymock run PROG\.cbl --cut PROG\.cut --record-expectations/);
  });

  it('names the per-paragraph shape', () => {
    const text = describeCreatedSuite({ ...base, caseCount: 1, perParagraph: true });
    assert.match(text, /with 1 test case \(one per paragraph\)\. Every boundary is mocked, but nothing is asserted yet\./);
    assert.doesNotMatch(text, /Docker/);
  });
});

describe('parseGeneratedCaseCount', () => {
  it('reads the count from the CLI summary line', () => {
    assert.equal(parseGeneratedCaseCount('mockymock generate: wrote 3 test case(s) -> /w/PROG.cut\n'), 3);
  });

  it('returns null when the summary line is absent', () => {
    assert.equal(parseGeneratedCaseCount(''), null);
    assert.equal(parseGeneratedCaseCount('something else entirely'), null);
  });
});

describe('starterCutFacts', () => {
  it('takes the PROGRAM-ID and the first PROCEDURE DIVISION paragraph', () => {
    const facts = starterCutFacts('/w/ordrproc.cbl', [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID. ORDRPROC.`,
      `${AREA_A}PROCEDURE DIVISION.`,
      `${AREA_A}PROCESS-ORDER.`,
      `${AREA_B}CALL "DISCRATE" USING ORD-AMOUNT.`,
      `${AREA_A}FINISH.`,
      `${AREA_B}GOBACK.`,
    ]);
    assert.deepEqual(facts, { programName: 'ORDRPROC', firstParagraph: 'PROCESS-ORDER' });
  });

  it('finds a paragraph nested under a user-defined SECTION', () => {
    const facts = starterCutFacts('/w/PROG.cbl', [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID. PROG.`,
      `${AREA_A}PROCEDURE DIVISION.`,
      `${AREA_A}MAIN SECTION.`,
      `${AREA_A}DO-WORK.`,
      `${AREA_B}CONTINUE.`,
    ]);
    assert.equal(facts.firstParagraph, 'DO-WORK');
  });

  it('falls back to the file stem when there is no PROGRAM-ID', () => {
    const facts = starterCutFacts('/w/CUSTPROG.cbl', [`${AREA_A}PROCEDURE DIVISION.`]);
    assert.equal(facts.programName, 'CUSTPROG');
    assert.equal(facts.firstParagraph, undefined);
  });
});

describe('buildStarterCut', () => {
  it('produces a runnable suite that PERFORMs the first paragraph', () => {
    const text = buildStarterCut({ programName: 'ORDRPROC', firstParagraph: 'PROCESS-ORDER' });
    const lines = text.split('\n');
    assert.ok(lines.includes('TESTSUITE "ORDRPROC"'));
    assert.ok(lines.includes('TESTCASE "PROCESS-ORDER runs without error"'));
    assert.ok(lines.includes('    PERFORM PROCESS-ORDER'));
    // Exactly one TESTSUITE and one PERFORM: the CLI rejects a second of either.
    assert.equal(lines.filter((l) => l.startsWith('TESTSUITE')).length, 1);
    assert.equal(lines.filter((l) => /^\s*PERFORM\b/.test(l)).length, 1);
    // Every guidance line is a .cut comment, never a bare directive that
    // would fail to parse.
    for (const line of lines) {
      if (line.trim() === '') continue;
      assert.ok(
        /^(\*>|TESTSUITE|TESTCASE|\s+PERFORM)/.test(line),
        `unexpected non-comment, non-directive line in the starter: ${JSON.stringify(line)}`
      );
    }
    assert.ok(text.endsWith('\n'));
  });

  it('uses a placeholder PERFORM target when no paragraph was found', () => {
    const text = buildStarterCut({ programName: 'PROG', firstParagraph: undefined });
    assert.ok(text.includes('    PERFORM MAIN-PARAGRAPH'));
    assert.ok(text.includes('TESTCASE "first paragraph runs without error"'));
  });
});
