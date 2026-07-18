import { spawn } from 'child_process';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

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

export const runCommand: CommandRunner = (command, args) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    const useShell = process.platform === 'win32';
    const spawnArgs = useShell ? args.map(quoteArgForWindowsShell) : args;
    try {
      child = spawn(command, spawnArgs, { shell: useShell });
    } catch {
      resolve({ code: -1, stdout: '', stderr: 'command not found' });
      return;
    }
    child.stdout?.on('data', (d) => (stdout += d.toString()));
    child.stderr?.on('data', (d) => (stderr += d.toString()));
    child.on('error', () => resolve({ code: -1, stdout, stderr: stderr || 'command not found' }));
    child.on('close', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
};
