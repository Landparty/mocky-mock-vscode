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
