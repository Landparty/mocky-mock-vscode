import { CommandRunner, OutputListener } from '../environment/commandRunner';

export function buildRunArgs(
  cblPath: string,
  cutPath: string,
  junitXmlPath: string,
  copybookPaths: string[]
): string[] {
  const args = ['run', cblPath, '--cut', cutPath, '--junit-xml', junitXmlPath];
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
}

export interface MockymockRunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  junitXml: string | null;
}

export async function runSuite(
  options: RunSuiteOptions,
  run: CommandRunner,
  readFileIfExists: (path: string) => Promise<string | null>,
  onOutput?: OutputListener
): Promise<MockymockRunResult> {
  const args = buildRunArgs(options.cblPath, options.cutPath, options.junitXmlPath, options.copybookPaths);
  const result = await run(options.executablePath, args, onOutput);
  const junitXml = await readFileIfExists(options.junitXmlPath);
  return { exitCode: result.code, stdout: result.stdout, stderr: result.stderr, junitXml };
}
