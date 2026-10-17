import * as fs from 'fs';
import * as path from 'path';
import { pairedProgram, pairedSuites, readProgramLine, suiteBaseName } from './suitePairing';

export interface CutCase {
  name: string;
  line: number;
  tags: string[];
}

export interface CutSuite {
  name: string;
  line: number;
  cases: CutCase[];
}

const TESTSUITE_RE = /^\s*TESTSUITE\s+"([^"]*)"/;
// Group 2 captures the raw TAGS tail (`"slow" "io"`) when present; group 3
// the PROVIDER name of a `USING PROVIDER <name>` suffix.
const TESTCASE_RE =
  /^\s*TESTCASE\s+"([^"]*)"(?:\s+TAGS\s+("[^"]*"(?:\s+"[^"]*")*))?(?:\s+USING\s+PROVIDER\s+([A-Za-z0-9][A-Za-z0-9-]*))?/;
const TAG_RE = /"([^"]*)"/g;
const PROVIDER_RE = /^\s*PROVIDER\s+([A-Za-z0-9][A-Za-z0-9-]*)\s*$/;
const PROVIDER_ROW_RE = /^\s*ROW\s+(.+)$/;

function parseTags(rawTags: string | undefined): string[] {
  if (!rawTags) return [];
  const tags: string[] = [];
  for (const match of rawTags.matchAll(TAG_RE)) {
    if (match[1].trim()) tags.push(match[1]);
  }
  return tags;
}

interface ProviderRow {
  firstValue: string;
  line: number;
}

// First comma-separated value of a ROW line, ignoring commas inside '...'
// or "..." spans — mirrors the CLI parser's `_split_top_level`.
function firstRowValue(values: string): string {
  let quote: string | null = null;
  for (let i = 0; i < values.length; i++) {
    const char = values[i];
    if (quote !== null) {
      if (char === quote) quote = null;
    } else if (char === "'" || char === '"') {
      quote = char;
    } else if (char === ',') {
      return values.slice(0, i).trim();
    }
  }
  return values.trim();
}

// Strip one layer of matching quote characters for the generated case name —
// mirrors the CLI parser's `_display_value` (cosmetic only).
function displayValue(raw: string): string {
  if (raw.length >= 2 && raw[0] === raw[raw.length - 1] && (raw[0] === "'" || raw[0] === '"')) {
    return raw.slice(1, -1);
  }
  return raw;
}

export function parseCutFile(text: string): CutSuite[] {
  const lines = text.split(/\r\n|\n/);
  const suites: CutSuite[] = [];
  let current: CutSuite | null = null;
  // PROVIDER name -> its ROW lines seen so far. A `TESTCASE ... USING
  // PROVIDER <name>` expands into one case per ROW with the same
  // `name [row N: value]` names and ROW-line anchors the CLI parser
  // generates (`_expand_providers`), because run reports only ever contain
  // the expanded names — an unexpanded fallback case would never match the
  // report and would surface as a bogus "did not run". Unknown or row-less
  // providers keep the unexpanded case: this regex scan is best-effort by
  // design, and authoritative discovery (`mockymock collect`) rejects those
  // files with a real parse error.
  const providers = new Map<string, ProviderRow[]>();
  let currentProvider: ProviderRow[] | null = null;

  lines.forEach((line, index) => {
    const suiteMatch = TESTSUITE_RE.exec(line);
    if (suiteMatch) {
      current = { name: suiteMatch[1], line: index, cases: [] };
      suites.push(current);
      currentProvider = null;
      return;
    }
    const providerMatch = PROVIDER_RE.exec(line);
    if (providerMatch) {
      currentProvider = [];
      providers.set(providerMatch[1], currentProvider);
      return;
    }
    const rowMatch = PROVIDER_ROW_RE.exec(line);
    if (rowMatch && currentProvider) {
      currentProvider.push({ firstValue: firstRowValue(rowMatch[1]), line: index });
      return;
    }
    const caseMatch = TESTCASE_RE.exec(line);
    if (caseMatch && current) {
      currentProvider = null;
      const name = caseMatch[1];
      const tags = parseTags(caseMatch[2]);
      const rows = caseMatch[3] ? providers.get(caseMatch[3]) : undefined;
      if (rows && rows.length) {
        rows.forEach((row, rowIndex) => {
          current!.cases.push({
            name: `${name} [row ${rowIndex + 1}: ${displayValue(row.firstValue)}]`,
            line: row.line,
            tags: [...tags],
          });
        });
      } else {
        current.cases.push({ name, line: index, tags });
      }
    }
  });

  return suites;
}

