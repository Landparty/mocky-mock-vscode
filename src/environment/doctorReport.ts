// Parses `mockymock doctor --json` (the sibling mocky-mock repo's
// cli/doctor.py). Pure, so it is unit-testable without the vscode module.
//
// The extension already probes the CLI and Docker itself (checks.ts,
// environmentManager.ts) and keeps doing so -- it can install the CLI and
// start Docker, which doctor never does. What doctor adds is what the
// extension cannot see on its own: whether the CLI's cobol-parser is
// importable, and whether the project's cobol.yml / mockymock.toml loads.

export type DoctorState = 'ok' | 'warn' | 'down' | 'unknown';

export interface DoctorCheck {
  id: string;
  label: string;
  state: DoctorState;
  detail: string;
}

export interface DoctorReport {
  ready: boolean;
  checks: DoctorCheck[];
}

const STATES = new Set<string>(['ok', 'warn', 'down', 'unknown']);

// The checks the extension's own Docker probing does not already cover.
const PROJECT_CHECK_IDS = new Set(['cobol_parser', 'config_file']);

// null for anything that is not a doctor report -- most often a CLI that
// predates `doctor` (argparse usage text on stderr, empty stdout).
export function parseDoctorJson(text: string): DoctorReport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof doc !== 'object' || doc === null) return null;
  const root = doc as Record<string, unknown>;
  if (typeof root.ready !== 'boolean' || !Array.isArray(root.checks)) return null;
  const checks: DoctorCheck[] = [];
  for (const entry of root.checks) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.id !== 'string' || typeof item.state !== 'string' || !STATES.has(item.state)) continue;
    checks.push({
      id: item.id,
      label: typeof item.label === 'string' ? item.label : item.id,
      state: item.state as DoctorState,
      detail: typeof item.detail === 'string' ? item.detail : '',
    });
  }
  return { ready: root.ready, checks };
}

// Project-level problems worth a notification of their own: a broken
// cobol-parser or an unreadable project config fails every run and lint,
// however healthy Docker is.
export function projectProblems(report: DoctorReport): DoctorCheck[] {
  return report.checks.filter((c) => PROJECT_CHECK_IDS.has(c.id) && (c.state === 'warn' || c.state === 'down'));
}

export function formatDoctorReport(report: DoctorReport): string {
  const width = Math.max(0, ...report.checks.map((c) => c.label.length));
  const lines = report.checks.map(
    (c) => `${c.state.toUpperCase().padEnd(7)} ${c.label.padEnd(width)}  ${c.detail}`.trimEnd()
  );
  lines.push(report.ready ? 'mockymock doctor: ready' : 'mockymock doctor: not ready');
  return lines.join('\n');
}
