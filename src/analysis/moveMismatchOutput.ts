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
  const operand = operandPattern(sourceOperand);
  // Checking "MOVE...operand...TO" anywhere on the line (rather than just
  // "does the line contain both MOVE and the operand") matters because a
  // line mentioning the same operand as its MOVE *target* -- or an
  // unrelated MOVE that merely shares the name -- would otherwise satisfy a
  // bare co-occurrence check and get picked over the real violation.
  //
  // Scans EVERY "MOVE ... TO" span on the line, not just the first: COBOL
  // allows multiple statements per physical line (e.g.
  // "MOVE ZERO TO A  MOVE CUST-NAME TO B"), and testing only the first
  // MOVE's source segment would miss the operand's real use in a later
  // MOVE on the same line, falling through to search other lines and
  // anchoring on the wrong one.
  //
  // MOVE_RE/TO_RE use the same lookaround idiom as operandPattern above,
  // not \b -- a plain \bTO\b matches the "TO" embedded in a hyphenated
  // operand like AMOUNT-TO-PAY (hyphen isn't a word character, so \b sees
  // a boundary on both sides of it), truncating afterMove's source segment
  // before the real operand and turning a genuine match into a false
  // negative. Same risk applies to MOVE against a name like
  // RECORD-MOVE-COUNT.
  // Non-global companions of the two /g regexes below: a shared `g`-flagged
  // RegExp carries its lastIndex between calls, so testing one with .test()
  // while the other is mid-iteration over a DIFFERENT string would corrupt
  // the iterating one's position. Keeping a stateless copy for those
  // one-shot checks avoids that entirely, rather than relying on callers to
  // reset lastIndex correctly.
  const MOVE_HAS_MATCH = /(?<![A-Za-z0-9-])MOVE(?![A-Za-z0-9-])/i;
  const TO_RE = /(?<![A-Za-z0-9-])TO(?![A-Za-z0-9-])/i;
  // A MOVE clause can wrap onto the following physical line before its TO
  // (fixed-format COBOL wraps a long statement rather than truncating it),
  // so when a line's own remainder after MOVE has no TO yet, extend the
  // search into the next couple of lines -- capped, and stopping at the
  // next MOVE, so an unrelated later statement can't be absorbed into this
  // clause's span.
  const MAX_CONTINUATION_LINES = 3;
  const matches = (index: number) => {
    const text = sourceLines[index] ?? '';
    // MOVE_RE/TO_RE use the same lookaround idiom as operandPattern above,
    // not \b -- a plain \bTO\b matches the "TO" embedded in a hyphenated
    // operand like AMOUNT-TO-PAY (hyphen isn't a word character, so \b sees
    // a boundary on both sides of it), truncating afterMove's source
    // segment before the real operand and turning a genuine match into a
    // false negative. Same risk applies to MOVE against a name like
    // RECORD-MOVE-COUNT. Scoped to this call (not shared across matches()
    // invocations for different lines) so its /g lastIndex can't leak.
    const moveRe = /(?<![A-Za-z0-9-])MOVE(?![A-Za-z0-9-])/gi;
    let moveMatch: RegExpExecArray | null;
    while ((moveMatch = moveRe.exec(text))) {
      let clause = text.slice(moveMatch.index + moveMatch[0].length);
      for (let extra = 1; extra < MAX_CONTINUATION_LINES && !TO_RE.test(clause); extra++) {
        const nextLine = sourceLines[index + extra];
        if (nextLine === undefined || MOVE_HAS_MATCH.test(nextLine)) break;
        clause += ' ' + nextLine;
      }
      const toMatch = TO_RE.exec(clause);
      const sourceSegment = toMatch ? clause.slice(0, toMatch.index) : clause;
      if (operand.test(sourceSegment)) return true;
    }
    return false;
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
