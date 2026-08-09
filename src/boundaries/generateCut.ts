// src/boundaries/generateCut.ts
//
// Pure argv assembly + run + path logic for `mockymock generate --with-data`,
// split out of the extension.ts command handler so mocha can exercise it
// without a VS Code host (repo convention: pure logic lives outside
// vscode-importing files, see checks.ts vs environmentManager.ts). No
// `vscode` import here.
import type { CommandRunner } from '../environment/commandRunner';
import { firstNonEmptyLine } from '../environment/textUtils';
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

export interface GenerateResult {
  warnings: string[];
  notes: string[];
  // The seed the CLI actually drew (or echoed back), from stdout's
  // "... (seed=N)" banner -- null if the banner wasn't found. Lets the
  // caller surface a replayable seed when the user didn't fix one.
  seed: number | null;
}

function nonEmptyLines(text: string): string[] {
  return text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
}

function isWarningLine(line: string): boolean {
  return line.includes('warning:');
}

// Most of `_cmd_generate`'s fail-closed gates (copybook expansion,
// whole-program, unresolved-copybook, linkage-layout) print
// "refused (CODE): ..."; a raw parse failure (`not result.success`) prints
// a differently-shaped "N parse error(s):" header instead (confirmed
// against mockymock's cli/main.py -- it returns before ever reaching the
// refused(...) formatting for that case). Both are STDOUT-only failure
// lines this picker must recognize as authoritative.
function firstStdoutFailureLine(stdout: string): string | undefined {
  return nonEmptyLines(stdout).find(
    (line) => line.includes('refused (') || /\d+ parse error\(s\):/.test(line)
  );
}

// `mockymock generate`'s fail-closed refusal/parse-error messages print to
// STDOUT via plain print(); only the --placeholder-matched-no-fixture
// advisory goes to stderr, and it's the one line there explicitly labeled
// "warning:". Both can land on the SAME failing run -- the placeholder
// check runs before any of the refusal gates, so one or more harmless
// mismatch warnings can sit in stderr while the real failure reason sits in
// stdout underneath them. A naive "stderr's first line is the error" rule
// picks a warning and discards the actual cause -- this prefers a stdout
// failure line over stderr ONLY when EVERY stderr line is a warning (not
// just the first: a program with two unmatched --placeholder pairs prints
// two warning lines, and the second must not un-mask a real stderr error
// either -- there just isn't one, in that case). Exported for its own
// focused test.
export function pickErrorMessage(stdout: string, stderr: string): string {
  const stderrLines = nonEmptyLines(stderr);
  const stdoutFailure = firstStdoutFailureLine(stdout);
  const stderrIsOnlyWarnings = stderrLines.length > 0 && stderrLines.every(isWarningLine);
  if (stderrIsOnlyWarnings && stdoutFailure !== undefined) {
    return stdoutFailure;
  }
  return stderrLines[0] ?? firstNonEmptyLine(stdout) ?? 'mockymock generate failed';
}

// `_report_unsupported_boundaries` prints a summary line ("N boundary
// point(s) detected that are not mockable ..." or "N STOP RUN/GOBACK
// site(s) detected ...") followed by one indented "  - " bullet per site,
// all to STDOUT, on an otherwise-successful generate. Kept separate from
// stderr's --placeholder warnings deliberately: this is routine
// information about the program's own unmockable shape (almost every real
// program has a STOP RUN site), not something wrong with the invocation,
// so a caller can choose to show it less alarmingly than a warning.
function extractUnsupportedBoundaryNotes(stdout: string): string[] {
  const notes: string[] = [];
  let capturing = false;
  for (const rawLine of stdout.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (/boundary point\(s\) detected|STOP RUN\/GOBACK site\(s\) detected/.test(line)) {
      capturing = true;
      notes.push(line.trim());
    } else if (capturing && /^\s*-\s/.test(line)) {
      notes.push(line.trim());
    } else {
      capturing = false;
    }
  }
  return notes;
}

// A data-driven generate always announces its seed on stdout in this exact
// shape, whether --seed was passed or the CLI drew one itself (confirmed
// against a real run):
//   mockymock generate: data-driven from a fixture bundle (seed=958313668)
function extractDrawnSeed(stdout: string): number | null {
  const match = /\(seed=(\d+)\)/.exec(stdout);
  return match ? Number(match[1]) : null;
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
// straight to outPath and reports on BOTH streams: refusals/progress/the
// unsupported-boundaries summary on stdout, --placeholder-mismatch
// warnings on stderr (see pickErrorMessage / extractUnsupportedBoundaryNotes).
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

// Runs `mockymock generate --with-data`.
//
// On success, returns:
//  - `warnings`: every stderr line containing "warning:" (trimmed) -- the
//    CLI's convention for non-fatal advisories (e.g. an unmatched
//    --placeholder) that still produced a usable .cut file.
//  - `notes`: the unsupported-boundaries report, if any, from stdout (see
//    extractUnsupportedBoundaryNotes).
//  - `seed`: the seed from stdout's "(seed=N)" banner, null if absent (see
//    extractDrawnSeed).
//
// On a non-zero exit, throws BundleError (the same type bundleClient's
// fetchBundle throws) with `.message` chosen by pickErrorMessage (stdout's
// refusal reason when stderr held only a warning; stderr's own line
// otherwise) and `.stderr` set to BOTH streams concatenated -- despite the
// property's bundleClient-inherited name, this is deliberately not
// stderr-only here, so a caller logging it (e.g. to an output channel)
// shows everything a failing run printed, not just the one line already
// surfaced as the message.
export async function runGenerate(
  run: CommandRunner,
  executable: string,
  o: GenerateOptions
): Promise<GenerateResult> {
  const result = await run(executable, buildGenerateArgs(o));
  if (result.code !== 0) {
    const detail = [result.stdout, result.stderr]
      .map((s) => s.trimEnd())
      .filter((s) => s.length > 0)
      .join('\n');
    throw new BundleError(pickErrorMessage(result.stdout, result.stderr), detail);
  }
  const warnings = result.stderr
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('warning:'));
  const notes = extractUnsupportedBoundaryNotes(result.stdout);
  return { warnings, notes, seed: extractDrawnSeed(result.stdout) };
}

// Sibling <stem>.cut next to the source -- the exact pairing convention
// MockymockRunner/testController already use for an existing suite
// (cutDiscovery's resolveCutPath). Reusing it here isn't a coincidence: the
// file this writes IS the suite the Test Explorer discovers and runs.
export function resolveOutPath(cblPath: string): string {
  return resolveCutPath(cblPath);
}
