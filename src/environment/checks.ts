import * as fs from 'fs';
import * as path from 'path';
import { CommandRunner } from './commandRunner';

export async function checkCommandAvailable(
  run: CommandRunner,
  executablePath: string,
  args: string[]
): Promise<boolean> {
  const result = await run(executablePath, args);
  return result.code === 0;
}

// `mockymock run --trace-json PATH` is a flag argparse may not recognize on
// an older installed CLI -- and an unrecognized flag fails the ENTIRE `run`
// invocation (argparse exit 2), not just that flag. Probing with `--help`
// first is cheap and always succeeds regardless of the command's OTHER
// required arguments (argparse's --help short-circuits before validating
// `program`/`--cut`), so this is a safe capability check to run before ever
// using the flag for real -- exactly the discoverSuites-style "check first,
// degrade gracefully" pattern, applied to a flag instead of a subcommand.
export async function supportsTraceFlag(run: CommandRunner, executablePath: string): Promise<boolean> {
  const result = await run(executablePath, ['run', '--help']);
  return result.code === 0 && result.stdout.includes('--trace-json');
}

// Same "check first, degrade gracefully" pattern as supportsTraceFlag, but for
// a whole subcommand rather than a flag: an installed CLI that predates
// `mockymock debug` exits 2 (argparse's "invalid choice" for an unknown
// subcommand) on `debug --help`. Checking for `--dap-stdio` specifically
// (rather than just a zero exit code) also catches the unlikely case of a
// `debug` subcommand existing without the exact flag this extension needs.
export async function supportsDebugCommand(run: CommandRunner, executablePath: string): Promise<boolean> {
  const result = await run(executablePath, ['debug', '--help']);
  return result.code === 0 && result.stdout.includes('--dap-stdio');
}

export type DockerStatus = 'available' | 'daemon-down' | 'not-installed';

// Matches stderr produced when the shell itself couldn't find the "docker" executable
// (as opposed to docker being found but failing to reach its daemon). This is what a
// missing binary looks like under `shell: true` on Windows (cmd.exe) and on POSIX shells.
const COMMAND_NOT_FOUND_PATTERN = /not recognized|is not recognized|command not found|no such file or directory/i;

export async function checkDocker(run: CommandRunner): Promise<DockerStatus> {
  const result = await run('docker', ['info']);
  if (result.code === 0) return 'available';
  if (result.code === -1) return 'not-installed';
  if (COMMAND_NOT_FOUND_PATTERN.test(result.stderr)) return 'not-installed';
  return 'daemon-down';
}

export function bundledBinaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'mockymock.exe' : 'mockymock';
}

export function resolveExecutablePath(configuredPath: string | undefined, extensionPath: string): string {
  if (configuredPath && configuredPath.trim().length > 0) {
    return configuredPath.trim();
  }
  const bundledPath = path.join(extensionPath, 'bin', bundledBinaryName(process.platform));
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  return 'mockymock';
}

export interface LaunchCommand {
  command: string;
  args: string[];
}

export function getDockerDesktopLaunchCommand(platform: NodeJS.Platform): LaunchCommand | null {
  if (platform === 'win32') {
    return { command: '"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"', args: [] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', 'Docker'] };
  }
  if (platform === 'linux') {
    return { command: 'systemctl', args: ['start', 'docker'] };
  }
  return null;
}
