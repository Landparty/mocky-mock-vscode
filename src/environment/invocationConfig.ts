// src/environment/invocationConfig.ts
import * as path from 'path';
import * as vscode from 'vscode';
import { resolveExecutablePath, supportsExtraCopybookPath } from './checks';
import { runCommand } from './commandRunner';
import { resolveZappCopybookPaths } from './zappConfig';
import {
  hasProjectConfig,
  planCopybookPaths,
  resolveCopybookPathSetting,
  resolveExecutablePathSetting,
  SettingPathContext,
} from './copybookPaths';

export interface InvocationConfig {
  executablePath: string;
  // --copybook-path: replaces a project config's copybook list.
  copybookPaths: string[];
  // --extra-copybook-path: appended to it (see planCopybookPaths).
  extraCopybookPaths: string[];
}

// Reads mockymock.copybookPaths, falling back to cobolAnalyzer.copybookPaths
// when this extension has no value of its own. The COBOL Analyzer extension
// (the companion that owns COBOL language support and static analysis --
// see README's "Companion extension") does the mirror-image fallback onto
// mockymock.copybookPaths, so a workspace only ever has to declare its
// copybook library locations once, in whichever of the two settings the
// user reached for first. Both name the same copybook libraries for two
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
// who deliberately empties this setting is not silently given the other one
// -- nor the zapp.yml locations (#145).
function readCopybookPathsSetting(
  uri: vscode.Uri,
  config: vscode.WorkspaceConfiguration
): { explicit: string[] | undefined; companion: string[] } {
  const own = config.inspect<string[]>('copybookPaths');
  const explicit = own?.workspaceFolderValue ?? own?.workspaceValue ?? own?.globalValue;
  if (explicit !== undefined) return { explicit, companion: [] };
  const companion = vscode.workspace
    .getConfiguration('cobolAnalyzer', uri)
    .get<string[]>('copybookPaths');
  return { explicit: undefined, companion: companion ?? config.get<string[]>('copybookPaths') ?? [] };
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
// scoped to `uri`'s own workspace folder. `~`/`${workspaceFolder}` are
// expanded and relative entries (and a relative executablePath) resolved
// against the workspace folder; absolute ones and folder-less files pass
// through unchanged. Copybook library locations declared in a
// zapp.yml/zapp.yaml at the workspace root, and the companion's
// cobolAnalyzer.copybookPaths, are added too; planCopybookPaths decides
// which flag each one travels on. `supportsExtra` is whether the installed
// CLI takes --extra-copybook-path (resolveCliInvocationConfig probes it);
// callers that only want executablePath can leave it out.
export function resolveInvocationConfig(
  context: vscode.ExtensionContext,
  uri: vscode.Uri,
  supportsExtra = false
): InvocationConfig {
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const config = vscode.workspace.getConfiguration('mockymock', uri);
  const pathContext = settingPathContext(workspaceFolder);
  const executablePath = resolveExecutablePath(
    resolveExecutablePathSetting(config.get<string>('executablePath'), pathContext),
    context.extensionPath
  );
  const { explicit, companion } = readCopybookPathsSetting(uri, config);
  const resolve = (p: string): string => resolveCopybookPathSetting(p, pathContext);
  const planned = planCopybookPaths({
    explicit: explicit?.map(resolve),
    companion: companion.map(resolve),
    zapp: workspaceFolder ? resolveZappCopybookPaths(workspaceFolder.uri.fsPath) : [],
    hasProjectConfig: !supportsExtra && hasProjectConfig(path.dirname(uri.fsPath)),
    supportsExtraCopybookPath: supportsExtra,
  });
  return { executablePath, ...planned };
}

// resolveInvocationConfig for a call that passes copybook paths to the CLI:
// probes (once per CLI path) whether it takes --extra-copybook-path.
export async function resolveCliInvocationConfig(
  context: vscode.ExtensionContext,
  uri: vscode.Uri
): Promise<InvocationConfig> {
  const executablePath = resolveExecutablePath(
    resolveExecutablePathSetting(
      vscode.workspace.getConfiguration('mockymock', uri).get<string>('executablePath'),
      settingPathContext(vscode.workspace.getWorkspaceFolder(uri))
    ),
    context.extensionPath
  );
  const supportsExtra = await supportsExtraCopybookPath(runCommand, executablePath);
  return resolveInvocationConfig(context, uri, supportsExtra);
}

// The settings resolveInvocationConfig reads (the copybook paths, their
// cobolAnalyzer fallback, the CLI itself): changing any of them changes
// lint results and completion's boundaries without any file being saved.
export const INVOCATION_SETTINGS = [
  'mockymock.copybookPaths',
  'cobolAnalyzer.copybookPaths',
  'mockymock.executablePath',
];
