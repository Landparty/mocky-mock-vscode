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

// Positive-result cache for the supports*() capability probes below. Each
// probe spawns a `--help` process, and the two webview side views re-probe
// on EVERY refresh -- one editor switch with both views open used to cost
// two --help spawns before the real work even started. Keyed by
// (runner, executablePath):
//  - per-path, so changing mockymock.executablePath self-invalidates (the
//    new path simply has no entry);
//  - per-runner via WeakMap, so unit tests injecting fresh fake runners
//    never see each other's cache (production always passes the same
//    module-level runCommand);
//  - POSITIVE results only: a `true` can only go stale by downgrading the
//    CLI in place (not worth defending), while caching `false` would make
//    an in-place upgrade invisible until a window reload.
const capabilityCache = new WeakMap<CommandRunner, Map<string, true>>();

async function probeCapability(
  run: CommandRunner,
  executablePath: string,
  cacheKey: string,
  probe: () => Promise<boolean>
): Promise<boolean> {
  let byKey = capabilityCache.get(run);
  if (!byKey) {
    byKey = new Map();
    capabilityCache.set(run, byKey);
  }
  const key = `${cacheKey}:${executablePath}`;
  if (byKey.get(key)) return true;
  const ok = await probe();
  if (ok) byKey.set(key, true);
  return ok;
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
  return probeCapability(run, executablePath, 'trace', async () => {
    const result = await run(executablePath, ['run', '--help']);
    return result.code === 0 && result.stdout.includes('--trace-json');
  });
}

// Same "check first, degrade gracefully" pattern as supportsTraceFlag, but for
// a whole subcommand rather than a flag: an installed CLI that predates
// `mockymock debug` exits 2 (argparse's "invalid choice" for an unknown
// subcommand) on `debug --help`. Checking for `--dap-stdio` specifically
// (rather than just a zero exit code) also catches the unlikely case of a
// `debug` subcommand existing without the exact flag this extension needs.
export async function supportsDebugCommand(run: CommandRunner, executablePath: string): Promise<boolean> {
  return probeCapability(run, executablePath, 'debug', async () => {
    const result = await run(executablePath, ['debug', '--help']);
    return result.code === 0 && result.stdout.includes('--dap-stdio');
  });
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
  return probeCapability(run, executablePath, 'export', async () => {
    const result = await run(executablePath, ['export', '--help']);
    return result.code === 0 && result.stdout.includes('--output');
  });
}



// Same "check first, degrade gracefully" pattern as supportsDebugCommand/
// supportsExportCommand, but for the `mutate` subcommand: an installed CLI
// that predates `mockymock mutate` exits 2 (argparse's "invalid choice" for
// an unknown subcommand) on `mutate --help`. Checking for `--json-report`
// specifically -- the flag buildMutateArgs actually passes -- also catches
// the unlikely case of a `mutate` subcommand existing without the exact
// flag this extension needs.
export async function supportsMutateCommand(run: CommandRunner, executablePath: string): Promise<boolean> {
  return probeCapability(run, executablePath, 'mutate', async () => {
    const result = await run(executablePath, ['mutate', '--help']);
    return result.code === 0 && result.stdout.includes('--json-report');
  });
}

// Same "check first, degrade gracefully" pattern as supportsExportCommand,
// but for the `generate` subcommand (the Docker-free .cut scaffolder behind
// "New Test Suite"): an installed CLI that predates `mockymock generate`
// exits 2 on `generate --help`. Checking for `--output` specifically -- the
// flag buildGenerateArgs actually passes -- also catches a `generate`
// subcommand that exists without it.
export async function supportsGenerateCommand(run: CommandRunner, executablePath: string): Promise<boolean> {
  return probeCapability(run, executablePath, 'generate', async () => {
    const result = await run(executablePath, ['generate', '--help']);
    return result.code === 0 && result.stdout.includes('--output');
  });
}

export type DockerStatus = 'available' | 'daemon-down' | 'not-installed';

// Matches stderr produced when the shell itself couldn't find the "docker" (or
// mockymock) executable (as opposed to the binary being found but failing for
// some other reason). This is what a missing binary looks like under
// `shell: true` on Windows (cmd.exe) -- "is not recognized..." -- or
// commandRunner's own ENOENT sentinel on POSIX (shell:false there; see
// describeSpawnError) -- the literal string "command not found".
//
// Deliberately does NOT include a bare "no such file or directory": that
// generic errno text is NOT how this codebase's own spawn failures present
// (POSIX never runs through a shell here, so ENOENT is caught synchronously
// as the sentinel above, never as real shell text) -- but it IS a completely
// ordinary substring of a real mockymock CLI refusal, e.g. a Python
// FileNotFoundError for an unresolved copybook: "refused: COPY ORDER.cpy:
// [Errno 2] No such file or directory: '...'". describeRefreshError below is
// fed exactly that kind of real CLI stderr (not just a spawn-failure
// sentinel) by callers like paragraphTreeViewProvider.ts's catch block, so
// including this phrase used to relabel an ordinary "copybook not found"
// refusal as "mockymock CLI not found", masking the real error entirely.
const COMMAND_NOT_FOUND_PATTERN = /not recognized|is not recognized|command not found/i;

