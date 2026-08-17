// src/environment/copybookPaths.ts

// Combines zapp.yml-derived and mockymock.copybookPaths-setting-derived
// copybook paths, deduped -- zapp.yml entries first since they represent the
// project's own declared convention. Kept free of any `vscode` import so it
// stays unit-testable outside the extension host.
export function mergeCopybookPaths(zappPaths: string[], settingPaths: string[]): string[] {
  return [...new Set([...zappPaths, ...settingPaths])];
}
