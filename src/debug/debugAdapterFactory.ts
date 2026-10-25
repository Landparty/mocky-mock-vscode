import * as vscode from 'vscode';
import { toolchainEnvironment } from '../environment/bundledToolchain';
import { resolveExecutablePath } from '../environment/checks';
import { anchorCommandPath } from '../environment/commandRunner';
import { resolveExecutablePathSetting } from '../environment/copybookPaths';
import { configuredExecutablePath, settingPathContext } from '../environment/invocationConfig';
import { buildDebugArgs, debugAdapterCwd, MockymockDebugConfiguration } from './debugArgs';

// vscode.DebugConfiguration carries a `[key: string]: any` index signature, so
// casting session.configuration to the plain (vscode-independent, unit-tested)
// MockymockDebugConfiguration shape from debugArgs.ts is a safe narrowing, not
// an unrelated-types cast.
export class MockymockDebugAdapterDescriptorFactory implements vscode.DebugAdapterDescriptorFactory {
  constructor(private readonly extensionPath: string) {}

  createDebugAdapterDescriptor(
    session: vscode.DebugSession,
    _executable: vscode.DebugAdapterExecutable | undefined
  ): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    const config = session.configuration as unknown as MockymockDebugConfiguration;
    const configuredPath =
      resolveExecutablePathSetting(config.executablePath, settingPathContext(session.workspaceFolder)) ??
      configuredExecutablePath(session.workspaceFolder);
    const executablePath = resolveExecutablePath(configuredPath, this.extensionPath);
    const cwd = debugAdapterCwd(config);
    // A relative path left over here (no workspace folder to resolve it
    // against) keeps meaning the host-cwd binary, whatever cwd the adapter
    // itself runs in.
    // env: the bundled-GnuCOBOL variables applyToolchainEnvironment() put on
    // this host's process.env, passed on explicitly so the adapter runs on
    // the same toolchain as a test run.
    return new vscode.DebugAdapterExecutable(anchorCommandPath(executablePath, process.cwd()), buildDebugArgs(config), {
      cwd,
      env: toolchainEnvironment(),
    });
  }
}
