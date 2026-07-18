// src/environment/environmentManager.ts
import * as vscode from 'vscode';
import { runCommand } from './commandRunner';
import {
  checkCommandAvailable,
  checkDocker,
  getDockerDesktopLaunchCommand,
  resolveExecutablePath,
} from './checks';

export interface ReadyResult {
  ok: boolean;
  message: string;
}

export class EnvironmentManager {
  private statusBarItem: vscode.StatusBarItem;

  constructor(context: vscode.ExtensionContext) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.name = 'mockymock';
    context.subscriptions.push(this.statusBarItem);
    this.setStatus('$(sync) mockymock: checking…');
    this.statusBarItem.show();
  }

  private setStatus(text: string, tooltip?: string) {
    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip ?? text;
  }

  async ensureReady(): Promise<ReadyResult> {
    const executablePath = resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock').get<string>('executablePath')
    );

    const mockymockOk = await checkCommandAvailable(runCommand, executablePath, ['--version']);
    if (!mockymockOk) {
      const installed = await this.installMockymock();
      if (!installed) {
        this.setStatus('$(error) mockymock: CLI not found');
        return {
          ok: false,
          message: 'mockymock CLI is not installed and automatic install failed. See the mocky-mock README for manual install steps.',
        };
      }
    }

    const dockerStatus = await checkDocker(runCommand);
    if (dockerStatus === 'available') {
      this.setStatus('$(check) mockymock: ready');
      return { ok: true, message: 'ready' };
    }

    if (dockerStatus === 'daemon-down') {
      const started = await this.startDockerDesktopAndWait();
      if (started) {
        this.setStatus('$(check) mockymock: ready');
        return { ok: true, message: 'ready' };
      }
      this.setStatus('$(error) mockymock: Docker did not start');
      return {
        ok: false,
        message: 'Docker Desktop did not become ready within the timeout. Start it manually and try again.',
      };
    }

    this.setStatus('$(warning) mockymock: Docker not installed', 'Click to install Docker Desktop');
    this.promptInstallDocker();
    return { ok: false, message: 'Docker Desktop is not installed. Install it, then re-run the test.' };
  }

  private async installMockymock(): Promise<boolean> {
    this.setStatus('$(sync~spin) mockymock: installing CLI…');
    const uvOk = await checkCommandAvailable(runCommand, 'uv', ['--version']);
    if (!uvOk) {
      const choice = await vscode.window.showWarningMessage(
        'mockymock CLI is not installed, and uv (needed to install it) was not found either.',
        'Open uv install instructions'
      );
      if (choice) {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.astral.sh/uv/getting-started/installation/'));
      }
      return false;
    }
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Installing mockymock CLI via uv…' },
      async () => {
        const result = await runCommand('uv', [
          'tool',
          'install',
          'git+https://github.com/samdion1994/mocky-mock.git',
        ]);
        if (result.code !== 0) {
          vscode.window.showErrorMessage(
            `mockymock install failed: ${result.stderr || result.stdout}. If this is a GitHub auth error, run "gh auth setup-git" and try again.`
          );
          return false;
        }
        return true;
      }
    );
  }

  private async startDockerDesktopAndWait(): Promise<boolean> {
    const launch = getDockerDesktopLaunchCommand(process.platform);
    if (!launch) {
      return false;
    }
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Starting Docker Desktop…' },
      async () => {
        await runCommand(launch.command, launch.args);
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const status = await checkDocker(runCommand);
          if (status === 'available') {
            return true;
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return false;
      }
    );
  }

  private promptInstallDocker() {
    vscode.window
      .showWarningMessage('Docker Desktop is required to run mockymock tests and was not found.', 'Open Docker Desktop download page')
      .then((choice) => {
        if (choice) {
          vscode.env.openExternal(vscode.Uri.parse('https://www.docker.com/products/docker-desktop/'));
        }
      });
  }
}
