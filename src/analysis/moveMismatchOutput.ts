// Parses `mockymock analyze move-type-check --compact` JSON output into
// structured problems the diagnostics provider can place in the editor.
// Pure JSON parsing so it is unit-testable without the vscode module.

export type MoveMismatchSeverity = 'ERROR' | 'WARNING';

export interface MoveMismatchProblem {
  /** 1-based line in the .cbl source. */
  line: number;
  severity: MoveMismatchSeverity;
  message: string;
}

export interface MoveMismatchResult {
  problems: MoveMismatchProblem[];
  /**
   * Count of MOVE operands the checker could not resolve to a known data
   * category (e.g. an identifier from an unresolved COPY) and therefore
   * skipped rather than checked -- see cobol-parser's
   * MoveTypeReport.unresolved_count. A result with zero problems and a
   * non-zero unresolvedCount means "nothing found wrong" is NOT the same as
   * "everything was checked"; callers must not treat the two the same way.
   */
  unresolvedCount: number;
}

// A violation with a null location is one whose source/target operand
// couldn't be resolved to a known data category -- there is nowhere in the
// source to underline, so it is silently skipped rather than falling back
// to line 1.
export function parseMoveMismatchOutput(stdout: string): MoveMismatchResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { problems: [], unresolvedCount: 0 };
  }
  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as { violations?: unknown }).violations)
  ) {
    return { problems: [], unresolvedCount: 0 };
  }

  const rawUnresolvedCount = (parsed as { unresolved_count?: unknown }).unresolved_count;
  const unresolvedCount = typeof rawUnresolvedCount === 'number' ? rawUnresolvedCount : 0;

  const problems: MoveMismatchProblem[] = [];
  for (const violation of (parsed as { violations: unknown[] }).violations) {
    if (!violation || typeof violation !== 'object') continue;
    const v = violation as Record<string, unknown>;
    if (v.kind !== 'ERROR' && v.kind !== 'WARNING') continue;
    if (typeof v.message !== 'string') continue;
    const location = v.location as { line?: unknown } | null | undefined;
    const line = location?.line;
    if (typeof line !== 'number') continue;
    problems.push({ line, severity: v.kind, message: v.message });
  }
  return { problems, unresolvedCount };
}
