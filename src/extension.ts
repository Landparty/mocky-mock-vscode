// src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';

export function activate(context: vscode.ExtensionContext) {
  const environmentManager = new EnvironmentManager(context);
  activateTestController(context, environmentManager);
}

export function deactivate() {}
