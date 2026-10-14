// src/discovery/suitePairing.ts
//
// Which program each .cut suite tests, as the CLI decides it. A suite can
// name its program with a `PROGRAM "<path>"` line, sit beside it as
// PROG.cut / PROG.<topic>.cut, or live under tests/ mirroring the
// program's folder -- see the mocky-mock repo's mockymock/cli/discovery.py
// for the full lookup. Rather than keep a second copy of those rules, the
// extension asks `mockymock suites --json` (suiteIndexService.ts) and
// stores the answer here; cutDiscovery.ts consults it first and only falls
// back to its own PROGRAM-line + sibling rules for a suite the CLI hasn't
// paired (an older bundled CLI, or a file created since the last refresh).
//
// Pure (no `vscode` import) so mocha can test it.
import * as path from 'path';

export interface SuitePairing {
  cut: string;
  program: string | null;
  rule?: string;
  error?: string;
}

export interface SuitesListing {
  root: string;
  testsDir: string;
  sourceRoot: string;
  suites: SuitePairing[];
}

export interface ProgramSuites {
  program: string;
  suites: string[];
  newSuitePath: string;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// `mockymock suites --json` (no program): every suite with its program.
export function parseSuitesListing(stdout: string): SuitesListing | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (!isObject(parsed) || !Array.isArray(parsed.suites)) return undefined;
  const suites: SuitePairing[] = [];
  for (const row of parsed.suites) {
    if (!isObject(row) || typeof row.cut !== 'string') continue;
    suites.push({
      cut: row.cut,
      program: typeof row.program === 'string' ? row.program : null,
      rule: typeof row.rule === 'string' ? row.rule : undefined,
      error: typeof row.error === 'string' ? row.error : undefined,
    });
  }
  return {
    root: String(parsed.root ?? ''),
    testsDir: String(parsed.testsDir ?? ''),
    sourceRoot: String(parsed.sourceRoot ?? ''),
    suites,
  };
}

// `mockymock suites PROG.cbl [--name N] --json`: one program's suites and
// where a new one goes.
export function parseProgramSuites(stdout: string): ProgramSuites | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return undefined;
  }
  if (
    !isObject(parsed) ||
    typeof parsed.program !== 'string' ||
    typeof parsed.newSuitePath !== 'string' ||
    !Array.isArray(parsed.suites)
  ) {
    return undefined;
  }
  return {
    program: parsed.program,
    suites: parsed.suites.filter((s): s is string => typeof s === 'string'),
    newSuitePath: parsed.newSuitePath,
  };
}

// Same grammar as the CLI parser's PROGRAM_RE; only legal before the first
// TESTCASE, so scanning stops there.
const PROGRAM_LINE_RE = /^PROGRAM\s+"([^"]*)"$/;

export function readProgramLine(text: string): string | undefined {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith('TESTCASE')) break;
    const match = PROGRAM_LINE_RE.exec(line);
    if (match) return match[1];
  }
  return undefined;
}

// PAYROLL.errors.cut -> PAYROLL: one program, several suites.
export function suiteBaseName(cutPath: string): string {
  return path.basename(cutPath).split('.')[0];
}

// A topic for `PROG.<topic>.cut`: one file-name segment, no dots (the
// first dot ends the base name) and nothing a file system rejects.
export function validateSuiteTopic(topic: string): string | undefined {
  const trimmed = topic.trim();
  if (!trimmed) return 'Give the suite a short name, like "errors".';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(trimmed)) {
    return 'Use letters, digits, "-" and "_" only, like "errors" or "month-end".';
  }
  return undefined;
}

function key(p: string): string {
  const resolved = path.resolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

let cutToProgram = new Map<string, string>();
let programToCuts = new Map<string, string[]>();

// Replaces everything known with the latest listings (one per workspace
// folder). A suite the CLI couldn't pair is left out, so callers fall back.
export function setPairings(listings: SuitesListing[]): void {
  const nextCut = new Map<string, string>();
  const nextProgram = new Map<string, string[]>();
  for (const listing of listings) {
    for (const row of listing.suites) {
      if (!row.program) continue;
      nextCut.set(key(row.cut), row.program);
      const suites = nextProgram.get(key(row.program)) ?? [];
      if (!suites.some((s) => key(s) === key(row.cut))) suites.push(row.cut);
      nextProgram.set(key(row.program), suites);
    }
  }
  for (const suites of nextProgram.values()) suites.sort();
  cutToProgram = nextCut;
  programToCuts = nextProgram;
}

// Records one pairing ahead of the next CLI refresh -- a suite New Test
// Suite just wrote under tests/ must lint against the right program the
// moment it opens, before the watcher-triggered refresh lands.
export function rememberPairing(cutPath: string, programPath: string): void {
  cutToProgram.set(key(cutPath), programPath);
  const suites = programToCuts.get(key(programPath)) ?? [];
  if (!suites.some((s) => key(s) === key(cutPath))) {
    suites.push(cutPath);
    suites.sort();
  }
  programToCuts.set(key(programPath), suites);
}

export function pairedProgram(cutPath: string): string | undefined {
  return cutToProgram.get(key(cutPath));
}

export function pairedSuites(programPath: string): string[] {
  return programToCuts.get(key(programPath)) ?? [];
}
