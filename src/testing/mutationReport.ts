// Parses `mockymock mutate --json-report` output (see the sibling mocky-mock
// repo's docs/2026-07-29-mutation-testing-design.md and mutation/report.py's
// to_json_dict). `line` is 1-based in the ORIGINAL .cbl -- mutants are
// generated from the pre-normalization source the user edits, so every line
// here is directly addressable in the editor. Tolerant parsing mirrors
// coverageReport.ts/traceReport.ts for the document's overall shape (a
// structurally alien document returns null), but NOT per-mutant: every
// mutant row can flip the pass/fail verdict, so a malformed row rejects the
// whole report instead of being silently dropped -- otherwise a report that
// truthfully has a survivor could parse into zero survivors and read as a
// clean pass.

export type MutantStatus = 'killed' | 'survived' | 'stillborn' | 'timeout';

export interface MutantEntry {
  /** 1-based line number in the original .cbl file. */
  line: number;
  operator: string;
  description: string;
  original: string;
  mutated: string;
  status: MutantStatus;
  /** First failure reason for a kill; first compile line for a stillborn. */
  detail: string;
  /**
   * Set only on a survivor the suite's test data probably cannot kill (e.g.
   * every case starts the mutated field at zero): why, and what starting
   * value to change. Empty otherwise, and on a CLI older than the field.
   */
  hint: string;
  /**
   * False for a mutant on a line the baseline never executes: with the
   * coverage gate on (the CLI default) it is recorded as survived without
   * ever being built or run. True otherwise, and on a CLI older than the
   * field.
   */
  ran: boolean;
}

export interface MutationReport {
  program: string;
  cut: string;
  /** killed+timeouts over scored mutants, 0..1; null when nothing was scorable. */
  score: number | null;
  generated: number;
  killed: number;
  timeouts: number;
  survived: number;
  stillborn: number;
  mutants: MutantEntry[];
}

const STATUSES = new Set<string>(['killed', 'survived', 'stillborn', 'timeout']);

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function parseMutationJson(text: string): MutationReport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof doc !== 'object' || doc === null) return null;
  const root = doc as Record<string, unknown>;
  if (!Array.isArray(root.mutants)) return null;
  const totals = (
    typeof root.totals === 'object' && root.totals !== null ? root.totals : {}
  ) as Record<string, unknown>;

  const mutants: MutantEntry[] = [];
  for (const entry of root.mutants) {
    if (typeof entry !== 'object' || entry === null) return null;
    const item = entry as Record<string, unknown>;
    if (typeof item.line !== 'number') return null;
    if (typeof item.status !== 'string' || !STATUSES.has(item.status)) return null;
    mutants.push({
      line: item.line,
      operator: asString(item.operator),
      description: asString(item.description),
      original: asString(item.original),
      mutated: asString(item.mutated),
      status: item.status as MutantStatus,
      detail: asString(item.detail),
      hint: asString(item.hint),
      ran: item.ran !== false,
    });
  }

  const count = (key: string, status: MutantStatus): number =>
    typeof totals[key] === 'number'
      ? (totals[key] as number)
      : mutants.filter((m) => m.status === status).length;

  return {
    program: asString(root.program),
    cut: asString(root.cut),
    score: typeof root.score === 'number' ? root.score : null,
    generated: typeof totals.generated === 'number' ? (totals.generated as number) : mutants.length,
    killed: count('killed', 'killed'),
    timeouts: count('timeouts', 'timeout'),
    survived: count('survived', 'survived'),
    stillborn: count('stillborn', 'stillborn'),
    mutants,
  };
}

export function survivorsOf(report: MutationReport): MutantEntry[] {
  return report.mutants.filter((m) => m.status === 'survived');
}

function mutantIdentity(m: MutantEntry): string {
  return JSON.stringify([m.line, m.operator, m.description, m.original, m.mutated]);
}

/**
 * The mutants that survived EVERY suite run against the same program (#108):
 * one suite killing a mutant means the program's tests do notice that
 * change, so only a mutant no suite killed is worth a warning on the .cbl.
 * Takes one survivor list per suite that produced a report, and keeps the
 * first list's order. No lists at all means nothing to report.
 */
export function survivorsOfEverySuite(perSuite: MutantEntry[][]): MutantEntry[] {
  if (perSuite.length === 0) return [];
  const [first, ...rest] = perSuite;
  const others = rest.map((survivors) => new Set(survivors.map(mutantIdentity)));
  return first.filter((m) => others.every((ids) => ids.has(mutantIdentity(m))));
}

/**
 * Why a survivor survived, in words that point at the right fix: a mutant no
 * test ran against needs a test case that reaches its line, not a stronger
 * assertion.
 */
export function survivorReason(m: MutantEntry): string {
  return m.ran
    ? `every test still passes when this line becomes "${m.mutated.trim()}"`
    : 'never executed by any test case (not compiled): add a case that reaches this line';
}
