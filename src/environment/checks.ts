import { CommandRunner } from './commandRunner';

export async function checkCommandAvailable(
  run: CommandRunner,
  executablePath: string,
  args: string[]
): Promise<boolean> {
  const result = await run(executablePath, args);
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

export function resolveExecutablePath(configuredPath: string | undefined): string {
  return configuredPath && configuredPath.trim().length > 0 ? configuredPath.trim() : 'mockymock';
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
