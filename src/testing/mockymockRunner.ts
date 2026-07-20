import { CommandRunner, OutputListener } from '../environment/commandRunner';

export interface RunArgExtras {
  jsonReportPath?: string;
  coverageJsonPath?: string;
  caseNames?: string[];
}

export function buildRunArgs(
  cblPath: string,
  cutPath: string,
  junitXmlPath: string,
  copybookPaths: string[],
  extras: RunArgExtras = {}
): string[] {
  const args = ['run', cblPath, '--cut', cutPath, '--junit-xml', junitXmlPath];
  if (extras.jsonReportPath) {
    args.push('--json-report', extras.jsonReportPath);
  }
  if (extras.coverageJsonPath) {
    args.push('--coverage-json', extras.coverageJsonPath);
  }
  for (const name of extras.caseNames ?? []) {
    args.push('--case', name);
  }
  for (const p of copybookPaths) {
    args.push('--copybook-path', p);
  }
  return args;
}

export interface RunSuiteOptions {
  executablePath: string;
  cblPath: string;
  cutPath: string;
  junitXmlPath: string;
  copybookPaths: string[];
  /** Temp path for --json-report; when set, the result carries its content. */
  jsonReportPath?: string;
  /** Temp path for --coverage-json; when set, the result carries its content. */
  coverageJsonPath?: string;
  /** Restrict the run to these TESTCASE names (mockymock run --case ...). */
  caseNames?: string[];
}

export interface MockymockRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  junitXml: string | null;
  jsonReport: string | null;
  coverageJson: string | null;
}

export async function runSuite(
  options: RunSuiteOptions,
  run: CommandRunner,
  readFileIfExists: (path: string) => Promise<string | null>,
  onOutput?: OutputListener,
  signal?: AbortSignal
): Promise<MockymockRunResult> {
  const args = buildRunArgs(options.cblPath, options.cutPath, options.junitXmlPath, options.copybookPaths, {
    jsonReportPath: options.jsonReportPath,
    coverageJsonPath: options.coverageJsonPath,
    caseNames: options.caseNames,
  });
  const result = await run(options.executablePath, args, onOutput, signal);
  const junitXml = await readFileIfExists(options.junitXmlPath);
  const jsonReport = options.jsonReportPath ? await readFileIfExists(options.jsonReportPath) : null;
  const coverageJson = options.coverageJsonPath ? await readFileIfExists(options.coverageJsonPath) : null;
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, junitXml, jsonReport, coverageJson };
}
