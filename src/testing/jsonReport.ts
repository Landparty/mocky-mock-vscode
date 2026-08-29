// Parses `mockymock run --json-report` output and maps it onto CaseOutcomes.
// This is the preferred results channel (it carries .cut line numbers and
// expected/actual per failure); the JUnit XML path in resultMapper.ts stays
// as the fallback for a mockymock CLI that predates --json-report.
import { CaseOutcome, FailureDetail } from './resultMapper';

export interface JsonReportFailure {
  message: string;
  kind: 'expect' | 'verify' | 'unknown';
  line: number | null;
  expected: string | null;
  actual: string | null;
}

export interface JsonReportCase {
  name: string;
  line: number | null;
  tags: string[];
  status: 'passed' | 'failed' | 'crashed' | 'not_run';
  failures: JsonReportFailure[];
  crashDetail?: string | null;
}

// A CASE START marker whose id was already in use. mockymock treats this as
// a gating anomaly (TestSuiteResult.success is false when any are present,
// so the CLI exits non-zero) because the earlier TestResult is orphaned from
// all further FAIL/END attribution: the pass/fail verdicts either side of
// the collision are no longer trustworthy.
export interface JsonDuplicateCaseStart {
  caseId: string;
  previousCaseName: string;
  duplicateCaseName: string;
}

// A RECORD marker whose case id never STARTed. Non-gating in mockymock's own
// classification (there is no pass/fail evidence to lose), so it is reported
// but must not fail a run.
export interface JsonOrphanRecord {
  caseId: string;
  dataName: string;
  value: string;
}

export interface JsonRunReport {
  version: number;
  suite: { name: string; line: number | null };
  cases: JsonReportCase[];
  orphanFailures: { caseId: string; message: string }[];
  // The three integrity signals below live only in the JSON report. The
  // JUnit fallback expresses duplicate starts as synthetic
  // "duplicate-<id>" <testcase> elements, which unattributedFailures()
  // already surfaces -- so before these were parsed here, preferring the
  // (richer) JSON report actually LOST a warning the older fallback showed.
  duplicateCaseStarts: JsonDuplicateCaseStart[];
  orphanEnds: string[];
  orphanRecords: JsonOrphanRecord[];
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Tolerant by design: a report from a newer/older CLI with extra or missing
// optional fields still parses; only a structurally alien document (no
// cases array) returns null and lets the caller fall back to JUnit.
export function parseJsonReport(text: string): JsonRunReport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof doc !== 'object' || doc === null) return null;
  const root = doc as Record<string, unknown>;
  if (!Array.isArray(root.cases)) return null;

  const suiteRaw = (root.suite ?? {}) as Record<string, unknown>;
  const cases: JsonReportCase[] = [];
  for (const entry of root.cases) {
    if (typeof entry !== 'object' || entry === null) continue;
    const c = entry as Record<string, unknown>;
    const name = asString(c.name);
    if (name === null) continue;
    const status = asString(c.status);
    const failures: JsonReportFailure[] = [];
    if (Array.isArray(c.failures)) {
      for (const f of c.failures) {
        if (typeof f !== 'object' || f === null) continue;
        const failure = f as Record<string, unknown>;
        const kindRaw = asString(failure.kind);
        failures.push({
          message: asString(failure.message) ?? '',
          kind: kindRaw === 'expect' || kindRaw === 'verify' ? kindRaw : 'unknown',
          line: asNumberOrNull(failure.line),
          expected: asString(failure.expected),
          actual: asString(failure.actual),
        });
      }
    }
    cases.push({
      name,
      line: asNumberOrNull(c.line),
      tags: Array.isArray(c.tags) ? c.tags.filter((t): t is string => typeof t === 'string') : [],
      status:
        status === 'passed' || status === 'failed' || status === 'crashed' || status === 'not_run'
          ? status
          : 'failed',
      failures,
      crashDetail: asString(c.crashDetail),
    });
  }

  const orphanFailures: { caseId: string; message: string }[] = [];
  if (Array.isArray(root.orphanFailures)) {
    for (const o of root.orphanFailures) {
      if (typeof o !== 'object' || o === null) continue;
      const orphan = o as Record<string, unknown>;
      orphanFailures.push({
        caseId: asString(orphan.caseId) ?? '?',
        message: asString(orphan.message) ?? '',
      });
    }
  }

  const duplicateCaseStarts: JsonDuplicateCaseStart[] = [];
  if (Array.isArray(root.duplicateCaseStarts)) {
    for (const d of root.duplicateCaseStarts) {
      if (typeof d !== 'object' || d === null) continue;
      const dup = d as Record<string, unknown>;
      duplicateCaseStarts.push({
        caseId: asString(dup.caseId) ?? '?',
        previousCaseName: asString(dup.previousCaseName) ?? '?',
        duplicateCaseName: asString(dup.duplicateCaseName) ?? '?',
      });
    }
  }

  const orphanEnds: string[] = Array.isArray(root.orphanEnds)
    ? root.orphanEnds.filter((e): e is string => typeof e === 'string')
    : [];

  const orphanRecords: JsonOrphanRecord[] = [];
  if (Array.isArray(root.orphanRecords)) {
    for (const r of root.orphanRecords) {
      if (typeof r !== 'object' || r === null) continue;
      const record = r as Record<string, unknown>;
      orphanRecords.push({
        caseId: asString(record.caseId) ?? '?',
        dataName: asString(record.dataName) ?? '?',
        value: asString(record.value) ?? '',
      });
    }
  }

  return {
    version: asNumberOrNull(root.version) ?? 0,
    suite: { name: asString(suiteRaw.name) ?? '', line: asNumberOrNull(suiteRaw.line) },
    cases,
    orphanFailures,
    duplicateCaseStarts,
    orphanEnds,
    orphanRecords,
  };
}