// Converts `mockymock collect --cut <f> --json` output into the same shape
// parseCutFile produces, so the controller treats CLI-driven (authoritative)
// and regex-driven (fallback) discovery identically. Collect uses 1-based
// lines; the extension's tree uses 0-based. Returns null for anything that
// isn't a valid collect document (including its {"error": ...} form), which
// tells the caller to fall back to the regex scan.
export function cutSuitesFromCollectJson(text: string): CutSuite[] | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof doc !== 'object' || doc === null) return null;
  const root = doc as Record<string, unknown>;
  if (typeof root.error === 'string') return null;
  const suiteRaw = root.suite;
  if (typeof suiteRaw !== 'object' || suiteRaw === null || !Array.isArray(root.cases)) return null;
  const suiteObj = suiteRaw as Record<string, unknown>;
  if (typeof suiteObj.name !== 'string' || typeof suiteObj.line !== 'number') return null;

  const cases: CutCase[] = [];
  for (const entry of root.cases) {
    if (typeof entry !== 'object' || entry === null) continue;
    const c = entry as Record<string, unknown>;
    if (typeof c.name !== 'string' || typeof c.line !== 'number') continue;
    cases.push({
      name: c.name,
      line: Math.max(0, c.line - 1),
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
    });
  }
  return [{ name: suiteObj.name, line: Math.max(0, suiteObj.line - 1), cases }];
}

// The three extensions package.json registers for the `cobol` language --
// keep in sync with environment/cobolPaths.ts's isCobolPath. Probed in this
// order; .cbl stays the default when none exists (error messages then name
// the conventional pairing).
const COBOL_SOURCE_EXTENSIONS = ['.cbl', '.cob', '.cobol'];

