import type { CommandRunner } from '../environment/commandRunner';
import { firstNonEmptyLine } from '../environment/textUtils';
import type { FixtureBundle, ScenarioMode } from './bundleTypes';

export class BundleError extends Error {
  constructor(message: string, readonly stderr?: string) {
    super(message);
  }
}

export interface FetchOptions {
  scenarios: ScenarioMode;
  copybookPaths: string[];
  seed?: number;
}

const SUPPORTED_BUNDLE_VERSION = 1;

// Mirrors the exact `mockymock fixtures` arg order the CLI expects (PR #46,
// feature/unify-with-data): subcommand, positional .cbl path, --scenarios,
// optional --seed, then one --copybook-path per configured search dir.
// stdout is ALWAYS the bundle JSON on success -- there is no --json flag.
export function buildFixturesArgs(cblPath: string, opts: FetchOptions): string[] {
  const args = ['fixtures', cblPath, '--scenarios', opts.scenarios];
  if (opts.seed !== undefined) {
    args.push('--seed', String(opts.seed));
  }
  for (const copybookPath of opts.copybookPaths) {
    args.push('--copybook-path', copybookPath);
  }
  return args;
}

export async function fetchBundle(
  run: CommandRunner,
  executable: string,
  cblPath: string,
  opts: FetchOptions
): Promise<FixtureBundle> {
  const result = await run(executable, buildFixturesArgs(cblPath, opts));
  if (result.code !== 0) {
    throw new BundleError(firstNonEmptyLine(result.stderr) ?? 'mockymock fixtures failed', result.stderr);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    throw new BundleError('mockymock fixtures output was not valid JSON', result.stdout.slice(0, 200));
  }

  const bundle = parsed as FixtureBundle;
  if (bundle.bundle_version !== SUPPORTED_BUNDLE_VERSION) {
    throw new BundleError(
      `bundle_version ${bundle.bundle_version} is not supported — update the extension or the mockymock CLI`
    );
  }

  return bundle;
}
