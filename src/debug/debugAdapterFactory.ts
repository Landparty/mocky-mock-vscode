import * as vscode from 'vscode';
import { resolveExecutablePath } from '../environment/checks';
import { buildDebugArgs, MockymockDebugConfiguration } from './debugArgs';

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
    const workspaceUri = session.workspaceFolder?.uri;
    const configuredPath = workspaceUri
      ? vscode.workspace.getConfiguration('mockymock', workspaceUri).get<string>('executablePath')
      : vscode.workspace.getConfiguration('mockymock').get<string>('executablePath');
    const executablePath = resolveExecutablePath(config.executablePath ?? configuredPath, this.extensionPath);
    return new vscode.DebugAdapterExecutable(executablePath, buildDebugArgs(config));
  }
}
