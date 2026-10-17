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
import * as path from 'path';
import * as vscode from 'vscode';
import { runCommand, runCommandIn, PROJECT_CONFIG_GLOB } from '../environment/commandRunner';
import { supportsSuitesCommand } from '../environment/checks';
import { resolveInvocationConfig } from '../environment/invocationConfig';
import { CUT_DISCOVERY_EXCLUDE_GLOB, resolveCutPath } from './cutDiscovery';
import { parseProgramSuites, parseSuitesListing, setPairings, SuitesListing } from './suitePairing';

const changed = new vscode.EventEmitter<void>();

// Fires after every refresh, so title-bar context keys can re-read.
export const onDidChangeSuitePairing = changed.event;

let extensionContext: vscode.ExtensionContext | undefined;

// The CLI finds its project config by walking up from its working
// directory, and with no config the project root IS that directory -- so
// the workspace folder, not the file's own folder, is the right cwd.
function cwdFor(uri: vscode.Uri): string {
  return vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? path.dirname(uri.fsPath);
}

async function refresh(): Promise<void> {
  const context = extensionContext;
  if (!context) return;
  const listings: SuitesListing[] = [];
  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const { executablePath } = resolveInvocationConfig(context, folder.uri);
    if (!(await supportsSuitesCommand(runCommand, executablePath))) continue;
    const result = await runCommandIn(folder.uri.fsPath)(executablePath, ['suites', '--json']);
    const listing = result.code === 0 ? parseSuitesListing(result.stdout) : undefined;
    if (listing) listings.push(listing);
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