function readTextOrUndefined(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

// Resolves a .cut file's paired COBOL source, best answer first:
//   1. what `mockymock suites --json` said (suitePairing.ts) -- the CLI's
//      full lookup, including suites under tests/ that mirror the source
//      tree, which only the CLI knows how to map back;
//   2. the suite's own `PROGRAM "<path>"` line, relative to the suite;
//   3. a sibling named like the suite: the whole stem first (PROG.cbl for
//      PROG.cut), then the base name (PROG.cbl for PROG.errors.cut), each
//      as .cbl/.cob/.cobol.
// When nothing exists the sibling `<stem>.cbl` is returned, so error
// messages name the conventional pairing. `exists` and `readText` are
// injectable so the mapping stays unit-testable without a real filesystem.
export function resolveCblPath(
  cutFilePath: string,
  exists: (p: string) => boolean = fs.existsSync,
  readText: (p: string) => string | undefined = readTextOrUndefined
): string {
  const paired = pairedProgram(cutFilePath);
  if (paired && exists(paired)) return paired;

  const parsed = path.parse(cutFilePath);
  const text = readText(cutFilePath);
  const declared = text === undefined ? undefined : readProgramLine(text);
  if (declared) return path.isAbsolute(declared) ? declared : path.join(parsed.dir, declared);

  for (const stem of new Set([parsed.name, suiteBaseName(cutFilePath)])) {
    for (const ext of COBOL_SOURCE_EXTENSIONS) {
      const candidate = path.join(parsed.dir, `${stem}${ext}`);
      if (exists(candidate)) return candidate;
    }
  }
  return path.join(parsed.dir, `${parsed.name}.cbl`);
}

// The sibling suite path a program would conventionally have. Where a NEW
// suite goes is the CLI's call (`mockymock suites PROG --json`'s
// newSuitePath, under tests/); this is the fallback for a CLI without it.
export function resolveCutPath(cblFilePath: string, topic?: string): string {
  const parsed = path.parse(cblFilePath);
  return path.join(parsed.dir, topic ? `${parsed.name}.${topic}.cut` : `${parsed.name}.cut`);
}

// Every suite known to test `cblFilePath`: the CLI's pairing, plus the
// sibling PROG.cut / PROG.<topic>.cut files beside it (found even before
// the CLI's first answer arrives, or with a CLI too old to give one).
export function suitesForProgram(
  cblFilePath: string,
  exists: (p: string) => boolean = fs.existsSync,
  listDir: (dir: string) => string[] = (dir) => {
    try {
      return fs.readdirSync(dir);
    } catch {
      return [];
    }
  }
): string[] {
  const found = new Map<string, string>();
  const add = (p: string) => {
    const k = process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p);
    if (!found.has(k)) found.set(k, p);
  };
  for (const suite of pairedSuites(cblFilePath)) {
    if (exists(suite)) add(suite);
  }
  const parsed = path.parse(cblFilePath);
  const prefix = `${parsed.name}.`.toLowerCase();
  for (const entry of listDir(parsed.dir)) {
    const lower = entry.toLowerCase();
    if (!lower.endsWith('.cut') || !lower.startsWith(prefix)) continue;
    const candidate = path.join(parsed.dir, entry);
    // A sibling whose own PROGRAM line points elsewhere isn't this program's.
    if (path.resolve(resolveCblPath(candidate, exists)) === path.resolve(cblFilePath)) add(candidate);
  }
  return Array.from(found.values()).sort();
}

// Directory names that mark a path as generated/vendored/scratch, not a real
// source location for .cut suites -- most notably git worktrees (Claude Code's
// own `.claude/worktrees/<name>/` convention and the plain `.worktrees/<name>/`
// convention some repos use), which are full checkouts that duplicate every
// example under a different absolute path and would otherwise show up as
// look-alike duplicate entries in the Test Explorer tree. Also every folder
// the CLI's own directory scan skips (mocky-mock's
// mockymock/cli/discovery.py CUT_DISCOVERY_EXCLUDE_DIRS), so the two agree
// on which suites belong to the project.
export const EXCLUDED_PATH_SEGMENTS: ReadonlySet<string> = new Set([
  'node_modules',
  '.git',
  '.worktrees',
  'worktrees',
  '.hg',
  '.svn',
  '.venv',
  'venv',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.ruff_cache',
  'dist',
  'build',
]);

// Only the segments BELOW the workspace folder count, the same scope as
// CUT_DISCOVERY_EXCLUDE_GLOB (which findFiles applies relative to the
// folder): a workspace opened at ~/worktrees/feature-x is not itself a
// worktree to hide. A file outside every workspace folder (`workspaceRoot`
// undefined, or not an ancestor) is never excluded.
export function isExcludedCutPath(fsPath: string, workspaceRoot: string | undefined): boolean {
  if (workspaceRoot === undefined) return false;
  const fold = (segment: string) => (process.platform === 'win32' ? segment.toLowerCase() : segment);
  const rootSegments = workspaceRoot.split(/[\\/]/).filter(Boolean);
  const segments = fsPath.split(/[\\/]/).filter(Boolean);
  if (rootSegments.length > segments.length) return false;
  if (rootSegments.some((segment, i) => fold(segment) !== fold(segments[i]))) return false;
  return segments.slice(rootSegments.length).some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment));
}

export const CUT_DISCOVERY_EXCLUDE_GLOB = `{${Array.from(EXCLUDED_PATH_SEGMENTS, (name) => `**/${name}/**`).join(',')}}`;
