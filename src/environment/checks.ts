import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { CommandResult, CommandRunner } from './commandRunner';

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

// Same "check first, degrade gracefully" pattern as supportsDebugCommand/
// supportsExportCommand, but for the `analyze` subcommand: an installed
// CLI that predates `mockymock analyze` exits 2 (argparse's "invalid
// choice" for an unknown subcommand) on `analyze --help`. Checking for
// `COBOL_PARSER_ARGS` specifically -- the explicit metavar on the
// passthrough's REMAINDER argument -- rather than just a zero exit code
// also catches the unlikely case of an `analyze` subcommand existing
// without the expected passthrough argument.
export async function supportsAnalyzeCommand(run: CommandRunner, executablePath: string): Promise<boolean> {
  const result = await run(executablePath, ['analyze', '--help']);
  return result.code === 0 && result.stdout.includes('COBOL_PARSER_ARGS');
}

// Same "check first, degrade gracefully" pattern as supportsAnalyzeCommand,
// but for the `gen-data` cobol-parser subcommand specifically -- reached via
// mockymock's `analyze` passthrough. supportsAnalyzeCommand alone would pass
// on any mockymock build whose *pinned cobolparser* predates `gen-data`,
// which then fails at runtime with argparse's "invalid choice: 'gen-data'"
// instead of a clean upgrade message. `analyze gen-data --help` exits 0
// (argparse short-circuits --help before validating other args) exactly
// when gen-data exists in that build's cobolparser.
export async function supportsGenerateDataCommand(run: CommandRunner, executablePath: string): Promise<boolean> {
  const result = await run(executablePath, ['analyze', 'gen-data', '--help']);
  return result.code === 0;
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

// The message for commandRunner's EACCES sentinel (see describeSpawnError in
// commandRunner.ts): the binary exists but the OS refused to execute it.
// The dominant real-world cause is macOS Gatekeeper blocking a downloaded,
// unsigned/quarantined binary -- distinct enough from "not found" (which
// tells users to reinstall something that's already there) to need its own
// message and its own fix.
export const CLI_PERMISSION_DENIED_MESSAGE =
  "mockymock CLI found but couldn't be run (permission denied). On macOS this is usually Gatekeeper blocking an unsigned binary — run 'mockymock: Check Environment Status' to see the exact path and fix command.";

// Same underlying problem as CLI_PERMISSION_DENIED_MESSAGE, but for the one
// caller (environmentManager.ts) that actually has the resolved
// executablePath in scope and can put the real path/command in front of the
// user instead of pointing them at another command to go find it.
export function permissionDeniedMessageForPath(executablePath: string): string {
  return `mockymock CLI at "${executablePath}" was found but couldn't be run (permission denied). On macOS this is usually Gatekeeper blocking an unsigned binary — in Terminal, run: xattr -d com.apple.quarantine "${executablePath}", then reload the window (Developer: Reload Window).`;
}

// Maps commandRunner's ENOENT/EACCES sentinels -- a CommandResult of
// `{ code: -1, stdout: '', stderr: 'command not found' | 'permission denied' }`,
// produced when spawn() itself can't run the executable (see commandRunner.ts's
// synchronous try/catch and its 'error' listener) -- to an actionable
// label instead of surfacing that raw sentinel string verbatim in a Boundaries
// view error node. bundleClient.fetchBundle carries `result.stderr` straight
// through onto BundleError.stderr, so it reaches here unchanged. Reuses
// COMMAND_NOT_FOUND_PATTERN (not just the exact sentinel string) so the
// Windows shell:true "'mockymock' is not recognized ..." shape -- the same
// one checkDocker's own 'not-installed' branch already recognizes -- is
// caught too. Pure string logic: no vscode import, directly unit-testable.
export function describeRefreshError(message: string, stderr: string | undefined): string {
  if (stderr === 'permission denied') {
    return CLI_PERMISSION_DENIED_MESSAGE;
  }
  if (stderr !== undefined && COMMAND_NOT_FOUND_PATTERN.test(stderr)) {
    return CLI_NOT_FOUND_MESSAGE;
  }
  return message;
}

export function bundledBinaryName(platform: NodeJS.Platform): string {
  return platform === 'win32' ? 'mockymock.exe' : 'mockymock';
}

// Common places `mockymock` ends up on macOS outside a bundled install: `uv
// tool install` (environmentManager.ts's installMockymock fallback) shims
// into ~/.local/bin, and a manual Homebrew-style install typically lands in
// /opt/homebrew/bin (Apple Silicon) or /usr/local/bin (Intel). homeDir is a
// parameter (not read via os.homedir() internally) so this stays directly
// unit-testable against a fake home directory.
export function darwinPathFallbackCandidates(homeDir: string): string[] {
  // path.posix (not path.join): these are macOS paths by definition, so they
  // must use forward slashes regardless of the OS this code happens to be
  // running/tested on (this repo's dev and CI machines are Windows/Linux).
  return [
    path.posix.join(homeDir, '.local', 'bin', 'mockymock'),
    '/opt/homebrew/bin/mockymock',
    '/usr/local/bin/mockymock',
  ];
}

export function resolveExecutablePath(
  configuredPath: string | undefined,
  extensionPath: string,
  platform: NodeJS.Platform = process.platform,
  homeDir: string = os.homedir()
): string {
  if (configuredPath && configuredPath.trim().length > 0) {
    return configuredPath.trim();
  }
  const bundledPath = path.join(extensionPath, 'bin', bundledBinaryName(platform));
  if (fs.existsSync(bundledPath)) {
    return bundledPath;
  }
  // A GUI-launched VS Code on macOS doesn't source ~/.zshrc / ~/.zprofile,
  // so process.env.PATH here can lack directories a login shell would have
  // -- notably ~/.local/bin, where the uv-install fallback below puts its
  // shim. Probing known install locations directly, before giving up to the
  // bare command name, catches a CLI a plain PATH lookup would miss.
  // Windows and Linux desktop sessions don't have this gap (PATH is set
  // system-wide, or sourced by the display manager), so this only runs on
  // darwin -- no behavior change for other platforms.
  if (platform === 'darwin') {
    const fallback = darwinPathFallbackCandidates(homeDir).find((candidate) => fs.existsSync(candidate));
    if (fallback) {
      return fallback;
    }
  }
  return 'mockymock';
}

export interface LaunchCommand {
  command: string;
  args: string[];
}

// Surfaces a non-zero exit from the OS-level Docker Desktop launch command
// (see getDockerDesktopLaunchCommand) as an actionable message, instead of
// silently discarding it and falling through to the 90s polling loop in
// environmentManager's startDockerDesktopAndWait. This is exactly the gap
// that let the win32 double-quoting bug (fixed below, in
// getDockerDesktopLaunchCommand) go unnoticed: cmd.exe returned exit 1 with
// "The filename, directory name, or volume label syntax is incorrect." and
// nothing ever looked at the result.
export function describeDockerLaunchFailure(result: CommandResult): string | undefined {
  if (result.code === 0) {
    return undefined;
  }
  const detail = result.stderr.trim() || result.stdout.trim() || `exit code ${result.code}`;
  return `Failed to launch Docker Desktop: ${detail}`;
}

// Builds the message ensureReady() shows when Docker Desktop didn't become
// ready: prefers the specific launch failure (from describeDockerLaunchFailure
// above, or the "not supported on this platform" case in
// startDockerDesktopAndWait) over the generic 90s-timeout message, and
// strips any trailing punctuation from it first so appending our own
// sentence can't produce "..".
export function describeDockerStartFailure(launchError: string | undefined): string {
  if (!launchError) {
    return 'Docker Desktop did not become ready within the timeout. Start it manually and try again.';
  }
  return `${launchError.replace(/[.!?]+$/, '')}. Start Docker Desktop manually and try again.`;
}

export function getDockerDesktopLaunchCommand(platform: NodeJS.Platform): LaunchCommand | null {
  if (platform === 'win32') {
    // Unquoted: commandRunner's runCommand (shell:true on win32) already
    // quotes any command/arg containing a space via quoteArgForWindowsShell
    // before handing it to cmd.exe. Pre-quoting here would make that helper
    // match on the embedded quote characters too and double-quote the
    // string, which cmd.exe then rejects outright.
    return { command: 'C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe', args: [] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: ['-a', 'Docker'] };
  }
  if (platform === 'linux') {
    return { command: 'systemctl', args: ['start', 'docker'] };
  }
  return null;
}
