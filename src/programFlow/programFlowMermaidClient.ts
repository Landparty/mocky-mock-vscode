// Sibling to (not a replacement for) src/paragraphTree/programFlowClient.ts
// -- that file fetches --compact JSON; this one fetches --format mermaid
// plain text. Doesn't reuse buildAnalyzeArgs (src/analysis/
// analysisRunner.ts) because that helper always appends --compact, which
// is a JSON-output knob with no meaning for --format mermaid.
import type { CommandRunner } from '../environment/commandRunner';
import { firstNonEmptyLine } from '../environment/textUtils';

export class ProgramFlowMermaidFetchError extends Error {
  constructor(message: string, readonly stderr?: string) {
    super(message);
    this.name = 'ProgramFlowMermaidFetchError';
  }
}

export async function fetchProgramFlowMermaid(
  run: CommandRunner,
  executablePath: string,
  cblPath: string
): Promise<string> {
  // Deliberately never pass --copybook-path -- see the identical rationale
  // on fetchProgramFlow (src/paragraphTree/programFlowClient.ts): expanding
  // copybooks shifts line numbers and can introduce PROCEDURE DIVISION
  // paragraphs the JSON report (built without expansion) doesn't know
  // about, desyncing buildLineIndex()'s click-to-reveal targets from what's
  // actually drawn.
  const args = ['analyze', 'program-flow', cblPath, '--format', 'mermaid'];
  const result = await run(executablePath, args);
  if (result.code !== 0) {
    throw new ProgramFlowMermaidFetchError(
      firstNonEmptyLine(result.stderr) ?? 'mockymock analyze program-flow --format mermaid failed',
      result.stderr
    );
  }
  return result.stdout;
}
