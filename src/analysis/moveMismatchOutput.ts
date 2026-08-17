// Parses `mockymock analyze move-type-check --compact` JSON output into
// structured problems the diagnostics provider can place in the editor.
// Pure JSON parsing so it is unit-testable without the vscode module.

export type MoveMismatchSeverity = 'ERROR' | 'WARNING';

export interface MoveMismatchProblem {
  /**
   * 1-based line as reported by the analyzer. NOTE: cobolparser locations
   * are relative to the copybook-EXPANDED text, not the file on disk --
   * pass this through anchorViolationLine() before placing a diagnostic.
   */
  line: number;
  severity: MoveMismatchSeverity;
  message: string;
  /** Source operand name of the offending MOVE, when the report carries it. */
  source?: string;
  /** Target operand name of the offending MOVE, when the report carries it. */
  target?: string;
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
    const problem: MoveMismatchProblem = { line, severity: v.kind, message: v.message };
    if (typeof v.source === 'string') problem.source = v.source;
    if (typeof v.target === 'string') problem.target = v.target;
    problems.push(problem);
  }
  return { problems, unresolvedCount };
}

// A COBOL data name is letters/digits/hyphens; when the operand looks like
// one, match it whole (lookarounds, not \b -- '\bWS-FOO\b' would also match
// inside 'PREFIX-WS-FOO' because '-' is a non-word character). Operands that
// aren't plain names (quoted literals, figuratives are still plain names,
// but e.g. subscripted refs) fall back to a literal substring match.
function operandPattern(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (/^[A-Za-z0-9-]+$/.test(name)) {
    return new RegExp(`(?<![A-Za-z0-9-])${escaped}(?![A-Za-z0-9-])`, 'i');
  }
  return new RegExp(escaped, 'i');
}

/**
 * Maps an analyzer-reported violation line back onto the on-disk source.
 *
 * cobolparser's SourceLocation.line values are relative to the
 * copybook-EXPANDED text (see the deliberate no-copybook-path note in
 * paragraphTree/programFlowClient.ts) -- but move-type-check NEEDS
 * --copybook-path to resolve operand PICTUREs, so every violation after an
 * expanded COPY arrives shifted down by however many lines the expansion
 * added. Re-anchor by content: if the reported line already reads as a MOVE
 * of the violation's source operand, keep it (nothing expanded -- the common
 * no-COPY case); otherwise prefer the nearest matching MOVE at-or-above the
 * reported line (expansion only pushes reported lines down), then the
 * nearest below, then the reported line clamped into the document.
 */
export function anchorViolationLine(
  sourceLines: string[],
  reportedLine: number,
  sourceOperand?: string
): number {
  const clamp = (line: number) => Math.min(Math.max(line, 1), Math.max(sourceLines.length, 1));
  if (!sourceOperand) return clamp(reportedLine);
  const movePattern = /\bMOVE\b/i;
  const operand = operandPattern(sourceOperand);
  const matches = (index: number) => {
    const text = sourceLines[index] ?? '';
    return movePattern.test(text) && operand.test(text);
  };
  if (reportedLine >= 1 && reportedLine <= sourceLines.length && matches(reportedLine - 1)) {
    return reportedLine;
  }
  for (let i = Math.min(reportedLine - 1, sourceLines.length) - 1; i >= 0; i--) {
    if (matches(i)) return i + 1;
  }
  for (let i = Math.max(reportedLine, 0); i < sourceLines.length; i++) {
    if (matches(i)) return i + 1;
  }
  return clamp(reportedLine);
}
