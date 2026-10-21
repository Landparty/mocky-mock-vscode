// Pure, vscode-independent export invocation builder and runner -- kept
// free of the vscode import (like testing/mockymockRunner.ts and
// debug/debugArgs.ts) so it's unit-testable under mocha, which cannot
// resolve the 'vscode' module outside a running Extension Host.
// exportMainframe.ts (vscode-touching command registration) is the only
// production consumer; exportMainframe.test.ts imports these functions
// directly too -- the entire reason this file exists as a separate,
// vscode-free module.
import { CommandRunner } from '../environment/commandRunner';
import { copybookPathArgs } from '../environment/copybookPaths';

export function buildExportArgs(
  cblPath: string,
  cutPath: string,
  copybookPaths: string[],
  outputPath: string,
  extraCopybookPaths: string[] = []
): string[] {
  return ['export', cblPath, '--cut', cutPath, '--output', outputPath, ...copybookPathArgs(copybookPaths, extraCopybookPaths)];
}

export interface ExportResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export async function runExport(
  executablePath: string,
  cblPath: string,
  cutPath: string,
  copybookPaths: string[],
  outputPath: string,
  run: CommandRunner,
  extraCopybookPaths: string[] = []
): Promise<ExportResult> {
  const args = buildExportArgs(cblPath, cutPath, copybookPaths, outputPath, extraCopybookPaths);
  const result = await run(executablePath, args);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr };
}
