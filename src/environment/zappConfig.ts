// src/environment/zappConfig.ts
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { globSync, hasMagic } from 'glob';
import { resolveAgainstWorkspaceRoot } from './copybookPaths';

interface ZappLibrary {
  type?: string;
  locations?: string[];
}

interface ZappPropertyGroup {
  language?: string;
  libraries?: ZappLibrary[];
}

interface ZappConfig {
  propertyGroups?: ZappPropertyGroup[];
}

const ZAPP_FILE_NAMES = ['zapp.yml', 'zapp.yaml'];

function findZappFile(workspaceRoot: string): string | undefined {
  for (const name of ZAPP_FILE_NAMES) {
    const candidate = path.join(workspaceRoot, name);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return undefined;
}

interface ZappCacheEntry {
  mtimeMs: number;
  result: string[];
}

// Keyed on workspace root, invalidated by the zapp file's mtime -- avoids
// re-reading/re-parsing/re-globbing on every resolveInvocationConfig() call,
// which happens on every lint-on-save, move-check, and test-run invocation.
const zappCache = new Map<string, ZappCacheEntry>();

// Reads a zapp.yml/zapp.yaml at the workspace root (the same file/schema IBM
// Z Open Editor's DBB tooling uses) and returns the local cobol copybook
// library locations it declares, resolved to absolute paths. mvs-type
// libraries and non-cobol language groups are parsed but ignored -- the
// mockymock CLI only understands local filesystem paths today.
export function resolveZappCopybookPaths(workspaceRoot: string): string[] {
  const zappFile = findZappFile(workspaceRoot);
  if (!zappFile) {
    zappCache.delete(workspaceRoot);
    return [];
  }

  const mtimeMs = fs.statSync(zappFile).mtimeMs;
  const cached = zappCache.get(workspaceRoot);
  if (cached && cached.mtimeMs === mtimeMs) {
    return cached.result;
  }

  try {
    const config: ZappConfig = parseYaml(fs.readFileSync(zappFile, 'utf8')) ?? {};
    const propertyGroups = Array.isArray(config.propertyGroups) ? config.propertyGroups : [];
    const locations = propertyGroups
      .filter((group) => group.language?.toLowerCase() === 'cobol')
      .flatMap((group) => (Array.isArray(group.libraries) ? group.libraries : []))
      .filter((library) => library.type?.toLowerCase() === 'local')
      .flatMap((library) => (Array.isArray(library.locations) ? library.locations : []));

    const result = locations.flatMap((location) => resolveLocation(location, workspaceRoot));
    zappCache.set(workspaceRoot, { mtimeMs, result });
    return result;
  } catch (err) {
    console.warn(`mockymock: failed to parse ${zappFile}: ${err instanceof Error ? err.message : String(err)}`);
    zappCache.delete(workspaceRoot);
    return [];
  }
}

function resolveLocation(location: string, workspaceRoot: string): string[] {
  // glob patterns use `/` as the separator and `\` as an escape character,
  // so a Windows-authored, backslash-separated pattern (e.g.
  // "libraries\cobol\*") needs normalizing before it reaches glob, or it
  // silently matches nothing.
  const normalized = location.replace(/\\/g, '/');
  // magicalBraces: globSync expands {a,b} by default, but hasMagic() only
  // counts braces as magic when told to -- without it a braces-only pattern
  // like "copybooks/{dev,prod}" takes the literal-path branch and resolves
  // to a nonexistent directory instead of globbing.
  if (!hasMagic(normalized, { magicalBraces: true })) {
    // `normalized`, not the original `location`: a literal (non-glob)
    // Windows-authored path like "libraries\cobol\SOMEDIR" needs the same
    // backslash-to-slash normalizing as the glob branch below, or
    // path.join() on a POSIX dev machine treats the un-normalized backslashes
    // as literal filename characters instead of separators -- joining into
    // one bogus segment ("libraries\cobol\SOMEDIR") instead of three nested
    // directories, silently resolving to a nonexistent path.
    return [resolveAgainstWorkspaceRoot(normalized, workspaceRoot)];
  }
  return globSync(normalized, { cwd: workspaceRoot, absolute: true }).filter((match) => {
    try {
      return fs.statSync(match).isDirectory();
    } catch {
      // A glob match that vanished (TOCTOU race) or is inaccessible
      // (permission-denied) shouldn't take every other resolved location
      // down with it -- just exclude this one match.
      return false;
    }
  });
}
