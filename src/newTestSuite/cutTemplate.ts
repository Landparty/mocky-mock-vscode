// Pure, vscode-independent pieces of the "New Test Suite" command -- kept
// free of the vscode import (like export/exportRunner.ts) so they're
// unit-testable under mocha.
// newTestSuite.ts (vscode-touching command registration) is the only
// production consumer.
import * as path from 'path';
import { copybookPathArgs } from '../environment/copybookPaths';
import { buildOutline, OutlineNode } from '../outline/outlineModel';

// `mockymock generate <program> --output <cut> [--per-paragraph]
// [--copybook-path DIR ...]`: the CLI's own Docker-free scaffolder, every
// CALL / file / SQL / CICS / DLI boundary it finds already stubbed with a
// MOCK block. On a current CLI that's one TESTCASE per scenario by default;
// `--per-paragraph` asks for one per paragraph that touches a boundary
// (only pass it when the CLI supports it). Preferred over buildStarterCut
// below whenever the CLI is available, because it knows the program's
// real boundaries.
export function buildGenerateArgs(
  cblPath: string,
  outputPath: string,
  copybookPaths: string[],
  perParagraph = false,
  extraCopybookPaths: string[] = []
): string[] {
  const args = ['generate', cblPath, '--output', outputPath];
  if (perParagraph) args.push('--per-paragraph');
  return [...args, ...copybookPathArgs(copybookPaths, extraCopybookPaths)];
}

// `mockymock init <program> --output <cut> [--copybook-path DIR ...]`:
// generate one case per scenario, run them once in Docker, and write the
// values the program produced as EXPECT lines -- a characterization suite
// that pins today's behavior. Needs Docker; see parseInitOutcome.
export function buildInitArgs(
  cblPath: string,
  outputPath: string,
  copybookPaths: string[],
  extraCopybookPaths: string[] = []
): string[] {
  return ['init', cblPath, '--output', outputPath, ...copybookPathArgs(copybookPaths, extraCopybookPaths)];
}

export interface InitOutcome {
  // `run --record-expectations`' "recorded N" count, null when the run
  // step never reported one.
  recorded: number | null;
  // init found Docker not ready (its own doctor check, stricter than
  // `docker info`) and stopped after generating: the suite has no
  // assertions yet.
  dockerSkipped: boolean;
}

export function parseInitOutcome(stdout: string): InitOutcome {
  const recorded = /--record-expectations: recorded (\d+)/.exec(stdout);
  return {
    recorded: recorded ? Number(recorded[1]) : null,
    dockerSkipped: /could not run it to record expected values/.test(stdout),
  };
}

// The toast after the beaker wrote a suite. `recorded` set means init ran
// the suite and wrote EXPECT lines; otherwise the message says what the
// generated file does assert (`assertions`, counted from the file: current
// CLIs write VERIFY ... WAS CALLED lines, and EXPECTs for values they can
// fold), why nothing was recorded (`dockerDown`) and what to do next.
// `cblArg` / `cutArg`: the paths for the suggested command, as they resolve
// from the integrated terminal (workspace-relative, quoted) -- a suite
// under tests/ sits in another folder than its program, so bare names
// never both resolve. Default to the names.
export interface CreatedSuite {
  cblName: string;
  cutName: string;
  caseCount: number | null;
  perParagraph: boolean;
  recorded?: number | null;
  dockerDown?: boolean;
  assertions?: AssertionCount;
  cblArg?: string;
  cutArg?: string;
}

export function describeCreatedSuite(suite: CreatedSuite): string {
  const n = suite.caseCount;
  const cases = n === null ? 'a starter test suite' : `${n} test case${n === 1 ? '' : 's'}`;
  if (suite.recorded !== undefined) {
    const values =
      suite.recorded === null ? '' : ` (${suite.recorded} value${suite.recorded === 1 ? '' : 's'})`;
    return (
      `mockymock: created ${suite.cutName} with ${cases}. Its EXPECT lines record what the program does ` +
      `today${values}, so a change that alters that behavior turns them red.`
    );
  }
  const shape = suite.perParagraph ? ' (one per paragraph)' : '';
  const verify = suite.assertions?.verify ?? 0;
  const expect = suite.assertions?.expect ?? 0;
  let asserted: string;
  let passes = '';
  if (verify + expect === 0) {
    asserted = 'Every boundary is mocked, but nothing is asserted yet.';
    passes = ' The cases pass as long as the program runs.';
  } else {
    const checks = [
      verify ? `call counts (${verify} VERIFY line${verify === 1 ? '' : 's'})` : '',
      expect ? `${expect} field value${expect === 1 ? '' : 's'} (EXPECT)` : '',
    ]
      .filter(Boolean)
      .join(' and ');
    asserted =
      `Every boundary is mocked and ${checks} ${verify === 0 && expect === 1 ? 'is' : 'are'} asserted` +
      (expect ? '.' : ', but no field values are asserted yet.');
  }
  const why = suite.dockerDown
    ? " Docker isn't running, so mockymock couldn't record what the program does today."
    : '';
  const next = suite.dockerDown
    ? ` Once Docker is up, run "mockymock run ${suite.cblArg ?? suite.cblName} --cut ${suite.cutArg ?? suite.cutName} ` +
      '--record-expectations" to fill in its STUB EXPECT lines.'
    : ' Fill in the MOVE and EXPECT lines, then press play.';
  return `mockymock: created ${suite.cutName} with ${cases}${shape}. ${asserted}${why}${passes}${next}`;
}