// Renders the two NON-gating signals (orphan END and RECORD markers) for the
// run's output channel. Kept separate from the gating path below: mockymock
// itself classifies these as carrying no pass/fail evidence, so surfacing
// them must not turn an otherwise-passing run red.
export function formatAdvisorySignals(report: JsonRunReport): string | undefined {
  const lines: string[] = [];
  if (report.orphanEnds.length) {
    lines.push(
      `mockymock reported ${report.orphanEnds.length} CASE END marker(s) with no matching START: ${report.orphanEnds.join(', ')}`
    );
  }
  for (const record of report.orphanRecords) {
    lines.push(
      `mockymock reported a RECORD marker for unknown case ${record.caseId}: ${record.dataName} = ${record.value}`
    );
  }
  return lines.length ? lines.join('\n') : undefined;
}

// Renders duplicate CASE START ids, which ARE gating (see
// JsonDuplicateCaseStart). Wording mirrors mockymock's own JUnit message:
// "reused"/"from here on" rather than "twice", because one id can collide
// more than once and previousCaseName is only the name THIS collision
// overwrote.
export function formatDuplicateCaseStarts(report: JsonRunReport): string | undefined {
  if (!report.duplicateCaseStarts.length) return undefined;
  const detail = report.duplicateCaseStarts
    .map(
      (d) =>
        `case id ${d.caseId}: "${d.previousCaseName}" then "${d.duplicateCaseName}" — ` +
        `results up to this point were attributed to "${d.previousCaseName}", everything after to "${d.duplicateCaseName}"`
    )
    .join('\n');
  return (
    `mockymock reported ${report.duplicateCaseStarts.length} duplicate CASE START id(s); ` +
    `the pass/fail results around each collision are unreliable:\n${detail}`
  );
}

export function mapJsonReport(
  expectedCaseNames: string[],
  report: JsonRunReport | null,
  processFailureMessage?: string
): Map<string, CaseOutcome> {
  const outcomes = new Map<string, CaseOutcome>();

  if (!report) {
    const message =
      processFailureMessage ?? 'mockymock run did not produce results (refused or failed to compile)';
    for (const name of expectedCaseNames) {
      outcomes.set(name, { kind: 'errored', message });
    }
    return outcomes;
  }

  const byName = new Map(report.cases.map((c) => [c.name, c]));
  for (const name of expectedCaseNames) {
    const found = byName.get(name);
    if (!found) {
      // Absent from the report entirely. Unlike an explicit not_run entry
      // (below), the report makes NO claim about why -- most plausibly a
      // crash cut the suite short, but a discovery/CLI name drift (e.g.
      // PROVIDER row expansion producing a different "name [row N: ...]"
      // label) looks identical from here. Don't assert a cause we can't know.
      outcomes.set(name, {
        kind: 'not-run',
        message: 'did not run — not present in the run report (an earlier crash, or a name mismatch between discovery and the CLI)',
      });
      continue;
    }
    if (found.status === 'not_run') {
      outcomes.set(name, {
        kind: 'not-run',
        message: found.crashDetail
          ? `did not run — an earlier case in this suite crashed (${found.crashDetail})`
          : 'did not run — an earlier case in this suite crashed',
      });
      continue;
    }
    if (found.status === 'passed') {
      outcomes.set(name, { kind: 'passed' });
      continue;
    }
    if (found.status === 'crashed') {
      const parts = found.failures.map((f) => f.message);
      const detail = found.crashDetail ? ` (${found.crashDetail})` : '';
      const prefix = `case crashed before its checks finished${detail}`;
      outcomes.set(name, {
        kind: 'errored',
        message: parts.length ? `${prefix}\n${parts.join('\n')}` : prefix,
      });
      continue;
    }
    const details: FailureDetail[] = found.failures.map((f) => ({
      message: f.message,
      line: f.line,
      expected: f.expected,
      actual: f.actual,
    }));
    outcomes.set(name, {
      kind: 'failed',
      message: details.map((d) => d.message).join('\n') || 'failed',
      details,
    });
  }
  return outcomes;
}
