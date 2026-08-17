// src/environment/zappConfig.ts
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { globSync } from 'glob';

const GLOB_METACHARACTERS = /[*?[\]{}]/;

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

// Reads a zapp.yml/zapp.yaml at the workspace root (the same file/schema IBM
// Z Open Editor's DBB tooling uses) and returns the local cobol copybook
// library locations it declares, resolved to absolute paths. mvs-type
// libraries and non-cobol language groups are parsed but ignored -- the
// mockymock CLI only understands local filesystem paths today.
export function resolveZappCopybookPaths(workspaceRoot: string): string[] {
  const zappFile = findZappFile(workspaceRoot);
  if (!zappFile) {
    return [];
  }

  try {
    const config: ZappConfig = parseYaml(fs.readFileSync(zappFile, 'utf8')) ?? {};
    const propertyGroups = Array.isArray(config.propertyGroups) ? config.propertyGroups : [];
    const locations = propertyGroups
      .filter((group) => group.language === 'cobol')
      .flatMap((group) => (Array.isArray(group.libraries) ? group.libraries : []))
      .filter((library) => library.type === 'local')
      .flatMap((library) => (Array.isArray(library.locations) ? library.locations : []));

    return locations.flatMap((location) => resolveLocation(location, workspaceRoot));
  } catch (err) {
    console.warn(`mockymock: failed to parse ${zappFile}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

function resolveLocation(location: string, workspaceRoot: string): string[] {
  if (!GLOB_METACHARACTERS.test(location)) {
    return [path.isAbsolute(location) ? location : path.join(workspaceRoot, location)];
  }
  return globSync(location, { cwd: workspaceRoot, absolute: true }).filter((match) => fs.statSync(match).isDirectory());
}
