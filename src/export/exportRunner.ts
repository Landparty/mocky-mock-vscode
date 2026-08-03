// Pure, vscode-independent export invocation builder and runner -- kept
// free of the vscode import (like testing/mockymockRunner.ts and
// debug/debugArgs.ts) so it's unit-testable under mocha, which cannot
// resolve the 'vscode' module outside a running Extension Host.
// exportMainframe.ts (vscode-touching command registration) is the only
// consumer.
import { CommandRunner } from '../environment/commandRunner';

export function buildExportArgs(
  cblPath: string,
  cutPath: string,
  copybookPaths: string[],
  outputPath: string
): string[] {
  const args = ['export', cblPath, '--cut', cutPath, '--output', outputPath];
  for (const p of copybookPaths) args.push('--copybook-path', p);
  return args;
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
  run: CommandRunner
): Promise<ExportResult> {
  const args = buildExportArgs(cblPath, cutPath, copybookPaths, outputPath);
  const result = await run(executablePath, args);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr };
}
