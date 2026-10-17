// src/discovery/suiteIndexService.ts
//
// Keeps suitePairing.ts filled with the CLI's answer to "which program does
// each suite test", per workspace folder, via `mockymock suites --json`
// (Docker-free, parse-free). Refreshed on activation and whenever a suite,
// a program or a project config file is created, deleted or (for suites
// and configs) saved -- a PROGRAM line can be edited in place.
//
// Also the one place that asks the CLI where a NEW suite for a program goes
// (`mockymock suites PROG.cbl [--name topic] --json` -> newSuitePath), so
// New Test Suite follows the project's tests/ layout instead of guessing.
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { runCommand, runCommandIn, PROJECT_CONFIG_GLOB } from '../environment/commandRunner';
import { supportsSuitesCommand } from '../environment/checks';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { CUT_DISCOVERY_EXCLUDE_GLOB, resolveCutPath } from './cutDiscovery';
import {
  isProjectConfigFile,
  parseProgramSuites,
  parseSuitesListing,
  projectConfigDir,
  setPairings,
  SuitesListing,
} from './suitePairing';

const changed = new vscode.EventEmitter<void>();

// Fires after every refresh, so title-bar context keys can re-read.
export const onDidChangeSuitePairing = changed.event;

let extensionContext: vscode.ExtensionContext | undefined;

function readTextOrUndefined(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

// The CLI finds its project config by walking up from its working
// directory, and with no config the project root IS that directory -- so
// the cwd is the folder of the nearest config between the file and its
// workspace folder (a nested project's own mockymock.toml, which lint and
// run also see from the suite's folder), else the workspace folder itself.
function cwdFor(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
  if (!folder) return path.dirname(uri.fsPath);
  return projectConfigDir(path.dirname(uri.fsPath), folder, fs.existsSync, readTextOrUndefined);
}

// The workspace folder, then every nested project config root below it,
// shallowest first: setPairings lets the last listing of a suite win, so
// a nested project's own pairing beats the root's.
async function listingRoots(folder: vscode.WorkspaceFolder): Promise<string[]> {
  const configs = await vscode.workspace.findFiles(
    new vscode.RelativePattern(folder, PROJECT_CONFIG_GLOB),
    CUT_DISCOVERY_EXCLUDE_GLOB
  );
  const nested = new Set<string>();
  for (const config of configs) {
    const dir = path.dirname(config.fsPath);
    if (path.resolve(dir) === path.resolve(folder.uri.fsPath)) continue;
    if (isProjectConfigFile(config.fsPath, readTextOrUndefined)) nested.add(dir);
  }
  const byDepth = [...nested].sort((a, b) => a.split(path.sep).length - b.split(path.sep).length || a.localeCompare(b));
  return [folder.uri.fsPath, ...byDepth];
}

async function refresh(): Promise<void> {
  const context = extensionContext;
  if (!context) return;
  const listings: SuitesListing[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const { executablePath } = resolveInvocationConfig(context, folder.uri);
    if (!(await supportsSuitesCommand(runCommand, executablePath))) continue;
    for (const root of await listingRoots(folder)) {
      const result = await runCommandIn(root)(executablePath, ['suites', '--json']);
      const listing = result.code === 0 ? parseSuitesListing(result.stdout) : undefined;
      if (listing) listings.push(listing);
    }
  }
  setPairings(listings);
  changed.fire();
}

let timer: NodeJS.Timeout | undefined;
let running: Promise<void> | undefined;
let again = false;

// Debounced and serialized: a branch switch can touch hundreds of files.
function scheduleRefresh(): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    if (running) {
      again = true;
      return;
    }
    running = refresh()
      .catch(() => undefined)
      .finally(() => {
        running = undefined;
        if (again) {
          again = false;
          scheduleRefresh();
        }
      });
  }, 400);
}

export interface NewSuiteTarget {
  path: string;
  // false when the CLI couldn't say (too old, or failed): `path` is then
  // the sibling fallback beside the program.
  fromCli: boolean;
}

// Where a new suite for `cblPath` goes -- `<tests>/<folder>/PROG.cut`
// (or PROG.<topic>.cut) per the CLI's layout -- falling back to beside the
// program when the CLI can't answer.
export async function newSuiteTarget(cblPath: string, topic?: string): Promise<NewSuiteTarget> {
  const fallback = { path: resolveCutPath(cblPath, topic), fromCli: false };
  const context = extensionContext;
  if (!context) return fallback;
  const uri = vscode.Uri.file(cblPath);
  const { executablePath } = resolveInvocationConfig(context, uri);
  if (!(await supportsSuitesCommand(runCommand, executablePath))) return fallback;
  const args = ['suites', cblPath, '--json'];
  if (topic) args.push('--name', topic);
  const result = await runCommandIn(cwdFor(uri))(executablePath, args);
  const parsed = result.code === 0 ? parseProgramSuites(result.stdout) : undefined;
  return parsed ? { path: parsed.newSuitePath, fromCli: true } : fallback;
}

export function requestSuitePairingRefresh(): void {
  scheduleRefresh();
}

export function activateSuiteIndex(context: vscode.ExtensionContext): void {
  extensionContext = context;
  const suites = vscode.workspace.createFileSystemWatcher('**/*.cut');
  const programs = vscode.workspace.createFileSystemWatcher('**/*.{cbl,cob,cobol,CBL,COB,COBOL}', false, true, false);
  const configs = vscode.workspace.createFileSystemWatcher(PROJECT_CONFIG_GLOB);
  for (const watcher of [suites, programs, configs]) {
    watcher.onDidCreate(scheduleRefresh);
    watcher.onDidChange(scheduleRefresh);
    watcher.onDidDelete(scheduleRefresh);
  }
  context.subscriptions.push(
    suites,
    programs,
    configs,
    changed,
    vscode.workspace.onDidChangeWorkspaceFolders(scheduleRefresh),
    // A moved or deleted folder of suites/programs arrives as one event for
    // the folder, which the glob watchers above never match.
    vscode.workspace.onDidDeleteFiles(scheduleRefresh),
    vscode.workspace.onDidRenameFiles(scheduleRefresh),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mockymock.executablePath')) scheduleRefresh();
    }),
    { dispose: () => timer && clearTimeout(timer) }
  );
  // Only worth a CLI call in a workspace that has suites at all.
  void vscode.workspace.findFiles('**/*.cut', CUT_DISCOVERY_EXCLUDE_GLOB, 1).then((found) => {
    if (found.length) scheduleRefresh();
  });
}
