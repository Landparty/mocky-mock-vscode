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
  // risky: passed while asserting nothing (no EXPECT/VERIFY) -- still a
  // pass, like PHPUnit's "risky" status, but worth saying so. Only the JSON
  // report carries it.
  | { kind: 'passed'; risky?: boolean }
  | { kind: 'failed'; message: string; details?: FailureDetail[] }
  | { kind: 'errored'; message: string }
  | { kind: 'not-run'; message: string };

// One case the controller wants a verdict for. `line` is the case's
// 1-based .cut line (the run report's own convention), or null if unknown.
export interface ExpectedCase {
  name: string;
  line: number | null;
}

// Pairs each expected case with its OWN result entry. TESTCASE names need not
// be unique (the CLI accepts duplicates, and a copy-pasted case keeps its
// name), so a name-keyed lookup let the last same-named entry speak for all
// of them -- a failing first copy shown green because the second passed.
// Match on name+line first; then, for an entry whose line no longer agrees
// (an edit since discovery) or that carries no line at all (JUnit), take the
// first still-unclaimed entry of that name, in order. No entry is ever used
// for two cases.
export function pairResultEntries<T extends { name: string; line?: number | null }>(
  expected: ExpectedCase[],
  entries: T[]
): (T | undefined)[] {
  const claimed = new Set<number>();
  const paired: (T | undefined)[] = expected.map((e) => {
    if (e.line === null) return undefined;
    const index = entries.findIndex((entry, i) => !claimed.has(i) && entry.name === e.name && entry.line === e.line);
    if (index < 0) return undefined;
    claimed.add(index);
    return entries[index];
  });
  expected.forEach((e, i) => {
    if (paired[i]) return;
    const index = entries.findIndex((entry, j) => !claimed.has(j) && entry.name === e.name);
    if (index < 0) return;
    claimed.add(index);
    paired[i] = entries[index];
  });
  return paired;
}

export function mapResults(
  expectedCaseNames: string[],
  junitSuite: JUnitTestSuite | null,
  processFailureMessage?: string
): Map<string, CaseOutcome> {
  const outcomes = mapResultsForCases(
    expectedCaseNames.map((name) => ({ name, line: null })),
    junitSuite,
    processFailureMessage
  );
  return new Map(expectedCaseNames.map((name, i) => [name, outcomes[i]]));
}

// One outcome per expected case, in the same order (see pairResultEntries).
export function mapResultsForCases(
  expected: ExpectedCase[],
  junitSuite: JUnitTestSuite | null,
  processFailureMessage?: string
): CaseOutcome[] {
  if (!junitSuite) {
    const message = processFailureMessage ?? 'mockymock run did not produce results (refused or failed to compile)';
    return expected.map(() => ({ kind: 'errored', message }));
  }

  return pairResultEntries(expected, junitSuite.cases).map((found): CaseOutcome => {
    if (!found) {
      // Absent from the JUnit output. A crash cutting the suite short is the
      // common cause, but a name drift between discovery and the CLI looks
      // identical from here -- don't assert a cause this mapper can't know.
      return {
        kind: 'not-run',
        message: 'did not run — not present in the run report (an earlier crash, or a name mismatch between discovery and the CLI)',
      };
    }
    if (found.status === 'passed') return { kind: 'passed' };
    return { kind: found.status, message: found.messages.join('\n') || found.status };
  });
}

// `mockymock run` fails the run whenever the test binary exits nonzero, even
// after every case printed its END marker (an AFTER-ALL that hangs into the
// timeout or abends, libcob dying after the SUMMARY line). The report then
// holds nothing but passes, so this is the only trace of the failure -- the
// caller must not show the file green. Returns undefined when the exit code
// already agrees with the case verdicts.
export function unexplainedExitProblem(
  exitCode: number,
  anyCaseFailedOrErrored: boolean,
  stderr: string,
  stdout: string
): string | undefined {
  if (exitCode === 0 || anyCaseFailedOrErrored) return undefined;
  // stdout is already in the run output in full; its tail is where the CLI
  // explains itself when stderr is empty.
  const detail = stderr.trim() || stdout.trimEnd().split(/\r?\n/).slice(-20).join('\n');
  return `mockymock run exited ${exitCode} although every case passed` + (detail ? `:\n${detail}` : '');
}
