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
import * as fs from 'fs';
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

// The CLI's project config files, as it looks for them in each folder.
// A pyproject.toml only counts with a [tool.mockymock] table.
const CONFIG_FILE_NAMES = ['cobol.yml', 'cobol.yaml', 'mockymock.toml', 'pyproject.toml'];
const TOOL_MOCKYMOCK_RE = /^\s*\[tool\.mockymock[\].]/m;

export function isProjectConfigFile(
  filePath: string,
  readText: (p: string) => string | undefined
): boolean {
  const name = path.basename(filePath);
  if (!CONFIG_FILE_NAMES.includes(name)) return false;
  if (name !== 'pyproject.toml') return true;
  const text = readText(filePath);
  return text !== undefined && TOOL_MOCKYMOCK_RE.test(text);
}

// The folder of the nearest project config at or above `fromDir`, stopping
// at `stopDir` (the workspace folder) -- the cwd the CLI must run in to see
// the same project layout lint and run see from the suite's own folder.
// `stopDir` itself when there is none, which keeps the no-config behaviour.
export function projectConfigDir(
  fromDir: string,
  stopDir: string,
  exists: (p: string) => boolean,
  readText: (p: string) => string | undefined
): string {
  let dir = path.resolve(fromDir);
  const stop = path.resolve(stopDir);
  const relative = path.relative(stop, dir);
  if (path.isAbsolute(relative) || relative.split(path.sep)[0] === '..') return stop;
  for (;;) {
    if (dir === stop) return stop;
    for (const name of CONFIG_FILE_NAMES) {
      const candidate = path.join(dir, name);
      if (exists(candidate) && isProjectConfigFile(candidate, readText)) return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) return stop;
    dir = parent;
  }
}

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

function realpathOrResolve(p: string): string {
  try {
    return fs.realpathSync.native(p);
  } catch {
    return path.resolve(p);
  }
}

// The CLI reports every path through Python's Path.resolve(), which follows
// symlinks (and, on Windows, maps a subst or mapped drive to its target),
// while VS Code hands out paths spelled the way the workspace was opened.
// Keying both on the realpath lets a workspace opened through a symlink
// (a linked ~/code, macOS's /tmp -> /private/tmp) or a mapped drive pair
// its suites the way the CLI does.
function key(p: string): string {
  const resolved = realpathOrResolve(p);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

// `target` as the CLI reported it (a realpath), re-spelled under the
// deepest ancestor of `near` (a path in the workspace's own spelling)
// whose realpath contains it -- so the program or suite opens as the same
// document the workspace already knows, not a second copy under its
// realpath. Unchanged when no ancestor contains it.
function inSpellingOf(near: string, target: string): string {
  let dir = path.dirname(path.resolve(near));
  for (;;) {
    const relative = path.relative(realpathOrResolve(dir), target);
    if (!path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..') return path.join(dir, relative);
    const parent = path.dirname(dir);
    if (parent === dir) return target;
    dir = parent;
  }
}

let cutToProgram = new Map<string, string>();
let programToCuts = new Map<string, string[]>();
let cutToError = new Map<string, string>();

// Replaces everything known with the latest listings (one per workspace
// folder, then one per nested project config root below it). A suite
// listed more than once takes its LAST row, so a nested project's own
// listing wins over the workspace root's. A suite the CLI couldn't pair is
// left out of the pairing, so callers fall back -- but when the CLI said
// WHY (two programs share the name, the PROGRAM line names a missing
// file), that reason is kept for pairingError().
export function setPairings(listings: SuitesListing[]): void {
  const nextCut = new Map<string, string>();
  const nextProgram = new Map<string, string[]>();
  const nextError = new Map<string, string>();
  const latest = new Map<string, SuitePairing>();
  for (const listing of listings) {
    for (const row of listing.suites) latest.set(key(row.cut), row);
  }
  for (const [cutKey, row] of latest) {
    if (!row.program) {
      if (row.error) nextError.set(cutKey, row.error);
      continue;
    }
    nextCut.set(cutKey, row.program);
    const suites = nextProgram.get(key(row.program)) ?? [];
    if (!suites.some((s) => key(s) === cutKey)) suites.push(row.cut);
    nextProgram.set(key(row.program), suites);
  }
  for (const suites of nextProgram.values()) suites.sort();
  cutToProgram = nextCut;
  programToCuts = nextProgram;
  cutToError = nextError;
}

// Records one pairing ahead of the next CLI refresh -- a suite New Test
// Suite just wrote under tests/ must lint against the right program the
// moment it opens, before the watcher-triggered refresh lands.
export function rememberPairing(cutPath: string, programPath: string): void {
  cutToProgram.set(key(cutPath), programPath);
  cutToError.delete(key(cutPath));
  const suites = programToCuts.get(key(programPath)) ?? [];
  if (!suites.some((s) => key(s) === key(cutPath))) {
    suites.push(cutPath);
    suites.sort();
  }
  programToCuts.set(key(programPath), suites);
}

export function pairedProgram(cutPath: string): string | undefined {
  const program = cutToProgram.get(key(cutPath));
  return program === undefined ? undefined : inSpellingOf(cutPath, program);
}

// The CLI's own reason it could not pair this suite with a program, when
// it gave one. Lint, Run, Debug and Mutation report it instead of
// substituting the sibling guess resolveCblPath falls back to.
export function pairingError(cutPath: string): string | undefined {
  return cutToError.get(key(cutPath));
}

export function pairedSuites(programPath: string): string[] {
  return (programToCuts.get(key(programPath)) ?? []).map((cut) => inSpellingOf(programPath, cut));
}
