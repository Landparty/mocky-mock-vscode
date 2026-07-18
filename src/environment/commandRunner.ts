import { spawn } from 'child_process';

export interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CommandRunner = (command: string, args: string[]) => Promise<CommandResult>;

export const runCommand: CommandRunner = (command, args) => {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let child;
    try {
      child = spawn(command, args, { shell: process.platform === 'win32' });
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
