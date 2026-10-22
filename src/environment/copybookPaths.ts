// src/environment/copybookPaths.ts
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { anchorCommandPath } from './commandRunner';

// Kept free of any `vscode` import so both stay unit-testable outside the
// extension host.
export function resolveAgainstWorkspaceRoot(p: string, root: string): string {
  return path.isAbsolute(p) ? p : path.join(root, p);
}

export interface SettingPathContext {
  // The workspace folder the setting applies to, if any.
  folder?: string;
  // Resolves `${workspaceFolder:name}` to that folder's path.
  namedFolder?: (name: string) => string | undefined;
  homeDir?: string;
}

// VS Code substitutes no variables in extension settings, so a path setting
// written the way launch.json and tasks.json allow -- `~/...`,
// `${userHome}/...`, `${workspaceFolder}/...`, `${workspaceFolder:name}/...`
// -- reached the CLI literally. A variable with nothing to stand for (no
// folder open) is left as written.
export function expandSettingPath(p: string, ctx: SettingPathContext = {}): string {
  const home = ctx.homeDir ?? os.homedir();
  let out = p.trim();
  if (out === '~' || /^~[\\/]/.test(out)) out = home + out.slice(1);
  out = out.replace(/\$\{(userHome|workspaceFolder)(?::([^}]+))?\}/g, (whole, name: string, folderName?: string) => {
    if (name === 'userHome') return folderName === undefined ? home : whole;
    const folder = folderName === undefined ? ctx.folder : ctx.namedFolder?.(folderName);
    return folder ?? whole;
  });
  // `~/x` on Windows is now `C:\\Users\\sam/x`: give it one separator style.
  return path.isAbsolute(out) ? path.normalize(out) : out;
}

// mockymock.executablePath: variables expanded, then a relative path (one
// with a separator, like `.venv/bin/mockymock`) resolved against the
// workspace folder rather than the extension host's cwd -- which, for a
// VS Code launched from the Dock or Start menu, is `/` or the install
// directory. A bare name (`mockymock`) is still looked up on PATH.
export function resolveExecutablePathSetting(p: string | undefined, ctx: SettingPathContext = {}): string | undefined {
  if (!p || p.trim().length === 0) return p;
  const expanded = expandSettingPath(p, ctx);
  return ctx.folder ? anchorCommandPath(expanded, ctx.folder) : expanded;
}

// mockymock.copybookPaths entries: variables expanded, then every relative
// entry resolved against the workspace folder.
export function resolveCopybookPathSetting(p: string, ctx: SettingPathContext = {}): string {
  const expanded = expandSettingPath(p, ctx);
  return ctx.folder ? resolveAgainstWorkspaceRoot(expanded, ctx.folder) : expanded;
}

// Dedup key that treats case (Windows' filesystem is case-insensitive), a
// trailing separator (path.join/path.normalize preserve one if the input
// segment ends in one), and -- on win32 only -- separator STYLE as the same
// path. The separator-style normalization matters because the two sources
// merged below don't share one: mockymock.copybookPaths is a user-typed
// setting (native backslashes on Windows), while zapp.yml-derived paths are
// forward-slash-normalized upstream (zappConfig.ts's resolveLocation, for
// glob compatibility) even when the source .yml itself used backslashes.
// The same absolute directory declared in both would otherwise fail to
// dedup on separator style alone. Not applied on POSIX, where a backslash
// is an ordinary filename character, not a separator -- folding it there
// would wrongly treat two DIFFERENT paths as the same one.
function dedupKey(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  if (process.platform !== 'win32') return trimmed;
  return trimmed.replace(/\\/g, '/').toLowerCase();
}

// Combines mockymock.copybookPaths-setting-derived and zapp.yml-derived
// copybook paths, deduped -- primaryPaths (the explicit, user-configured
// setting) are listed first and win the dedup, since an explicit local
// override should take precedence over the project's auto-discovered
// zapp.yml convention; secondaryPaths (zapp.yml) fill in anything the
// setting didn't already cover.
export function mergeCopybookPaths(primaryPaths: string[], secondaryPaths: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const p of [...primaryPaths, ...secondaryPaths]) {
    const key = dedupKey(p);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(p);
    }
  }
  return result;
}

