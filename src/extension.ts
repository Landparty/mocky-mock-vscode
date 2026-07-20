// src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';
import { activateLintDiagnostics } from './linting/lintDiagnostics';

export function activate(context: vscode.ExtensionContext) {
  const environmentManager = new EnvironmentManager(context);
  activateTestController(context, environmentManager);
  activateLintDiagnostics(context);

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
