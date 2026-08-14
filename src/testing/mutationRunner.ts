import { CommandRunner, OutputListener } from '../environment/commandRunner';

// `mockymock mutate` has no --case flag: the suite compiles as one binary
// and every mutant faces the WHOLE suite, so there is nothing narrower to
// select. --timeout stays on the CLI default (15s per mutant).
export function buildMutateArgs(
  cblPath: string,
  cutPath: string,
  jsonReportPath: string,
  copybookPaths: string[]
): string[] {
  const args = ['mutate', cblPath, '--cut', cutPath, '--json-report', jsonReportPath];
  for (const p of copybookPaths) {
    args.push('--copybook-path', p);
  }
  return args;
}

export interface MutateOptions {
  executablePath: string;
  cblPath: string;
  cutPath: string;
  /** Temp path for --json-report; the result carries its content. */
  jsonReportPath: string;
  copybookPaths: string[];
}

export interface MutateResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  jsonReport: string | null;
}

export async function runMutate(
  options: MutateOptions,
  run: CommandRunner,
  readFileIfExists: (path: string) => Promise<string | null>,
  onOutput?: OutputListener,
  signal?: AbortSignal
): Promise<MutateResult> {
  const args = buildMutateArgs(options.cblPath, options.cutPath, options.jsonReportPath, options.copybookPaths);
  const result = await run(options.executablePath, args, onOutput, signal);
  const jsonReport = await readFileIfExists(options.jsonReportPath);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, jsonReport };
}
