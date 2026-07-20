// Parses `mockymock lint` console output into structured problems the
// diagnostics provider can place in the editor. Pure string parsing so it
// is unit-testable without the vscode module.

export interface LintProblem {
  /** 1-based .cut line when the message names one, else null (file-level). */
  line: number | null;
  message: string;
  /** Refusal code (PARSE_ERROR, UNRESOLVED_COPYBOOK, ...) when present. */
  code: string | null;
}

const REFUSED_RE = /^mockymock lint: refused \((?<code>[A-Z_]+)\): (?<message>.*)$/;
const INVALID_CUT_RE = /^mockymock lint: invalid \.cut file .*?: line (?<line>\d+): (?<message>.*)$/;
const GENERIC_PROBLEM_RE = /^mockymock lint: (?<message>(?!no problems found\.)(?!\d+ problem\(s\) found\.).+)$/;
// Refusal messages frequently embed ".cut line 12" or "line 12" for the
// offending directive; surface the first such reference as the squiggle
// position instead of defaulting every refusal to the top of the file.
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
