import { JUnitTestSuite } from './junitParser';

export type CaseOutcome =
  | { kind: 'passed' }
  | { kind: 'failed'; message: string }
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
      outcomes.set(name, {
        kind: 'not-run',
        message: 'did not run — an earlier case in this suite crashed',
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
