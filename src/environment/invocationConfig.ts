// src/environment/invocationConfig.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { resolveExecutablePath } from './checks';

export interface InvocationConfig {
  executablePath: string;
  copybookPaths: string[];
}

// Resolves the mockymock.executablePath + mockymock.copybookPaths settings
// scoped to `uri`'s own workspace folder -- the same lookup previously
// duplicated in boundariesTreeProvider.refresh() and extension.ts's
// generateCut command handler (a third copy lives in exportMainframe.ts,
// predating this file). Relative copybookPaths entries are resolved
// against the workspace folder; absolute ones and folder-less files pass
// through unchanged.
export function resolveInvocationConfig(context: vscode.ExtensionContext, uri: vscode.Uri): InvocationConfig {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const config = vscode.workspace.getConfiguration('mockymock', uri);
  const executablePath = resolveExecutablePath(config.get<string>('executablePath'), context.extensionPath);
  const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
    workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
  );
  return { executablePath, copybookPaths };
}