// A path as one argument of a command pasted into a terminal: quoted when
// it holds whitespace (double quotes work in sh, PowerShell and cmd alike).
export function shellArg(p: string): string {
  return /\s/.test(p) ? `"${p}"` : p;
}

export interface AssertionCount {
  verify: number;
  expect: number;
}

// The live VERIFY / EXPECT lines in a generated .cut -- `*> STUB EXPECT`
// comments are hints, not assertions.
export function countAssertions(cutText: string): AssertionCount {
  let verify = 0;
  let expect = 0;
  for (const line of cutText.split(/\r?\n/)) {
    if (/^\s*VERIFY\b/i.test(line)) verify++;
    else if (/^\s*EXPECT\b/i.test(line)) expect++;
  }
  return { verify, expect };
}

// The toast when the CLI's scaffold had no test cases (a program with no
// boundary to mock) and the starter template took its place.
export function describeEmptyScaffold(cblName: string, cutName: string): string {
  return (
    `mockymock: created a basic ${cutName}. ${cblName} has no CALL, file, SQL, CICS or IMS boundary to mock, ` +
    'so mockymock generate wrote no test cases; the starter case runs its first paragraph instead. ' +
    'Fill in the MOVE and EXPECT lines, then press play.'
  );
}

// The toast when the CLI wrote the full scaffold but lint refuses it.
export function describeLintRefusedSuite(cutName: string, refusal: string): string {
  return (
    `mockymock: created ${cutName} with every boundary mocked, but lint refuses it for a reason no MOCK block ` +
    `can fix, so it won't run until that's resolved: ${refusal}`
  );
}

interface CliOutput {
  code: number;
  stdout: string;
  stderr: string;
}

// `generate` (and `init`, which runs it first) wrote the full scaffold but
// exits 1 because lint refuses it for a reason no MOCK block can fix; the
// refusals are on stdout, stderr only points back at them.
// A current CLI refuses to write a per-paragraph suite with no TESTCASE
// (mocky-mock #275) where an older one wrote it empty: either way the
// program has no boundary to mock, and the starter takes over.
export function isNoCaseRefusal(result: CliOutput): boolean {
  return /no test case to write/.test(result.stdout);
}

// init exits 1 when recording left no case asserting anything (mocky-mock
// #275): the suite was written and ran, it just pins nothing yet.
export function initAssertsNothing(result: CliOutput): boolean {
  return /none of its test cases asserts anything/.test(result.stdout);
}

export function lintRefusalOf(result: CliOutput): string | undefined {
  if (!/was written, but `lint` refuses it/.test(result.stdout + result.stderr)) return undefined;
  return refusalLine(result.stdout) ?? firstLine(result.stderr) ?? 'see Show Details';
}

function lines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function firstLine(text: string): string | undefined {
  return lines(text)[0];
}

// The first `refused (CODE): ...` line, without its "mockymock <cmd>: " prefix.
function refusalLine(stdout: string): string | undefined {
  return lines(stdout)
    .find((line) => /\brefused \([A-Z_]+\)/.test(line))
    ?.replace(/^mockymock [a-z-]+: /, '');
}

// Why a CLI step failed, for a toast: a lint refusal on stdout beats
// stderr's first line, which beats stdout's.
export function failureReason(result: CliOutput): string {
  return refusalLine(result.stdout) ?? firstLine(result.stderr) ?? firstLine(result.stdout) ?? `exit code ${result.code}`;
}

