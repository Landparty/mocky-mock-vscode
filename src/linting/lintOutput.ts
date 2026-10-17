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
  /**
   * True when the refusal message itself opens with `.cut line N: `
   * (UNKNOWN_DATA_NAME and the other .cut-name checks): `line` is then
   * that .cut-relative N, whatever the code.
   */
  cutRelative?: boolean;
}

const REFUSED_RE = /^mockymock lint: refused \((?<code>[A-Z_]+)\): (?<message>.*)$/;
const INVALID_CUT_RE = /^mockymock lint: invalid \.cut file .*?: line (?<line>\d+): (?<message>.*)$/;
const GENERIC_PROBLEM_RE = /^mockymock lint: (?<message>(?!no problems found\.)(?!\d+ problem\(s\) found\.).+)$/;
// Transparency notes lint prints under the same prefix, ahead of any
// problems: a refusal waived because no selected case can reach it, and the
// DFHRESP(...) expansion summary. Informational -- never a problem.
const NOTE_RE = /^mockymock lint: (?:.* waived: |expanded \d+ DFHRESP\()/;
// Warnings never change lint's exit code (mocky-mock 2026-10-14+): today
// only NO_ASSERTION, a TESTCASE with no EXPECT or VERIFY. Its `.cut line N`
// is .cut-relative, unlike a refusal's embedded line. Kept out of
// parseLintOutput so a warning can never block a debug session (lintGate).
const WARNING_RE = /^mockymock lint: warning \((?<code>[A-Z_]+)\): (?:\.cut line (?<line>\d+): )?(?<message>.*)$/;
const WARNING_COUNT_RE = /^mockymock lint: \d+ warning\(s\)\.$/;

export interface LintWarning {
  /** 1-based .cut line, or null when the warning names none. */
  line: number | null;
  message: string;
  code: string;
}

export function parseLintWarnings(stdout: string): LintWarning[] {
  const warnings: LintWarning[] = [];
  for (const rawLine of stdout.split(/\r?\n/)) {
    const match = WARNING_RE.exec(rawLine.trimEnd());
    if (match?.groups) {
      warnings.push({
        line: match.groups.line ? Number(match.groups.line) : null,
        message: match.groups.message,
        code: match.groups.code,
      });
    }
  }
  return warnings;
}
// A malformed cobol.yml / mockymock.toml (or a cobol.yml the installed
// cobol-parser is too old to read) stops every config-reading command before
// it runs, with one bare `mockymock: <path>: ...` line and exit 1.
const CONFIG_ERROR_RE = /^mockymock: (?<message>.+)$/;
// Refusal messages frequently embed "line N" for the offending statement --
// kept for display (lintGate.ts's blocking-dialog text), but it is a .cbl
// line, never a .cut one; see LintProblem.line's doc comment.
const EMBEDDED_LINE_RE = /\bline (?<line>\d+)\b/;
// A refusal that names a .cut line says so up front, in the same wording
// WARNING_RE parses for NO_ASSERTION: `.cut line N: ...`.
const CUT_LINE_PREFIX_RE = /^\.cut line (?<line>\d+): /;

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
      const cutLine = CUT_LINE_PREFIX_RE.exec(match.groups.message);
      if (cutLine?.groups) {
        problems.push({
          line: Number(cutLine.groups.line),
          message: match.groups.message,
          code: match.groups.code,
          cutRelative: true,
        });
        continue;
      }
      const embedded = EMBEDDED_LINE_RE.exec(match.groups.message);
      problems.push({
        line: embedded?.groups ? Number(embedded.groups.line) : null,
        message: match.groups.message,
        code: match.groups.code,
      });
      continue;
    }
    if (NOTE_RE.test(line)) continue;
    if (WARNING_RE.test(line) || WARNING_COUNT_RE.test(line)) continue;
    match = CONFIG_ERROR_RE.exec(line);
    if (match?.groups) {
      problems.push({ line: null, message: match.groups.message, code: null });
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
// line N"), and any refusal whose message opens with `.cut line N: ` says
// so itself (`cutRelative`). Every other code's `problem.line` -- including
// UNRESOLVED_COPYBOOK, whose "unresolved COPY statement at line N" is a
// .cbl line -- must never be used to position a diagnostic in the .cut
// document; a future refusal code with a line-bearing message defaults to
// file-level (null) here rather than silently mispainting a squiggle.
export function cutRelativeLine(problem: LintProblem): number | null {
  return problem.code === 'CUT_PARSE_ERROR' || problem.cutRelative ? problem.line : null;
}
