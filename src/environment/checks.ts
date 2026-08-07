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

// Same "check first, degrade gracefully" pattern as supportsDebugCommand,
// but for the `export` subcommand: an installed CLI that predates
// `mockymock export` exits 2 (argparse's "invalid choice" for an unknown
// subcommand) on `export --help`. Checking for `--output` specifically
// (rather than just a zero exit code) also catches the unlikely case of
// an `export` subcommand existing without the exact flag this extension
// needs -- `--output` is the flag buildExportArgs actually passes, and
// argparse lists a flag in --help even with no help= text of its own
// (only help=SUPPRESS would hide it).
export async function supportsExportCommand(run: CommandRunner, executablePath: string): Promise<boolean> {
  const result = await run(executablePath, ['export', '--help']);
  return result.code === 0 && result.stdout.includes('--output');
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

export const CLI_NOT_FOUND_MESSAGE =
  "mockymock CLI not found — set mockymock.executablePath or run 'mockymock: Check Environment Status'.";

// Maps commandRunner's ENOENT sentinel -- a CommandResult of
// `{ code: -1, stdout: '', stderr: 'command not found' }`, produced when
// spawn() itself can't find the executable (see commandRunner.ts's
// synchronous try/catch and its 'error' listener) -- to an actionable
// label instead of surfacing that raw sentinel string verbatim in a Boundaries
// view error node. bundleClient.fetchBundle carries `result.stderr` straight
// through onto BundleError.stderr, so it reaches here unchanged. Reuses
// COMMAND_NOT_FOUND_PATTERN (not just the exact sentinel string) so the
// Windows shell:true "'mockymock' is not recognized ..." shape -- the same
// one checkDocker's own 'not-installed' branch already recognizes -- is
// caught too. Pure string logic: no vscode import, directly unit-testable.
export function describeRefreshError(message: string, stderr: string | undefined): string {
  if (stderr !== undefined && COMMAND_NOT_FOUND_PATTERN.test(stderr)) {
    return CLI_NOT_FOUND_MESSAGE;
  }
  return message;
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

// Maps the running machine to the exact release asset filename produced by
// mocky-mock's release workflow (.github/workflows/release-please.yml) --
// keep these three names in sync with that workflow's build matrix. Returns
// null for any OS/arch combination the release workflow doesn't build (e.g.
// Intel Mac), so callers can fall back to the uv/pip install path instead.
export function resolveReleaseAssetName(platform: NodeJS.Platform, arch: string): string | null {
  if (platform === 'linux' && arch === 'x64') return 'mockymock-linux-x86_64';
  if (platform === 'darwin' && arch === 'arm64') return 'mockymock-macos-arm64';
  if (platform === 'win32' && arch === 'x64') return 'mockymock-windows-amd64.exe';
  return null;
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