// Why init's recording run failed. init prints everything on stdout,
// starting with its own progress lines, so neither stream's first line
// says anything: prefer run's own error (a compile failure or refusal
// first), then whatever followed "running ... to record expected values".
export function initRecordingFailure(result: CliOutput): string | undefined {
  const out = lines(result.stdout);
  const runLines = out.filter((line) => line.startsWith('mockymock run:'));
  const preferred = runLines.find((line) => /compile failed|refused \(/.test(line)) ?? runLines[0];
  if (preferred) return preferred;
  const running = out.findIndex((line) => /^mockymock init: running .* to record expected values/.test(line));
  const after = running >= 0 ? out.slice(running + 1).find((line) => !line.startsWith('mockymock init:')) : undefined;
  return after ?? firstLine(result.stderr);
}

// The CLI prints "mockymock generate: wrote N test case(s) -> path" on
// success; the count makes the confirmation toast concrete ("3 test cases"
// beats "done"). Null when the line isn't there (older CLI wording).
export function parseGeneratedCaseCount(stdout: string): number | null {
  const match = /wrote\s+(\d+)\s+test case/i.exec(stdout);
  return match ? Number(match[1]) : null;
}

export interface StarterCutFacts {
  programName: string;
  // The PERFORM target: the first paragraph, or the first section of a
  // program written with sections only (PERFORM accepts either).
  firstParagraph: string | undefined;
}

function firstParagraphIn(nodes: OutlineNode[]): string | undefined {
  for (const node of nodes) {
    if (node.kind === 'paragraph') return node.name;
    const nested = firstParagraphIn(node.children);
    if (nested) return nested;
  }
  return undefined;
}

// What the fallback template needs from the program source: its PROGRAM-ID
// (falling back to the file stem, which is also what the paired .cut is
// named after) and the first PROCEDURE DIVISION paragraph (else section),
// which is the natural first PERFORM target. Reuses the Outline panel's own scanner so
// the template and the Outline agree on what counts as a paragraph.
export function starterCutFacts(cblPath: string, sourceLines: string[]): StarterCutFacts {
  const outline = buildOutline(sourceLines);
  let programName: string | undefined;
  let firstParagraph: string | undefined;
  for (const division of outline) {
    if (division.name === 'IDENTIFICATION DIVISION') {
      programName = division.children.find((c) => c.kind === 'programId')?.name;
    } else if (division.name === 'PROCEDURE DIVISION') {
      // The Outline names a section "X SECTION"; PERFORM takes the bare name.
      firstParagraph =
        firstParagraphIn(division.children) ??
        division.children.find((c) => c.kind === 'section')?.name.replace(/\s+SECTION$/i, '');
    }
  }
  return { programName: programName ?? path.parse(cblPath).name, firstParagraph };
}

// A minimal, valid .cut for when `mockymock generate` isn't available (no
// CLI yet, a CLI predating `generate`, or a program it refuses to parse):
// one TESTSUITE, one TESTCASE with a PERFORM of the first paragraph, and
// commented-out MOVE/EXPECT lines showing where inputs and assertions go.
// Every `*>` line is a legal .cut comment; there is nothing here the CLI's
// parser would reject, so the suite is runnable as-is and the Test Explorer
// picks it up immediately.
// `programLine`: the PROGRAM path to write after TESTSUITE (relative to the
// suite), for a suite that doesn't sit beside its program -- the starter is
// the no-CLI fallback, so it can't count on the CLI's tests/ mirroring.
export function buildStarterCut(facts: StarterCutFacts, programLine?: string): string {
  const performTarget = facts.firstParagraph ?? 'MAIN-PARAGRAPH';
  const caseName = facts.firstParagraph
    ? `${facts.firstParagraph} runs without error`
    : 'first paragraph runs without error';
  const lines = [
    `*> Test suite for ${facts.programName}.`,
    '*> Each TESTCASE sets up inputs (MOVE), runs one paragraph (PERFORM),',
    '*> then checks results (EXPECT). Mock any CALL, file, SQL, CICS or DLI',
    '*> boundary the paragraph touches with a MOCK ... END-MOCK block.',
    '*> Type "testcase" or "mock-call" in this file for snippets.',
    `TESTSUITE "${facts.programName}"`,
    ...(programLine ? [`PROGRAM "${programLine}"`] : []),
    '',
    `TESTCASE "${caseName}"`,
    '*>  MOVE 100 TO WS-INPUT-FIELD',
    `    PERFORM ${performTarget}`,
    '*>  EXPECT WS-RESULT-FIELD TO BE 100',
    '',
  ];
  return lines.join('\n');
}