// Where the copybook library locations for one CLI invocation came from.
// `explicit` is mockymock.copybookPaths when the user set it anywhere
// (`[]` included); `companion` is cobolAnalyzer.copybookPaths, read only
// when `explicit` is unset; `zapp` is the zapp.yml library locations.
export interface CopybookPathSources {
  explicit: string[] | undefined;
  companion: string[];
  zapp: string[];
  // A cobol.yml / mockymock.toml / pyproject [tool.mockymock] the CLI
  // would read from the file's folder up.
  hasProjectConfig: boolean;
  // The installed CLI takes --extra-copybook-path.
  supportsExtraCopybookPath: boolean;
}

export interface PlannedCopybookPaths {
  // Passed as --copybook-path: replaces the project config's list.
  copybookPaths: string[];
  // Passed as --extra-copybook-path: added after the project config's list.
  extraCopybookPaths: string[];
}

// Which flag each copybook library location travels on (issues #130, #145).
// The CLI's --copybook-path REPLACES the copybook list of a cobol.yml or
// mockymock.toml, so only a list the user typed into mockymock.copybookPaths
// goes there. Locations the extension discovered on the user's behalf
// (zapp.yml, the companion's setting) go on --extra-copybook-path, which the
// CLI appends to whatever the project config says. An explicit `[]` means
// "no copybook paths from the extension", zapp.yml included. A CLI too old
// for --extra-copybook-path gets the old single list, minus the zapp.yml
// locations when a project config exists: passing them would silently throw
// away the config's own list.
export function planCopybookPaths(sources: CopybookPathSources): PlannedCopybookPaths {
  const { explicit, companion, zapp, hasProjectConfig, supportsExtraCopybookPath } = sources;
  if (explicit !== undefined && explicit.length === 0) {
    return { copybookPaths: [], extraCopybookPaths: [] };
  }
  const primary = explicit ?? [];
  const inherited = explicit === undefined ? mergeCopybookPaths(companion, zapp) : zapp;
  if (supportsExtraCopybookPath) {
    const primaryKeys = new Set(primary.map(dedupKey));
    return {
      copybookPaths: primary,
      extraCopybookPaths: inherited.filter((p) => !primaryKeys.has(dedupKey(p))),
    };
  }
  const keptZapp = hasProjectConfig && explicit === undefined ? [] : zapp;
  return {
    copybookPaths: mergeCopybookPaths(explicit ?? companion, keptZapp),
    extraCopybookPaths: [],
  };
}

// The argv for one invocation's copybook library locations.
export function copybookPathArgs(copybookPaths: string[], extraCopybookPaths: string[] = []): string[] {
  const args: string[] = [];
  for (const p of copybookPaths) args.push('--copybook-path', p);
  for (const p of extraCopybookPaths) args.push('--extra-copybook-path', p);
  return args;
}

const PROJECT_CONFIG_FILES = ['cobol.yml', 'cobol.yaml', 'mockymock.toml'];

// Whether the CLI, started in `startDir`, would find a project config: the
// same files it looks for, from that folder up.
export function hasProjectConfig(startDir: string): boolean {
  let dir = path.resolve(startDir);
  for (;;) {
    for (const name of PROJECT_CONFIG_FILES) {
      if (fs.existsSync(path.join(dir, name))) return true;
    }
    const pyproject = path.join(dir, 'pyproject.toml');
    if (fs.existsSync(pyproject)) {
      try {
        if (/^\s*\[tool\.mockymock\b/m.test(fs.readFileSync(pyproject, 'utf8'))) return true;
      } catch {
        // unreadable: the CLI could not read it either
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) return false;
    dir = parent;
  }
}
