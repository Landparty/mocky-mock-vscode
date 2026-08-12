import { JUnitTestSuite } from './junitParser';

// A FAIL reported by mockymock for a case id the run never started (crossed
// wires between the framework and the compiled binary, or a MOCK/VERIFY
// firing after its case already ended) surfaces in the JUnit fallback as a
// `orphan-<id>` testcase — present in junitSuite.cases but never one of the
// names the controller asked mapResults about, so it would otherwise vanish
// with no visible trace. This distinguishes those from real, expected cases.
export interface UnattributedFailure {
  caseId: string;
  message: string;
}

export function unattributedFailures(
  expectedCaseNames: string[],
  junitSuite: JUnitTestSuite | null
): UnattributedFailure[] {
  if (!junitSuite) return [];
  const expected = new Set(expectedCaseNames);
  return junitSuite.cases
    .filter((c) => !expected.has(c.name) && c.status !== 'passed')
    .map((c) => ({ caseId: c.name, message: c.messages.join('\n') || c.status }));
}

// One structured failure inside a failed case: the message always exists;
// the .cut line (1-based) and expected/actual pair are present only when the
// source provided them (the JSON report does, the JUnit fallback does not).
export interface FailureDetail {
  message: string;
  line: number | null;
  expected: string | null;
  actual: string | null;
}

export type CaseOutcome =
  | { kind: 'passed' }
  | { kind: 'failed'; message: string; details?: FailureDetail[] }
  | { kind: 'errored'; message: string }
  | { kind: 'not-run'; message: string };

export function mapResults(
  expectedCaseNames: string[],
  junitSuite: JUnitTestSuite | null,
  processFailureMessage?: string
): Map<string, CaseOutcome> {
  const outcomes = new Map<string, CaseOutcome>();

  if (!junitSuite) {
    const message = processFailureMessage ?? 'mockymock run did not produce results (refused or failed to compile)';
    for (const name of expectedCaseNames) {
      outcomes.set(name, { kind: 'errored', message });
    }
    return outcomes;
  }

  const byName = new Map(junitSuite.cases.map((c) => [c.name, c]));
  for (const name of expectedCaseNames) {
    const found = byName.get(name);
    if (!found) {
      // Absent from the JUnit output. A crash cutting the suite short is the
      // common cause, but a name drift between discovery and the CLI looks
      // identical from here -- don't assert a cause this mapper can't know.
      outcomes.set(name, {
        kind: 'not-run',
        message: 'did not run — not present in the run report (an earlier crash, or a name mismatch between discovery and the CLI)',
      });
      continue;
    }
    if (found.status === 'passed') {
      outcomes.set(name, { kind: 'passed' });
    } else {
      outcomes.set(name, {
        kind: found.status,
        message: found.messages.join('\n') || found.status,
      });
    }
  }
  return outcomes;
}
