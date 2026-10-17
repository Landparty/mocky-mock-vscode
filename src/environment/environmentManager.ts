// src/environment/environmentManager.ts
import * as vscode from 'vscode';
import { launchDetached, runCommand } from './commandRunner';
import {
  checkCommandAvailable,
  checkDocker,
  DOCKER_INFO_TIMEOUT_MS,
  describeDockerLaunchFailure,
  describeDockerStartFailure,
  DOCKER_PERMISSION_DENIED_MESSAGE,
  getDockerDesktopLaunchCommand,
  permissionDeniedMessageForPath,
  resolveExecutablePath,
} from './checks';
import { mockymockInstallRequirement } from './cliPackage';
import { configuredExecutablePath } from './invocationConfig';
import { presentStatus, SetupState, statusTooltipMarkdown } from './statusPresentation';
import { CUT_DISCOVERY_EXCLUDE_GLOB } from '../discovery/cutDiscovery';

export interface ReadyResult {
  ok: boolean;
  message: string;
  // True when ensureReady() already showed the user a prompt for this
  // failure, so an explicit Check Setup doesn't report it a second time.
  reported?: boolean;
}

export class EnvironmentManager {
  private statusBarItem: vscode.StatusBarItem;
  private readonly context: vscode.ExtensionContext;
  // In-flight ensureReady(), shared by concurrent callers -- see ensureReady().
  private ensureReadyInFlight: Promise<ReadyResult> | undefined;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.name = 'mockymock';
    this.statusBarItem.command = 'mockymock.checkEnvironment';
    context.subscriptions.push(this.statusBarItem);
    // Text-only, no show(): activateIfCutWorkspace() below decides whether
    // the item is ever revealed at startup, but ensureReady() can also
    // reveal it later (e.g. an explicit "Check Setup" click in
    // a workspace with no .cut file yet) -- setting real text here up front
    // means that later show() never exposes a blank item while the CLI/
    // Docker probe is still in flight.
    this.setStatus('checking');
    void this.activateIfCutWorkspace();
    // Fixing the setting (e.g. from the CLI-not-found toast's Open Settings)
    // should clear "CLI not found" right away, not at the next test run.
    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration('mockymock.executablePath')) void this.refreshStatus();
      })
    );
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

  private setStatus(state: SetupState, detail?: string) {
    const p = presentStatus(state, detail);
    this.statusBarItem.text = p.text;
    this.statusBarItem.backgroundColor = p.background ? new vscode.ThemeColor(p.background) : undefined;
    const tooltip = new vscode.MarkdownString(statusTooltipMarkdown(p), true);
    // Only our own three commands are linked from the hover.
    tooltip.isTrusted = {
      enabledCommands: ['mockymock.checkEnvironment', 'mockymock.openWalkthrough', 'workbench.action.openSettings'],
    };
    this.statusBarItem.tooltip = tooltip;
  }

  // Read-only status probe for the status bar: reports what's there without
  // installing anything or launching Docker. ensureReady() (below) is the
  // one that actually fixes problems, and is what the status bar item's
  // click command invokes.
  async refreshStatus(): Promise<void> {
    const executablePath = resolveExecutablePath(
      configuredExecutablePath(vscode.workspace.workspaceFolders?.[0]),
      this.context.extensionPath
    );
    const mockymockProbe = await runCommand(executablePath, ['--version']);
    if (mockymockProbe.code !== 0) {
      if (mockymockProbe.stderr === 'permission denied') {
        this.setStatus('cli-blocked', permissionDeniedMessageForPath(executablePath));
      } else {
        this.setStatus('cli-missing');
      }
      return;
    }
    const dockerStatus = await checkDocker(runCommand);
    if (dockerStatus === 'available') {
      this.setStatus('ready');
    } else if (dockerStatus === 'daemon-down') {
      this.setStatus('docker-stopped');
    } else if (dockerStatus === 'permission-denied') {
      this.setStatus('docker-denied', DOCKER_PERMISSION_DENIED_MESSAGE);
    } else {
      this.setStatus('docker-missing');
    }
  }

  // Concurrent callers share one probe: every parallel runOneFile worker
  // awaits ensureReady() before its CLI invocation, and without this guard a
  // cold-Docker run with maxParallelRuns > 1 launched Docker Desktop N times
  // and ran N independent 90-second `docker info` polling loops, each with
  // its own stacked progress notification. Only the in-flight promise is
  // shared -- a later call after settle re-probes from scratch, so this is
  // deduplication, not caching.
  //
  // `token` lets one caller stop waiting (Test Explorer's Stop) without
  // abandoning the shared probe the other callers are still awaiting.
  async ensureReady(token?: vscode.CancellationToken): Promise<ReadyResult> {
    if (!this.ensureReadyInFlight) {
      this.ensureReadyInFlight = this.doEnsureReady().finally(() => {
        this.ensureReadyInFlight = undefined;
      });
    }
    if (!token) return this.ensureReadyInFlight;
    if (token.isCancellationRequested) return { ok: false, message: 'run cancelled' };
    let listener: vscode.Disposable | undefined;
    const cancelled = new Promise<ReadyResult>((resolve) => {
      listener = token.onCancellationRequested(() => resolve({ ok: false, message: 'run cancelled' }));
    });
    try {
      return await Promise.race([this.ensureReadyInFlight, cancelled]);
    } finally {
      listener?.dispose();
    }
  }

  private async doEnsureReady(): Promise<ReadyResult> {
    this.statusBarItem.show();
    const executablePath = resolveExecutablePath(
      configuredExecutablePath(vscode.workspace.workspaceFolders?.[0]),
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
        // runs from an explicit "Check Setup" invocation or a
        // real test run -- not the passive activation-time refreshStatus().
        const message = permissionDeniedMessageForPath(executablePath);
        this.setStatus('cli-blocked', message);
        vscode.window.showErrorMessage(message);
        return { ok: false, message, reported: true };
      }
      const installed = await this.installMockymock(executablePath);
      if (!installed) {
        this.setStatus('cli-missing');
        return {
          ok: false,
          message: 'mockymock CLI is not installed and automatic install failed. See the mocky-mock README for manual install steps.',
          reported: true,
        };
      }
    }

    const dockerStatus = await checkDocker(runCommand);
    if (dockerStatus === 'available') {
      this.setStatus('ready');
      return { ok: true, message: 'ready' };
    }

    // The daemon is already up; only the user's access to its socket is
    // missing, which starting Docker and polling for 90 s can never fix.
    if (dockerStatus === 'permission-denied') {
      this.setStatus('docker-denied', DOCKER_PERMISSION_DENIED_MESSAGE);
      return { ok: false, message: DOCKER_PERMISSION_DENIED_MESSAGE };
    }

    if (dockerStatus === 'daemon-down') {
      const { started, launchError } = await this.startDockerDesktopAndWait();
      if (started) {
        this.setStatus('ready');
        return { ok: true, message: 'ready' };
      }
      const message = describeDockerStartFailure(launchError);
      this.setStatus('docker-failed', message);
      return { ok: false, message };
    }

    this.setStatus('docker-missing');
    this.promptInstallDocker();
    return { ok: false, message: 'Docker Desktop is not installed. Install it, then re-run the test.', reported: true };
  }

  private async installMockymock(executablePath: string): Promise<boolean> {
    this.setStatus('installing');

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
        // A released version from PyPI -- no git checkout, no GitHub auth.
        const result = await runCommand('uv', ['tool', 'install', mockymockInstallRequirement()]);
        if (result.code !== 0) {
          vscode.window.showErrorMessage(`mockymock install failed: ${result.stderr || result.stdout}`);
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
        const launchResult = launch.detached
          ? await launchDetached(launch.command, launch.args)
          : await runCommand(launch.command, launch.args);
        const launchError = describeDockerLaunchFailure(launchResult);
        if (launchError) {
          return { started: false, launchError };
        }
        const deadline = Date.now() + 90_000;
        while (Date.now() < deadline) {
          // Each poll is bounded by the time left, so one stalled
          // `docker info` can't carry the wait past the deadline.
          const status = await checkDocker(runCommand, Math.min(DOCKER_INFO_TIMEOUT_MS, deadline - Date.now()));
          if (status === 'available') {
            return { started: true };
          }
          await new Promise((resolve) => setTimeout(resolve, Math.max(0, Math.min(3000, deadline - Date.now()))));
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