// A found-and-running docker CLI that can't reach its daemon prints a
// connect error (Linux with the daemon stopped: "error during connect: ...
// dial unix /var/run/docker.sock: connect: no such file or directory";
// Windows: "error during connect: open //./pipe/docker_engine: ..."), which
// is unambiguous evidence Docker itself was found and ran. Checked first, so
// a daemon-connect failure is always classified daemon-down regardless of
// its errno text -- specifically before COMMAND_NOT_FOUND_PATTERN, since
// that errno text alone is otherwise ambiguous with a missing binary.
const DOCKER_DAEMON_CONNECT_PATTERN =
  /error during connect|cannot connect to the docker daemon|docker daemon is not running|dial unix|docker_engine/i;

export async function checkDocker(run: CommandRunner): Promise<DockerStatus> {
  const result = await run('docker', ['info']);
  if (result.code === 0) return 'available';
  if (result.code === -1) return 'not-installed';
  if (DOCKER_DAEMON_CONNECT_PATTERN.test(result.stderr)) return 'daemon-down';
  if (COMMAND_NOT_FOUND_PATTERN.test(result.stderr)) return 'not-installed';
  return 'daemon-down';
}

export const CLI_NOT_FOUND_MESSAGE =
  "mockymock CLI not found — set mockymock.executablePath or run 'mockymock: Check Setup'.";

// The message for commandRunner's EACCES sentinel (see describeSpawnError in
// commandRunner.ts): the binary exists but the OS refused to execute it.
// The dominant real-world cause is macOS Gatekeeper blocking a downloaded,
// unsigned/quarantined binary -- distinct enough from "not found" (which
// tells users to reinstall something that's already there) to need its own
// message and its own fix.
export const CLI_PERMISSION_DENIED_MESSAGE =
  "mockymock CLI found but couldn't be run (permission denied). On macOS this is usually Gatekeeper blocking an unsigned binary — run 'mockymock: Check Setup' to see the exact path and fix command.";

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

// True when `executablePath` is the CLI binary shipped inside this
// extension's own .vsix (see resolveExecutablePath's bundled branch) -- as
// opposed to a user-configured path or a PATH/uv install. The distinction
// matters for what to tell the user when that CLI is too old for a feature:
// a bundled CLI is only ever upgraded by updating the extension itself.
export function isBundledExecutable(executablePath: string, extensionPath: string): boolean {
  const bundledDir = path.join(extensionPath, 'bin');
  return executablePath === path.join(bundledDir, 'mockymock') || executablePath === path.join(bundledDir, 'mockymock.exe');
}

// One consistent "your mockymock CLI can't do X" message for every feature
// gated on a supports*() probe above, worded by where that CLI came from:
// the bundled binary can only be updated by updating the extension, so
// telling those users to "upgrade mockymock" sends them looking for a
// package manager that isn't involved. `feature` is a short noun phrase
// ("interactive debugging", "creating a test suite").
export function describeTooOldCli(executablePath: string, extensionPath: string, feature: string): string {
  if (isBundledExecutable(executablePath, extensionPath)) {
    return `The mockymock CLI bundled with this extension doesn't support ${feature} yet. Update the mockymock extension to its latest release to get it.`;
  }
  return `mockymock at "${executablePath}" is too old to support ${feature}. Upgrade mockymock and try again, or clear the mockymock.executablePath setting to use the CLI bundled with this extension.`;
}

// The full "why can't I use X?" explanation for a failed supports*() probe.
// A false from those probes could mean "found but too old" OR "not found at
// all" -- a second, cheap --version probe distinguishes them so a missing
// binary is told to fix its setup instead of to "upgrade" something that
// isn't there (the same describeRefreshError mapping the side views use).
export async function describeUnsupportedFeature(
  run: CommandRunner,
  executablePath: string,
  extensionPath: string,
  feature: string
): Promise<string> {
  const probe = await run(executablePath, ['--version']);
  return describeRefreshError(describeTooOldCli(executablePath, extensionPath, feature), probe.stderr);
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

// Injectable purely so the darwin fallback above can be tested hermetically.
// Two of its three candidates are ABSOLUTE host paths (/opt/homebrew/bin,
// /usr/local/bin), which a test cannot neutralize by passing a scratch
// homeDir: on any machine that genuinely has mockymock installed there --
// a real contributor's Mac, and any CI image that pip/brew-installs the CLI
// to run integration checks -- the "no candidate exists" case became
// untestable and its assertion failed against the host's own filesystem.
// Production callers keep the fs.existsSync default; only tests pass a fake.
export type FileExistsProbe = (candidatePath: string) => boolean;

export function resolveExecutablePath(
  configuredPath: string | undefined,
  extensionPath: string,
  platform: NodeJS.Platform = process.platform,
  homeDir: string = os.homedir(),
  fileExists: FileExistsProbe = fs.existsSync
): string {
  if (configuredPath && configuredPath.trim().length > 0) {
    return configuredPath.trim();
  }
  const bundledPath = path.join(extensionPath, 'bin', bundledBinaryName(platform));
  if (fileExists(bundledPath)) {
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
    const fallback = darwinPathFallbackCandidates(homeDir).find((candidate) => fileExists(candidate));
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
