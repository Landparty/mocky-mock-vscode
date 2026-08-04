// src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';
import { activateLintDiagnostics } from './linting/lintDiagnostics';
import { MockymockDebugAdapterDescriptorFactory } from './debug/debugAdapterFactory';
import { MockymockDebugConfigurationProvider } from './debug/debugConfigurationProvider';
import { activateExportMainframeCommand } from './export/exportMainframe';

const MOCKYMOCK_DEBUG_TYPE = 'mockymock-cobol';

export function activate(context: vscode.ExtensionContext) {
  const environmentManager = new EnvironmentManager(context);
  activateTestController(context, environmentManager);
  activateLintDiagnostics(context);
  activateExportMainframeCommand(context);

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(
      MOCKYMOCK_DEBUG_TYPE,
      new MockymockDebugAdapterDescriptorFactory(context.extensionPath)
    ),
    vscode.debug.registerDebugConfigurationProvider(MOCKYMOCK_DEBUG_TYPE, new MockymockDebugConfigurationProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.checkEnvironment', async () => {
      const result = await environmentManager.ensureReady();
      // On failure ensureReady() has already shown the relevant actionable
      // prompt itself (install the CLI, start Docker, open the download
      // page); a success needs its own feedback since the status bar text
      // change alone is easy to miss on a deliberate "is this set up?" click.
      if (result.ok) {
        vscode.window.showInformationMessage('mockymock: ready to run tests.');
      }
    })
  );
}

export function deactivate() {}
