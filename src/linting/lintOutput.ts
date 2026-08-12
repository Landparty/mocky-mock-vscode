// Parses `mockymock lint` console output into structured problems the
// diagnostics provider can place in the editor. Pure string parsing so it
// is unit-testable without the vscode module.

export interface LintProblem {
  /**
   * 1-based line the message names, when it names one, else null.
   * ONLY .cut-relative when code is 'CUT_PARSE_ERROR' (parsed straight out
   * of the CLI's "invalid .cut file ...: line N" wording). For every other
   * refusal code (UNRESOLVED_COPYBOOK, UNSUPPORTED_TERMINATOR_LAYOUT,
   * NESTED_EXEC, ...) this is a line in the .cbl source's own AST/token
   * positions (mockymock/analysis/refusal.py's `site.line` /
   * `token.location.line`, post copybook-expansion when COPY resolves) --
   * a different file and line-numbering space than the .cut document these
   * problems get diagnosed against. Use `cutRelativeLine()` before indexing
   * into a .cut document with this value.
   */
  line: number | null;
  message: string;
  /** Refusal code (PARSE_ERROR, UNRESOLVED_COPYBOOK, ...) when present. */
  code: string | null;
}

const REFUSED_RE = /^mockymock lint: refused \((?<code>[A-Z_]+)\): (?<message>.*)$/;
const INVALID_CUT_RE = /^mockymock lint: invalid \.cut file .*?: line (?<line>\d+): (?<message>.*)$/;
const GENERIC_PROBLEM_RE = /^mockymock lint: (?<message>(?!no problems found\.)(?!\d+ problem\(s\) found\.).+)$/;
// Refusal messages frequently embed "line N" for the offending statement --
// kept for display (lintGate.ts's blocking-dialog text), but it is a .cbl
// line, never a .cut one; see LintProblem.line's doc comment.
const EMBEDDED_LINE_RE = /\bline (?<line>\d+)\b/;

export function parseLintOutput(stdout: string): LintProblem[] {
  const problems: LintProblem[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;
    if (line.startsWith('  ')) {
      // Indented parse-error detail under a refused (PARSE_ERROR) header —
      // fold into the previous problem so the diagnostic carries the detail.
      const last = problems[problems.length - 1];
      if (last) last.message += `\n${line.trim()}`;
      continue;
    }
    let match = INVALID_CUT_RE.exec(line);
    if (match?.groups) {
      problems.push({
        line: Number(match.groups.line),
        message: match.groups.message,
        code: 'CUT_PARSE_ERROR',
      });
      continue;
    }
    match = REFUSED_RE.exec(line);
    if (match?.groups) {
      const embedded = EMBEDDED_LINE_RE.exec(match.groups.message);
      problems.push({
        line: embedded?.groups ? Number(embedded.groups.line) : null,
        message: match.groups.message,
        code: match.groups.code,
      });
      continue;
    }
    match = GENERIC_PROBLEM_RE.exec(line);
    if (match?.groups) {
      problems.push({ line: null, message: match.groups.message, code: null });
    }
  }
  return problems;
}

// Allowlist, not a denylist: CUT_PARSE_ERROR is the one refusal code the
// CLI documents as carrying a .cut-relative line ("invalid .cut file ...:
// line N"). Every other code's `problem.line` -- including
// UNRESOLVED_COPYBOOK, whose "unresolved COPY statement at line N" is a
// .cbl line -- must never be used to position a diagnostic in the .cut
// document; a future refusal code with a line-bearing message defaults to
// file-level (null) here rather than silently mispainting a squiggle.
export function cutRelativeLine(problem: LintProblem): number | null {
  return problem.code === 'CUT_PARSE_ERROR' ? problem.line : null;
}
