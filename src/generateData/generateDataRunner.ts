// Pure, vscode-independent CLI invocation builder and runner -- kept free
// of the vscode import (like analysis/analysisRunner.ts) so it's
// unit-testable under mocha. generateData.ts (vscode-touching command
// registration, Task 3) is the only production consumer.
//
// `analyze gen-data` rides mockymock's unguarded `analyze` passthrough
// (main.py's _cmd_analyze forwards its REMAINDER args verbatim into
// cobolparser.cli.parse.main() with no subcommand allowlist) straight into
// cobol-parser's own `gen-data` CLI. See the design doc's "Scope" section
// for why this is deliberate rather than a first-class mockymock
// subcommand.
import { CommandRunner } from '../environment/commandRunner';

export interface GenerateDataResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export function buildGenerateDataArgs(filePath: string): string[] {
  return ['analyze', 'gen-data', filePath, '--rows', '10'];
}

export async function runGenerateData(
  executablePath: string,
  filePath: string,
  run: CommandRunner
): Promise<GenerateDataResult> {
  const args = buildGenerateDataArgs(filePath);
  const result = await run(executablePath, args);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr };
}
