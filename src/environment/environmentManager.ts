// src/environment/environmentManager.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { runCommand } from './commandRunner';
import {
  checkCommandAvailable,
  checkDocker,
  describeDockerLaunchFailure,
  describeDockerStartFailure,
  getDockerDesktopLaunchCommand,
  permissionDeniedMessageForPath,
  resolveExecutablePath,
} from './checks';
import { CUT_DISCOVERY_EXCLUDE_GLOB } from '../discovery/cutDiscovery';

export interface ReadyResult {
  ok: boolean;
  message: string;
}

export class EnvironmentManager {
  private statusBarItem: vscode.StatusBarItem;
  private readonly context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.name = 'mockymock';
    this.statusBarItem.command = 'mockymock.checkEnvironment';
    context.subscriptions.push(this.statusBarItem);
    // Text-only, no show(): activateIfCutWorkspace() below decides whether
    // the item is ever revealed at startup, but ensureReady() can also
    // reveal it later (e.g. an explicit "Check Environment Status" click in
    // a workspace with no .cut file yet) -- setting real text here up front
    // means that later show() never exposes a blank item while the CLI/
    // Docker probe is still in flight.
    this.setStatus('$(sync) mockymock: checking…', 'Checking for the mockymock CLI and Docker…');
    void this.activateIfCutWorkspace();
  }

  // `onLanguage:cobol` (added alongside the Outline provider) now activates
  // the extension for ANY opened .cbl/.cob/.cobol file, even in a workspace
  // with no mockymock .cut tests at all -- unlike the original
  // workspaceContains:**/*.cut activation event, which only ever fired in a
  // real mockymock workspace. Without this check, opening a random COBOL
  // file anywhere would show an uninvited "mockymock: checking…" status bar
  // item and spawn a CLI --version probe. Reuses the same "does a .cut file
  // exist anywhere in the workspace" signal the old activation event relied
  // on, via the same CUT_DISCOVERY_EXCLUDE_GLOB testController.ts uses for
  // its own findFiles('**/*.cut', ...) scan.
  private async activateIfCutWorkspace(): Promise<void> {
    const [cutFile] = await vscode.workspace.findFiles('**/*.cut', CUT_DISCOVERY_EXCLUDE_GLOB, 1);
    if (!cutFile) return;
    this.statusBarItem.show();
    // ensureReady() (CLI install, Docker launch) only ever runs as a side
    // effect of an actual test run, so without this the "checking…" label
    // above would sit there — never true, never resolved — for the entire
    // session until the user happens to run a test. This is read-only (no
    // install, no Docker launch) so it's safe to fire on activation.
    void this.refreshStatus();
  }

  private setStatus(text: string, tooltip?: string) {
    this.statusBarItem.text = text;
    this.statusBarItem.tooltip = tooltip ?? text;
  }

  // Read-only status probe for the status bar: reports what's there without
  // installing anything or launching Docker. ensureReady() (below) is the
  // one that actually fixes problems, and is what the status bar item's
  // click command invokes.
  async refreshStatus(): Promise<void> {
    const executablePath = resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock').get<string>('executablePath'),
      this.context.extensionPath
    );
    const mockymockProbe = await runCommand(executablePath, ['--version']);
    if (mockymockProbe.code !== 0) {
      if (mockymockProbe.stderr === 'permission denied') {
        this.setStatus('$(error) mockymock: permission denied', permissionDeniedMessageForPath(executablePath));
      } else {
        this.setStatus('$(warning) mockymock: CLI not found', 'Click to install the mockymock CLI');
      }
      return;
    }
    const dockerStatus = await checkDocker(runCommand);
    if (dockerStatus === 'available') {
      this.setStatus('$(check) mockymock: ready');
    } else if (dockerStatus === 'daemon-down') {
      this.setStatus('$(warning) mockymock: Docker not running', 'Click to start Docker Desktop');
    } else {
      this.setStatus('$(warning) mockymock: Docker not installed', 'Click to open the Docker Desktop download page');
    }
  }

  async ensureReady(): Promise<ReadyResult> {
    this.statusBarItem.show();
    const executablePath = resolveExecutablePath(
      vscode.workspace.getConfiguration('mockymock').get<string>('executablePath'),
      this.context.extensionPath
    );

    const mockymockProbe = await runCommand(executablePath, ['--version']);
    if (mockymockProbe.code !== 0) {
      if (mockymockProbe.stderr === 'permission denied') {
        // The binary exists but the OS refused to run it -- attempting a uv
        // reinstall below would just install a second, unrelated copy and
        // mask the actual problem (most commonly, macOS Gatekeeper blocking
        // a quarantined binary). Shown as an error dialog (matching
        // installMockymock's own failure branches below) since this only
        // runs from an explicit "Check Environment Status" invocation or a
        // real test run -- not the passive activation-time refreshStatus().
        const message = permissionDeniedMessageForPath(executablePath);
        this.setStatus('$(error) mockymock: permission denied', message);
        vscode.window.showErrorMessage(message);
        return { ok: false, message };
      }
      const installed = await this.installMockymock(executablePath);
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
      const { started, launchError } = await this.startDockerDesktopAndWait();
      if (started) {
        this.setStatus('$(check) mockymock: ready');
        return { ok: true, message: 'ready' };
      }
      const message = describeDockerStartFailure(launchError);
      this.setStatus('$(error) mockymock: Docker did not start', message);
      return { ok: false, message };
    }

    this.setStatus('$(warning) mockymock: Docker not installed', 'Click to install Docker Desktop');
    this.promptInstallDocker();
    return { ok: false, message: 'Docker Desktop is not installed. Install it, then re-run the test.' };
  }

  private async installMockymock(executablePath: string): Promise<boolean> {
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
          'git+https://github.com/Landparty/mocky-mock.git',
        ]);
        if (result.code !== 0) {
          vscode.window.showErrorMessage(
            `mockymock install failed: ${result.stderr || result.stdout}. If this is a GitHub auth error, run "gh auth setup-git" and try again.`
          );
          return false;
        }
        // uv installs its shim into a directory (e.g. ~/.local/bin) that may not be on
        // this already-running VS Code process's in-memory PATH yet. Re-verify the CLI is
        // actually invocable before declaring success, so we don't silently proceed to the
        // Docker check and fail later with a confusing raw spawn error.
        const nowAvailable = await checkCommandAvailable(runCommand, executablePath, ['--version']);
        if (!nowAvailable) {
          vscode.window.showWarningMessage(
            "mockymock was installed, but this VS Code window can't see it yet. Reload the window (Developer: Reload Window) and try again."
          );
          return false;
        }
        return true;
      }
    );
  }


  private async startDockerDesktopAndWait(): Promise<{ started: boolean; launchError?: string }> {
    const launch = getDockerDesktopLaunchCommand(process.platform);
    if (!launch) {
      return {
        started: false,
        launchError: `Docker Desktop auto-launch is not supported on this platform (${process.platform})`,
      };
    }
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Starting Docker Desktop…' },
      async () => {
        const launchResult = await runCommand(launch.command, launch.args);
        const launchError = describeDockerLaunchFailure(launchResult);
        if (launchError) {
          return { started: false, launchError };
        }
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          const status = await checkDocker(runCommand);
          if (status === 'available') {
            return { started: true };
          }
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        return { started: false };
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
      })
      .then(undefined, () => undefined);
  }
}
