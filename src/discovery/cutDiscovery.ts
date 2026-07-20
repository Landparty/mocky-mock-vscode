import * as path from 'path';

export interface CutCase {
  name: string;
  line: number;
}

export interface CutSuite {
  name: string;
  line: number;
  cases: CutCase[];
}

const TESTSUITE_RE = /^\s*TESTSUITE\s+"([^"]*)"/;
const TESTCASE_RE = /^\s*TESTCASE\s+"([^"]*)"/;

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
      current.cases.push({ name: caseMatch[1], line: index });
    }
  });

  return suites;
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
