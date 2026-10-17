// src/environment/invocationConfig.ts
import * as vscode from 'vscode';
import { resolveExecutablePath } from './checks';
import { resolveZappCopybookPaths } from './zappConfig';
import {
  mergeCopybookPaths,
  resolveCopybookPathSetting,
  resolveExecutablePathSetting,
  SettingPathContext,
} from './copybookPaths';

export interface InvocationConfig {
  executablePath: string;
  copybookPaths: string[];
}

// Reads mockymock.copybookPaths, falling back to cobolAnalyzer.copybookPaths
// when this extension has no value of its own. The COBOL Analyzer extension
// (the companion that owns COBOL language support and static analysis --
// see README's "Companion extension") does the mirror-image fallback onto
// mockymock.copybookPaths, so a workspace only ever has to declare its
// copybook library locations once, in whichever of the two settings the
// user reached for first. Both feed the same `--copybook-path` flag on two
// different CLIs, so there is nothing to get wrong by sharing them.
//
// Deliberately NOT done for executablePath: cobolAnalyzer.executablePath
// points at the cobol-parser binary, which is a DIFFERENT program from
// mockymock. Inheriting it would silently invoke the wrong CLI -- and since
// cobol-parser's own argv parser prepends `parse` to an unrecognized first
// positional, some invocations would half-work rather than fail cleanly.
//
// `undefined` (not just an empty array) is the "unset" signal: inspect()
// distinguishes "no value anywhere" from "explicitly set to []", so a user
// who deliberately empties this setting is not silently given the other one.
function readCopybookPathsSetting(
  uri: vscode.Uri,
  config: vscode.WorkspaceConfiguration
): string[] {
  const own = config.inspect<string[]>('copybookPaths');
  const explicitlySet =
    own?.workspaceFolderValue ?? own?.workspaceValue ?? own?.globalValue;
  if (explicitlySet !== undefined) return explicitlySet;
  const companion = vscode.workspace
    .getConfiguration('cobolAnalyzer', uri)
    .get<string[]>('copybookPaths');
  return companion ?? config.get<string[]>('copybookPaths') ?? [];
}

// What `~`, `${workspaceFolder}` and a relative path in a path setting mean
// for a setting read on behalf of `folder` (see copybookPaths.ts).
export function settingPathContext(folder: vscode.WorkspaceFolder | undefined): SettingPathContext {
  return {
    folder: folder?.uri.fsPath,
    namedFolder: (name) => vscode.workspace.workspaceFolders?.find((f) => f.name === name)?.uri.fsPath,
  };
}

// mockymock.executablePath as the CLI should be spawned, for `folder` (the
// folder of the file being acted on; the first workspace folder for the
// workspace-wide setup probes).
export function configuredExecutablePath(folder: vscode.WorkspaceFolder | undefined): string | undefined {
  const configured = vscode.workspace.getConfiguration('mockymock', folder?.uri).get<string>('executablePath');
  return resolveExecutablePathSetting(configured, settingPathContext(folder));
}

// Resolves the mockymock.executablePath + mockymock.copybookPaths settings
// scoped to `uri`'s own workspace folder -- the same lookup previously
// duplicated in boundariesTreeProvider.refresh() and extension.ts's
// generateCut command handler (a third copy lives in exportMainframe.ts,
// predating this file). `~`/`${workspaceFolder}` are expanded and relative
// entries (and a relative executablePath) resolved against the workspace
// folder; absolute ones and folder-less files pass through unchanged. Also merges in copybook library locations declared in
// a zapp.yml/zapp.yaml at the workspace root, if present -- the explicit
// setting takes precedence over zapp.yml on a collision (mergeCopybookPaths'
// first argument wins), since a user-configured override should beat the
// project's auto-discovered convention.
export function resolveInvocationConfig(context: vscode.ExtensionContext, uri: vscode.Uri): InvocationConfig {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const config = vscode.workspace.getConfiguration('mockymock', uri);
  const pathContext = settingPathContext(workspaceFolder);
  const executablePath = resolveExecutablePath(
    resolveExecutablePathSetting(config.get<string>('executablePath'), pathContext),
    context.extensionPath
  );
  const settingCopybookPaths = readCopybookPathsSetting(uri, config).map((p) => resolveCopybookPathSetting(p, pathContext));
  const zappCopybookPaths = workspaceFolder ? resolveZappCopybookPaths(workspaceFolder.uri.fsPath) : [];
  return { executablePath, copybookPaths: mergeCopybookPaths(settingCopybookPaths, zappCopybookPaths) };
}
