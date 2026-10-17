// Pure, vscode-independent pieces of the "New Test Suite" command -- kept
// free of the vscode import (like export/exportRunner.ts) so they're
// unit-testable under mocha.
// newTestSuite.ts (vscode-touching command registration) is the only
// production consumer.
import * as path from 'path';
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
  perParagraph = false
): string[] {
  const args = ['generate', cblPath, '--output', outputPath];
  if (perParagraph) args.push('--per-paragraph');
  for (const p of copybookPaths) args.push('--copybook-path', p);
  return args;
}

// `mockymock init <program> --output <cut> [--copybook-path DIR ...]`:
// generate one case per scenario, run them once in Docker, and write the
// values the program produced as EXPECT lines -- a characterization suite
// that pins today's behavior. Needs Docker; see parseInitOutcome.
export function buildInitArgs(cblPath: string, outputPath: string, copybookPaths: string[]): string[] {
  const args = ['init', cblPath, '--output', outputPath];
  for (const p of copybookPaths) args.push('--copybook-path', p);
  return args;
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
// the suite and wrote EXPECT lines; otherwise the suite asserts nothing yet
// and the message says why (`dockerDown`) and what to do next.
export interface CreatedSuite {
  cblName: string;
  cutName: string;
  caseCount: number | null;
  perParagraph: boolean;
  recorded?: number | null;
  dockerDown?: boolean;
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
  const why = suite.dockerDown
    ? " Docker isn't running, so mockymock couldn't record what the program does today."
    : '';
  const next = suite.dockerDown
    ? ` Once Docker is up, run "mockymock run ${suite.cblName} --cut ${suite.cutName} --record-expectations" ` +
      'to fill in its STUB EXPECT lines.'
    : ' Fill in the MOVE and EXPECT lines, then press play.';
  return (
    `mockymock: created ${suite.cutName} with ${cases}${shape}. Every boundary is mocked, but nothing is asserted yet.` +
    `${why} The cases pass as long as the program runs.${next}`
  );
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
