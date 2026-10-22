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

// 'error': the Docker toolchain failed while the mutant ran, so it was never
// evaluated and is left out of the score (mocky-mock#347). 'equivalent': a
// mutant provably computing what the original does -- no test can kill it,
// so it is shown but left out of the score (mocky-mock#349).
export type MutantStatus = 'killed' | 'survived' | 'stillborn' | 'timeout' | 'error' | 'equivalent';

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
  /** Mutants the toolchain failed under: not evaluated, not scored. */
  errors: number;
  /** Provably equivalent mutants: shown, not scored. */
  equivalent: number;
  /**
   * False when any mutant could not be evaluated: the score then covers only
   * the mutants that were, and the CLI exits non-zero. True on a CLI older
   * than the field.
   */
  complete: boolean;
  mutants: MutantEntry[];
}

const STATUSES = new Set<string>(['killed', 'survived', 'stillborn', 'timeout', 'error', 'equivalent']);

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

  const errors = count('errors', 'error');
  return {
    program: asString(root.program),
    cut: asString(root.cut),
    score: typeof root.score === 'number' ? root.score : null,
    generated: typeof totals.generated === 'number' ? (totals.generated as number) : mutants.length,
    killed: count('killed', 'killed'),
    timeouts: count('timeouts', 'timeout'),
    survived: count('survived', 'survived'),
    stillborn: count('stillborn', 'stillborn'),
    errors,
    equivalent: count('equivalent', 'equivalent'),
    complete: typeof root.complete === 'boolean' ? root.complete : errors === 0,
    mutants,
  };
}

export function survivorsOf(report: MutationReport): MutantEntry[] {
  return report.mutants.filter((m) => m.status === 'survived');
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
