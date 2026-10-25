// src/environment/bundledToolchain.ts
//
// The GnuCOBOL toolchain a platform vsix can carry under gnucobol/ (see
// scripts/build-gnucobol.sh and build-and-release.yml), so a test run needs
// no Docker. The CLI picks its backend from two environment variables
// (mocky-mock's runtime/toolchain.py):
//
//   MOCKYMOCK_GNUCOBOL_HOME  a GnuCOBOL tree to compile and run with natively
//   MOCKYMOCK_TOOLCHAIN      auto | docker | native
//
// applyToolchainEnvironment() sets both on this extension host's own
// process.env, which every CLI spawn inherits (commandRunner.ts passes
// `{ ...process.env, ... }`), so no call site has to know about it.
//
// Pure apart from the injectable file probe, so it is unit-testable.
import * as fs from 'fs';
import * as path from 'path';

export type ToolchainSetting = 'auto' | 'bundled' | 'docker';

export const HOME_ENV = 'MOCKYMOCK_GNUCOBOL_HOME';
export const TOOLCHAIN_ENV = 'MOCKYMOCK_TOOLCHAIN';

export type FileExists = (p: string) => boolean;

const defaultExists: FileExists = (p) => {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
};

// <extension>/gnucobol when this vsix carries a GnuCOBOL tree for the
// platform it runs on, else undefined (a dev checkout, or a platform the
// release does not bundle one for).
export function bundledGnuCobolHome(
  extensionPath: string,
  platform: NodeJS.Platform = process.platform,
  exists: FileExists = defaultExists
): string | undefined {
  const home = path.join(extensionPath, 'gnucobol');
  const cobc = path.join(home, 'bin', platform === 'win32' ? 'cobc.exe' : 'cobc');
  return exists(cobc) ? home : undefined;
}

export interface ToolchainChoice {
  // 'native' when the CLI will use the bundled tree, else 'docker'.
  backend: 'native' | 'docker';
  // The tree in use, when backend is 'native'.
  home?: string;
  // Variables to set (a string) or remove (undefined) on process.env.
  env: Record<string, string | undefined>;
}

// What `mockymock.toolchain` means for this install. A MOCKYMOCK_GNUCOBOL_HOME
// the user exported themselves is left alone under 'auto' -- it names a tree
// they chose on purpose.
export function chooseToolchain(
  setting: ToolchainSetting | undefined,
  bundledHome: string | undefined,
  inherited: NodeJS.ProcessEnv
): ToolchainChoice {
  if (setting === 'docker') {
    return { backend: 'docker', env: { [TOOLCHAIN_ENV]: 'docker' } };
  }
  const own = inherited[HOME_ENV]?.trim();
  if (own && setting !== 'bundled') {
    return { backend: 'native', home: own, env: { [TOOLCHAIN_ENV]: 'native' } };
  }
  if (bundledHome) {
    return {
      backend: 'native',
      home: bundledHome,
      env: { [HOME_ENV]: bundledHome, [TOOLCHAIN_ENV]: 'native' },
    };
  }
  // 'bundled' asked for, but this vsix has none: fall back to Docker
  // rather than fail every run; Check Setup says which one is in use.
  return { backend: 'docker', env: { [TOOLCHAIN_ENV]: 'docker' } };
}

// The process.env values the extension started with, so a settings change
// from 'docker' back to 'auto' restores what the user had exported.
let inheritedEnv: NodeJS.ProcessEnv | undefined;

function setOrDelete(env: NodeJS.ProcessEnv, name: string, value: string | undefined): void {
  if (value === undefined) delete env[name];
  else env[name] = value;
}

// Applies `mockymock.toolchain` to `env` (this extension host's own
// process.env by default), which every CLI the extension spawns inherits.
export function applyToolchainEnvironment(
  extensionPath: string,
  setting: ToolchainSetting | undefined,
  env: NodeJS.ProcessEnv = process.env
): ToolchainChoice {
  inheritedEnv ??= { [HOME_ENV]: env[HOME_ENV], [TOOLCHAIN_ENV]: env[TOOLCHAIN_ENV] };
  const choice = chooseToolchain(setting, bundledGnuCobolHome(extensionPath), inheritedEnv);
  for (const name of [HOME_ENV, TOOLCHAIN_ENV]) setOrDelete(env, name, inheritedEnv[name]);
  for (const [name, value] of Object.entries(choice.env)) setOrDelete(env, name, value);
  return choice;
}

// The two variables as they stand on process.env, for a spawn that takes an
// explicit environment (DebugAdapterExecutable).
export function toolchainEnvironment(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of [HOME_ENV, TOOLCHAIN_ENV]) {
    const value = env[name];
    if (value !== undefined) out[name] = value;
  }
  return out;
}

// Whether the CLI the extension spawns will run on a native GnuCOBOL tree
// (so no Docker check applies), as applyToolchainEnvironment() left it.
export function nativeToolchainSelected(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[TOOLCHAIN_ENV] === 'native';
}

// Test hook: forget the captured starting environment.
export function resetToolchainEnvironmentForTests(): void {
  inheritedEnv = undefined;
}

// What to tell someone whose native toolchain has no C compiler -- cobc
// translates COBOL to C and hands it to the system compiler, which only the
// Windows tree carries itself.
export function cCompilerHint(platform: NodeJS.Platform = process.platform): string {
  if (platform === 'darwin') {
    return "Install Apple's command line tools (run `xcode-select --install` in a terminal), then re-run.";
  }
  if (platform === 'win32') {
    return 'The bundled GnuCOBOL is missing its C compiler; reinstall the extension.';
  }
  return 'Install gcc (e.g. `sudo apt install gcc`, `sudo dnf install gcc` or `sudo pacman -S gcc`), then re-run.';
}
