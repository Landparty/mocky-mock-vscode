// Pure, vscode-independent pieces of the "New Test Suite" command -- kept
// free of the vscode import (like export/exportRunner.ts and
// generateData/generateDataRunner.ts) so they're unit-testable under mocha.
// newTestSuite.ts (vscode-touching command registration) is the only
// production consumer.
import * as path from 'path';
import { buildOutline, OutlineNode } from '../outline/outlineModel';

// `mockymock generate <program> -o <cut> [--copybook-path DIR ...]`: the
// CLI's own Docker-free scaffolder -- one TESTCASE per paragraph, every
// CALL / file / SQL / CICS / DLI boundary it finds already stubbed with a
// MOCK block. Preferred over buildStarterCut below whenever the CLI is
// available, because it knows the program's real boundaries.
export function buildGenerateArgs(cblPath: string, outputPath: string, copybookPaths: string[]): string[] {
  const args = ['generate', cblPath, '--output', outputPath];
  for (const p of copybookPaths) args.push('--copybook-path', p);
  return args;
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
// named after) and the first PROCEDURE DIVISION paragraph, which is the
// natural first PERFORM target. Reuses the Outline panel's own scanner so
// the template and the Outline agree on what counts as a paragraph.
export function starterCutFacts(cblPath: string, sourceLines: string[]): StarterCutFacts {
  const outline = buildOutline(sourceLines);
  let programName: string | undefined;
  let firstParagraph: string | undefined;
  for (const division of outline) {
    if (division.name === 'IDENTIFICATION DIVISION') {
      programName = division.children.find((c) => c.kind === 'programId')?.name;
    } else if (division.name === 'PROCEDURE DIVISION') {
      firstParagraph = firstParagraphIn(division.children);
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
export function buildStarterCut(facts: StarterCutFacts): string {
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
    '',
    `TESTCASE "${caseName}"`,
    '*>  MOVE 100 TO WS-INPUT-FIELD',
    `    PERFORM ${performTarget}`,
    '*>  EXPECT WS-RESULT-FIELD TO BE 100',
    '',
  ];
  return lines.join('\n');
}
