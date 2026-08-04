import * as path from 'path';

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

export function resolveCblPath(cutFilePath: string): string {
  const parsed = path.parse(cutFilePath);
  return path.join(parsed.dir, `${parsed.name}.cbl`);
}

export function resolveCutPath(cblFilePath: string): string {
  const parsed = path.parse(cblFilePath);
  return path.join(parsed.dir, `${parsed.name}.cut`);
}

// Directory names that mark a path as generated/vendored/scratch, not a real
// source location for .cut suites -- most notably git worktrees (Claude Code's
// own `.claude/worktrees/<name>/` convention and the plain `.worktrees/<name>/`
// convention some repos use), which are full checkouts that duplicate every
// example under a different absolute path and would otherwise show up as
// look-alike duplicate entries in the Test Explorer tree.
const EXCLUDED_PATH_SEGMENTS = new Set(['node_modules', '.git', '.worktrees', 'worktrees']);

export function isExcludedCutPath(fsPath: string): boolean {
  return fsPath.split(/[\\/]/).some((segment) => EXCLUDED_PATH_SEGMENTS.has(segment));
}

export const CUT_DISCOVERY_EXCLUDE_GLOB =
  '{**/node_modules/**,**/.git/**,**/.worktrees/**,**/worktrees/**}';
