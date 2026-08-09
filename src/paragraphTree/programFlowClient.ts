import type { CommandRunner } from '../environment/commandRunner';
import { firstNonEmptyLine } from '../environment/textUtils';
import { runAnalyze } from '../analysis/analysisRunner';
import type { ProgramFlowReport } from './programFlowModel';

export class ProgramFlowFetchError extends Error {
  constructor(message: string, readonly stderr?: string) {
    super(message);
    this.name = 'ProgramFlowFetchError';
  }
}

export async function fetchProgramFlow(
  run: CommandRunner,
  executablePath: string,
  cblPath: string,
  copybookPaths: string[]
): Promise<ProgramFlowReport> {
  const result = await runAnalyze(executablePath, 'program-flow', cblPath, copybookPaths, run);
  if (result.exitCode !== 0) {
    throw new ProgramFlowFetchError(
      firstNonEmptyLine(result.stderr) ?? 'mockymock analyze program-flow failed',
      result.stderr
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new ProgramFlowFetchError('mockymock analyze program-flow output was not valid JSON', result.stdout.slice(0, 200));
  }

  const report = parsed as ProgramFlowReport;
  if (!Array.isArray(report.nodes) || !Array.isArray(report.edges) || !Array.isArray(report.entry_points)) {
    throw new ProgramFlowFetchError('mockymock analyze program-flow output is missing nodes/edges/entry_points');
  }
  return report;
}
