import assert from 'node:assert/strict';
import {
  buildGenerateArgs,
  buildInitArgs,
  buildStarterCut,
  countAssertions,
  describeCreatedSuite,
  describeEmptyScaffold,
  failureReason,
  initRecordingFailure,
  lintRefusalOf,
  parseGeneratedCaseCount,
  parseInitOutcome,
  shellArg,
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

describe('describeCreatedSuite with paths and assertions', () => {
  const base = { cblName: 'PAY.cbl', cutName: 'PAY.cut', caseCount: 1, perParagraph: false };

  it('suggests a run command with workspace-relative paths for a suite under tests/', () => {
    const text = describeCreatedSuite({ ...base, dockerDown: true, cblArg: 'src/pay/PAY.cbl', cutArg: 'tests/pay/PAY.cut' });
    assert.match(text, /"mockymock run src\/pay\/PAY\.cbl --cut tests\/pay\/PAY\.cut --record-expectations"/);
  });

  it('says call counts are asserted when the scaffold has VERIFY lines', () => {
    const text = describeCreatedSuite({ ...base, dockerDown: true, assertions: { verify: 1, expect: 0 } });
    assert.match(text, /call counts \(1 VERIFY line\) are asserted, but no field values are asserted yet\./);
    assert.doesNotMatch(text, /nothing is asserted/);
    assert.doesNotMatch(text, /pass as long as the program runs/);
  });

  it('counts folded EXPECTs too', () => {
    const text = describeCreatedSuite({ ...base, assertions: { verify: 3, expect: 2 } });
    assert.match(text, /call counts \(3 VERIFY lines\) and 2 field values \(EXPECT\) are asserted\./);
  });

  it('keeps "nothing is asserted" for a file with no assertions', () => {
    assert.match(describeCreatedSuite({ ...base, assertions: { verify: 0, expect: 0 } }), /nothing is asserted yet/);
  });
});

describe('shellArg', () => {
  it('quotes only a path with whitespace', () => {
    assert.equal(shellArg('tests/pay/PAY.cut'), 'tests/pay/PAY.cut');
    assert.equal(shellArg('my src/PAY.cbl'), '"my src/PAY.cbl"');
  });
});

describe('countAssertions', () => {
  it('counts VERIFY and EXPECT lines but not STUB EXPECT comments', () => {
    const cut = [
      'TESTSUITE "ORDRPROC"',
      'TESTCASE "happy path"',
      '    *> STUB EXPECT UT-CAP-DISCRATE-1 -- the value the program actually passed to this CALL',
      '    VERIFY CALL "DISCRATE" WAS CALLED 1 TIMES',
      '    EXPECT WS-TOTAL TO BE 622',
    ].join('\n');
    assert.deepEqual(countAssertions(cut), { verify: 1, expect: 1 });
  });
});

describe('describeEmptyScaffold', () => {
  it('explains the starter fallback instead of promising mocks', () => {
    const text = describeEmptyScaffold('CALC.cbl', 'CALC.cut');
    assert.match(text, /created a basic CALC\.cut/);
    assert.match(text, /no CALL, file, SQL, CICS or IMS boundary/);
    assert.doesNotMatch(text, /Every boundary is mocked/);
  });
});

describe('lintRefusalOf / failureReason', () => {
  // generate's output when it wrote the scaffold and lint refuses it (mocky-mock #231).
  const refused = {
    code: 1,
    stdout:
      'mockymock generate: wrote 1 test case(s) -> VSAMKSDS.cut\n' +
      'mockymock generate: .cut line 3: TESTCASE "happy path" refused (UNSUPPORTED_NESTED_MOCK_TARGET): nested\n',
    stderr: 'mockymock generate: VSAMKSDS.cut was written, but `lint` refuses it for the reason(s) above -- no MOCK block can fix them\n',
  };

  it('names the refusal from stdout', () => {
    assert.equal(lintRefusalOf(refused), '.cut line 3: TESTCASE "happy path" refused (UNSUPPORTED_NESTED_MOCK_TARGET): nested');
    assert.match(failureReason(refused), /^\.cut line 3: .*UNSUPPORTED_NESTED_MOCK_TARGET/);
  });

  it('is undefined for any other failure, whose reason is stderr first', () => {
    const other = { code: 1, stdout: 'progress\n', stderr: 'mockymock generate: no such file: X.cbl\n' };
    assert.equal(lintRefusalOf(other), undefined);
    assert.equal(failureReason(other), 'mockymock generate: no such file: X.cbl');
  });
});

describe('initRecordingFailure', () => {
  const head =
    'mockymock init: scaffolding INVUPDT.cut from INVUPDT.cbl (--with-data)\n' +
    'mockymock generate: wrote 1 test case(s) -> INVUPDT.cut\n' +
    'mockymock init: running INVUPDT.cut to record expected values\n';
  const tail = 'mockymock init: INVUPDT.cut was written, but recording its expected values failed (see above)\n';

  it("picks run's own error, not init's progress line", () => {
    const result = {
      code: 1,
      stdout: head + 'mockymock run: Docker is required: ...\nfailed to connect\n' + tail,
      stderr: '',
    };
    assert.equal(initRecordingFailure(result), 'mockymock run: Docker is required: ...');
  });

  it('prefers a compile failure over other run lines', () => {
    const result = {
      code: 1,
      stdout: head + 'mockymock run: building\nmockymock run: compile failed: INVUPDT.cbl:12: error\n' + tail,
      stderr: '',
    };
    assert.equal(initRecordingFailure(result), 'mockymock run: compile failed: INVUPDT.cbl:12: error');
  });

  it('falls back to the line after "running ..." and then to nothing', () => {
    assert.equal(initRecordingFailure({ code: 1, stdout: head + 'FAIL happy path\n' + tail, stderr: '' }), 'FAIL happy path');
    assert.equal(initRecordingFailure({ code: 1, stdout: head + tail, stderr: '' }), undefined);
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

  it('falls back to the first SECTION for a program written with sections only', () => {
    const facts = starterCutFacts('/w/PROG.cbl', [
      `${AREA_A}IDENTIFICATION DIVISION.`,
      `${AREA_A}PROGRAM-ID. PROG.`,
      `${AREA_A}DATA DIVISION.`,
      `${AREA_A}WORKING-STORAGE SECTION.`,
      `${AREA_A}01 WS-A PIC 9(4) VALUE 0.`,
      `${AREA_A}PROCEDURE DIVISION.`,
      `${AREA_A}MAIN-LOGIC SECTION.`,
      `${AREA_B}ADD 1 TO WS-A`,
      `${AREA_B}PERFORM CALC-LOGIC`,
      `${AREA_B}GOBACK.`,
      `${AREA_A}CALC-LOGIC SECTION.`,
      `${AREA_B}ADD 2 TO WS-A.`,
    ]);
    assert.equal(facts.firstParagraph, 'MAIN-LOGIC');
  });

  it('falls back to the file stem when there is no PROGRAM-ID', () => {
    const facts = starterCutFacts('/w/CUSTPROG.cbl', [`${AREA_A}PROCEDURE DIVISION.`]);
    assert.equal(facts.programName, 'CUSTPROG');
    assert.equal(facts.firstParagraph, undefined);
  });
});

describe('buildStarterCut', () => {
  it('names the program on a PROGRAM line right after TESTSUITE when given one', () => {
    const lines = buildStarterCut({ programName: 'PAY', firstParagraph: 'MAIN' }, '../../src/PAY.cbl').split('\n');
    const suiteAt = lines.indexOf('TESTSUITE "PAY"');
    assert.strictEqual(lines[suiteAt + 1], 'PROGRAM "../../src/PAY.cbl"');
    assert.ok(!buildStarterCut({ programName: 'PAY', firstParagraph: 'MAIN' }).includes('PROGRAM "'));
  });

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
