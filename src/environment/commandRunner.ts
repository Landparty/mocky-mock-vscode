import { spawn } from 'child_process';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type OutputListener = (chunk: string, stream: 'stdout' | 'stderr') => void;

export type CommandRunner = (
  command: string,
  args: string[],
  onOutput?: OutputListener,
  signal?: AbortSignal
) => Promise<CommandResult>;

// When spawn() is invoked with `shell: true`, Node hands the args array to cmd.exe by
// joining it into a single command-line string WITHOUT adding any quoting of its own.
// That means an argument containing a space or a double-quote (e.g. a path under
// "C:\Users\Sam Dion\...") gets split apart by the shell before mockymock/docker/uv ever
// sees it. This helper individually quotes such args so they survive that join+re-parse.
// It must only be applied when shell is actually true (Windows) — with shell:false, Node
// passes the args array directly to the OS with no shell re-parsing, so quoting there
// would corrupt the argument instead of protecting it.
export function quoteArgForWindowsShell(arg: string): string {
  if (/[\s"]/.test(arg)) {
    return `"${arg.replace(/"/g, '\\"')}"`;
  }
  return arg;
}

// Node's spawn() reports *why* it couldn't run the command via err.code
// (an errno string) -- ENOENT means the executable genuinely isn't there,
// EACCES means it exists but the OS refused to execute it (missing +x, or
// on macOS, Gatekeeper blocking a quarantined/unsigned binary). Collapsing
// both to the same "command not found" string -- as this used to do --
// makes a Gatekeeper block look identical to a missing CLI and sends users
// chasing the wrong fix (reinstalling something that's already there).
export function describeSpawnError(err: NodeJS.ErrnoException): string {
  return err.code === 'EACCES' ? 'permission denied' : 'command not found';
}

export const runCommand: CommandRunner = (command, args, onOutput, signal) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    const useShell = process.platform === 'win32';
    // The command itself needs the same quoting as the args (below): shell:true joins
    // file+args into one command-line string for cmd.exe, and Node does not quote `file`
    // for you, so an executablePath containing a space (e.g. a custom mockymock.executablePath
    // setting under "C:\Program Files\...") would otherwise be split apart before cmd.exe
    // even looks for it.
    const spawnCommand = useShell ? quoteArgForWindowsShell(command) : command;
    const spawnArgs = useShell ? args.map(quoteArgForWindowsShell) : args;
    try {
      // Node's own AbortSignal support kills the child (SIGTERM) when the
      // signal fires — this is how a Test Explorer "cancel" actually stops
      // an in-flight mockymock/docker process instead of merely being
      // noted between files.
      child = spawn(spawnCommand, spawnArgs, { shell: useShell, signal });
    } catch (err) {
      resolve({ code: -1, stdout: '', stderr: describeSpawnError(err as NodeJS.ErrnoException) });
      return;
    }
    child.stdout?.on('data', (d) => {
      const text = d.toString();
      stdout += text;
      onOutput?.(text, 'stdout');
    });
    child.stderr?.on('data', (d) => {
      const text = d.toString();
      stderr += text;
      onOutput?.(text, 'stderr');
    });
    child.on('error', (err) =>
      resolve({
        code: -1,
        stdout,
        stderr: signal?.aborted ? 'run cancelled' : stderr || describeSpawnError(err as NodeJS.ErrnoException),
      })
    );
    child.on('close', (code) =>
      resolve({
        code: code ?? -1,
        stdout,
        stderr: signal?.aborted && !stderr ? 'run cancelled' : stderr,
      })
    );
  });
};
