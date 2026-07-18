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
