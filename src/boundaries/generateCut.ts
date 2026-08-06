// src/boundaries/generateCut.ts
//
// Pure argv assembly + run + path logic for `mockymock generate --with-data`,
// split out of the extension.ts command handler so mocha can exercise it
// without a VS Code host (repo convention: pure logic lives outside
// vscode-importing files, see checks.ts vs environmentManager.ts). No
// `vscode` import here.
import type { CommandRunner } from '../environment/commandRunner';
import type { ScenarioMode } from './bundleTypes';
import { BundleError } from './bundleClient';
import { resolveCutPath } from '../discovery/cutDiscovery';

export interface GenerateOptions {
  cblPath: string;
  outPath: string;
  scenarios: ScenarioMode;
  seed?: number;
  copybookPaths: string[];
  placeholders: string[]; // from placeholderArgs(model) -- may contain duplicate pairs, see dedupePlaceholderPairs
}

function firstNonEmptyLine(text: string): string | undefined {
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
}

// placeholderArgs(model) links a boundary's checkbox by (category, key)
// across every paragraph it recurs in (Task 2/3 review decision: mirrors the
// CLI's --placeholder granularity), so unchecking one boundary that appears
// in two paragraphs emits the same '--placeholder CATEGORY:KEY' pair twice.
// The CLI harmlessly frozensets its placeholder keys either way, but this
// keeps the actual invocation (visible in the output channel / progress
// notification) clean of the duplicate.
function dedupePlaceholderPairs(placeholders: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (let i = 0; i + 1 < placeholders.length; i += 2) {
    const value = placeholders[i + 1];
    if (seen.has(value)) continue;
    seen.add(value);
    deduped.push(placeholders[i], value);
  }
  return deduped;
}

// Mirrors the exact `mockymock generate --with-data` arg order (PR #46):
// subcommand, positional .cbl path, --with-data, --scenarios, optional
// --seed, one --copybook-path per configured search dir, one --placeholder
// per unseeded boundary (deduped), then -o <outPath>. Unlike `fixtures`
// there is no bundle JSON on stdout here -- the CLI writes the .cut file
// straight to outPath and reports progress/warnings on stderr.
export function buildGenerateArgs(o: GenerateOptions): string[] {
  const args = ['generate', o.cblPath, '--with-data', '--scenarios', o.scenarios];
  if (o.seed !== undefined) {
    args.push('--seed', String(o.seed));
  }
  for (const copybookPath of o.copybookPaths) {
    args.push('--copybook-path', copybookPath);
  }
  args.push(...dedupePlaceholderPairs(o.placeholders));
  args.push('-o', o.outPath);
  return args;
}

// Runs `mockymock generate --with-data`. On success, returns every stderr
// line containing "warning:" (trimmed) -- the CLI's convention for
// non-fatal advisories (e.g. a boundary key mismatch) that still produced a
// usable .cut file. On a non-zero exit, throws BundleError (the same type
// bundleClient's fetchBundle throws) carrying the first non-empty stderr
// line as its message and the full stderr as detail.
export async function runGenerate(
  run: CommandRunner,
  executable: string,
  o: GenerateOptions
): Promise<{ warnings: string[] }> {
  const result = await run(executable, buildGenerateArgs(o));
  if (result.code !== 0) {
    throw new BundleError(firstNonEmptyLine(result.stderr) ?? 'mockymock generate failed', result.stderr);
  }
  const warnings = result.stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('warning:'));
  return { warnings };
}

// Sibling <stem>.cut next to the source -- the exact pairing convention
// MockymockRunner/testController already use for an existing suite
// (cutDiscovery's resolveCutPath). Reusing it here isn't a coincidence: the
// file this writes IS the suite the Test Explorer discovers and runs.
export function resolveOutPath(cblPath: string): string {
  return resolveCutPath(cblPath);
}
