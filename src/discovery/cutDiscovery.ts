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
// Group 2 captures the raw TAGS tail (`"slow" "io"`) when present.
const TESTCASE_RE = /^\s*TESTCASE\s+"([^"]*)"(?:\s+TAGS\s+((?:"[^"]*"\s*)+))?/;
const TAG_RE = /"([^"]*)"/g;

function parseTags(rawTags: string | undefined): string[] {
  if (!rawTags) return [];
  const tags: string[] = [];
  for (const match of rawTags.matchAll(TAG_RE)) {
    if (match[1].trim()) tags.push(match[1]);
  }
  return tags;
}

export function parseCutFile(text: string): CutSuite[] {
  const lines = text.split(/\r\n|\n/);
  const suites: CutSuite[] = [];
  let current: CutSuite | null = null;

  lines.forEach((line, index) => {
    const suiteMatch = TESTSUITE_RE.exec(line);
    if (suiteMatch) {
      current = { name: suiteMatch[1], line: index, cases: [] };
      suites.push(current);
      return;
    }
    const caseMatch = TESTCASE_RE.exec(line);
    if (caseMatch && current) {
      current.cases.push({ name: caseMatch[1], line: index, tags: parseTags(caseMatch[2]) });
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
