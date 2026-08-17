// src/environment/copybookPaths.ts
import * as path from 'path';

// Kept free of any `vscode` import so both stay unit-testable outside the
// extension host.
export function resolveAgainstWorkspaceRoot(p: string, root: string): string {
  return path.isAbsolute(p) ? p : path.join(root, p);
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
