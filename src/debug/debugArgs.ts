// Plain, vscode-independent shape and argv builder for a mockymock debug
// session -- deliberately does NOT extend vscode.DebugConfiguration (unlike
// most of this extension's vscode-adjacent types) so this module can be
// unit-tested under mocha, which cannot resolve the 'vscode' module outside
// a running Extension Host. debugAdapterFactory.ts casts vscode.DebugSession's
// `configuration` (typed as vscode.DebugConfiguration, which carries a
// `[key: string]: any` index signature) to this interface at its one call site.
import * as path from 'path';

export interface MockymockDebugConfiguration {
  program: string;
  cut: string;
  case: string;
  executablePath?: string;
  copybookPaths?: string[];
}

// Mirrors mockymockRunner.ts's buildRunArgs: a plain function building the
// argv mockymock debug --dap-stdio needs, kept separate from the
// vscode.DebugAdapterDescriptorFactory that actually spawns it.
export function buildDebugArgs(config: MockymockDebugConfiguration): string[] {
  const args = ['debug', config.program, '--cut', config.cut, '--case', config.case, '--dap-stdio'];
  for (const p of config.copybookPaths ?? []) {
    args.push('--copybook-path', p);
  }
  return args;
}

// The lint preflight that `runInteractiveDebug` runs before ever starting a
// debug session (see lintGate.ts): built from the same program/cut/copybookPaths
// a debug session would use, so it can never false-positive-block on a
// copybook path the session itself would have resolved fine. Note this is
// whole-file, not case-scoped (mockymock lint has no --case flag) -- a
// syntax/copybook problem is a property of the .cbl/.cut pair regardless of
// which TESTCASE runs, so this is a deliberate, not an accidental, scope choice.
export function buildLintArgs(config: Pick<MockymockDebugConfiguration, 'program' | 'cut' | 'copybookPaths'>): string[] {
  const args = ['lint', config.program, '--cut', config.cut];
  for (const p of config.copybookPaths ?? []) {
    args.push('--copybook-path', p);
  }
  return args;
}

// `mockymock debug` matches each setBreakpoints source against the program
// it was started on by realpath, so a relative `program` (easy to write in a
// hand-authored launch.json) would be resolved against the adapter process's
// cwd -- not the workspace -- and every breakpoint VS Code sends (always an
// absolute path) would come back unverified. Anchor relative program/cut (and
// copybook) paths to the launching workspace folder instead; absolute paths
// pass through.
export function absolutizeDebugPaths<
  T extends Pick<MockymockDebugConfiguration, 'program' | 'cut' | 'copybookPaths'>,
>(config: T, folderPath: string | undefined): T {
  if (!folderPath) {
    return config;
  }
  const anchor = (p: string): string => (path.isAbsolute(p) ? p : path.resolve(folderPath, p));
  const resolved: T = { ...config, program: anchor(config.program), cut: anchor(config.cut) };
  if (config.copybookPaths) {
    resolved.copybookPaths = config.copybookPaths.map(anchor);
  }
  return resolved;
}

// The adapter's working directory: the .cut's folder, so the CLI finds the
// same cobol.yml / mockymock.toml a run would (see runCommandIn). Only when
// `cut` is absolute -- a still-relative one (no workspace folder to anchor it
// to) would otherwise move the base every other relative path resolves from.
export function debugAdapterCwd(config: Pick<MockymockDebugConfiguration, 'cut'>): string | undefined {
  return path.isAbsolute(config.cut) ? path.dirname(config.cut) : undefined;
}
