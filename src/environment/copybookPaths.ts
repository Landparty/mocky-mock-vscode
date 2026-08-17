// src/environment/copybookPaths.ts
import * as path from 'path';

// Kept free of any `vscode` import so both stay unit-testable outside the
// extension host.
export function resolveAgainstWorkspaceRoot(p: string, root: string): string {
  return path.isAbsolute(p) ? p : path.join(root, p);
}

// Dedup key that treats case (Windows' filesystem is case-insensitive) and a
// trailing separator (path.join/path.normalize preserve one if the input
// segment ends in one) as the same path.
function dedupKey(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  return process.platform === 'win32' ? trimmed.toLowerCase() : trimmed;
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
