// Pure, vscode-independent analyzer invocation builder and runner -- kept
// free of the vscode import (like export/exportRunner.ts) so it's
// unit-testable under mocha, which cannot resolve the 'vscode' module
// outside a running Extension Host. analyzeCobol.ts (vscode-touching
// command registration) is the only production consumer.
import { CommandRunner } from '../environment/commandRunner';

export type CobolAnalyzer =
  | 'dead-code'
  | 'program-flow'
  | 'io-sequence'
  | 'move-type-check'
  | 'linkage-check'
  | 'language-env'
  | 'ims-dli'
  | 'analyze';

export function buildAnalyzeArgs(
  analyzer: CobolAnalyzer,
  cblPath: string,
  copybookPaths: string[]
): string[] {
  const args = ['analyze', analyzer, cblPath, '--compact'];
  for (const p of copybookPaths) args.push('--copybook-path', p);
  return args;
}

export interface AnalyzeResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runAnalyze(
  executablePath: string,
  analyzer: CobolAnalyzer,
  cblPath: string,
  copybookPaths: string[],
  run: CommandRunner
): Promise<AnalyzeResult> {
  const args = buildAnalyzeArgs(analyzer, cblPath, copybookPaths);
  const result = await run(executablePath, args);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr };
}
