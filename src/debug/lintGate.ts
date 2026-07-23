// Pure gating logic deciding whether a `mockymock lint` result should block
// an interactive debug session from starting. Kept free of the vscode
// import (like debugArgs.ts) so it's unit-testable without an Extension
// Development Host.
//
// Why this exists: `mockymock debug --dap-stdio` runs the same static
// checks `lint` does, but on failure it prints plain text and exits
// non-zero *before* ever speaking the Debug Adapter Protocol -- so a static
// problem (bad breakpoint target, unresolved copybook, syntax error) that
// slips past this preflight surfaces to the user as a generic "debug
// adapter process terminated unexpectedly" dialog instead of a clear
// message. Running `lint` first and gating on it here prevents that.
import { CommandResult } from '../environment/commandRunner';
import { parseLintOutput } from '../linting/lintOutput';

export type LintGate = { blocked: false } | { blocked: true; message: string };

// Mirrors lintDiagnostics.ts's own gating: code 0 is clean, -1 means the CLI
// couldn't even be spawned (ensureReady() already checked that upstream, so
// don't re-block on it here), and a nonzero exit with nothing parseable is
// "lint unavailable" (e.g. a CLI predating `lint`), not a hard failure.
export function evaluateLintResult(result: CommandResult): LintGate {
  if (result.code === 0 || result.code === -1) return { blocked: false };
  const problems = parseLintOutput(result.stdout);
  if (!problems.length) return { blocked: false };
  const detail = problems
    .map((problem) => {
      const code = problem.code ? `[${problem.code}] ` : '';
      const location = problem.line !== null ? `line ${problem.line}: ` : '';
      return `${code}${location}${problem.message}`;
    })
    .join('\n');
  return {
    blocked: true,
    message: `mockymock: cannot start a debug session -- "mockymock lint" found problems:\n${detail}`,
  };
}
