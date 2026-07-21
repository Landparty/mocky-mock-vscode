// Parses `mockymock run --trace-json` output (see the sibling mocky-mock
// repo's docs/2026-07-21-debug-trace-design.md). Two channels compose: the
// executed path (remapped onto the ORIGINAL .cbl's lines -- splicer
// insertions excluded) and the mock firing timeline. They cannot come from
// one source: the mock dispatch blocks ARE the splicer-inserted lines the
// path's remap excludes. Tolerant parsing mirrors jsonReport.ts/
// coverageReport.ts: a structurally alien document returns null and the
// caller degrades, rather than throwing.

export interface TracePathEntry {
  line: number;
  statement: string | null;
  paragraph: string | null;
}

export interface TraceMockHit {
  order: number;
  label: string;
}

export interface TraceReport {
  version: number;
  cutFile: string;
  programFile: string;
  caseName: string;
  caseLine: number | null;
  path: TracePathEntry[];
  mocks: TraceMockHit[];
  truncated: boolean;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function asNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function parseTraceJson(text: string): TraceReport | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof doc !== 'object' || doc === null) return null;
  const root = doc as Record<string, unknown>;
  if (!Array.isArray(root.path) || !Array.isArray(root.mocks)) return null;

  const caseRaw = (root.case ?? {}) as Record<string, unknown>;

  const path: TracePathEntry[] = [];
  for (const entry of root.path) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const line = asNumberOrNull(item.line);
    if (line === null) continue;
    path.push({ line, statement: asString(item.statement), paragraph: asString(item.paragraph) });
  }

  const mocks: TraceMockHit[] = [];
  for (const entry of root.mocks) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    const order = asNumberOrNull(item.order);
    const label = asString(item.label);
    if (order === null || label === null) continue;
    mocks.push({ order, label });
  }

  return {
    version: asNumberOrNull(root.version) ?? 0,
    cutFile: asString(root.cutFile) ?? '',
    programFile: asString(root.programFile) ?? '',
    caseName: asString(caseRaw.name) ?? '',
    caseLine: asNumberOrNull(caseRaw.line),
    path,
    mocks,
    truncated: root.truncated === true,
  };
}

// Rendered into the Test Results output panel next to the pass/fail line --
// the same idiom formatRunHeader/formatRunTrailer already use in
// outputFormatting.ts. No custom webview or gutter decorations: this
// extension has none today, and VS Code's Test Coverage API (used by the
// Coverage profile) has no equivalent concept for an ORDERED execution
// path, so that stays out of scope here. CRLF conversion is the caller's
// job, matching every other producer in this directory.
export function formatTraceOutput(report: TraceReport): string {
  const lines: string[] = [`--- execution trace: ${report.caseName} ---`];
  if (report.mocks.length) {
    lines.push('mocks fired, in order:');
    for (const mock of report.mocks) lines.push(`  ${mock.order}. ${mock.label}`);
  } else {
    lines.push('mocks fired: none');
  }
  lines.push(`statements executed: ${report.path.length}`);
  if (report.truncated) {
    lines.push('(path truncated -- see mockymock run --trace for the full listing)');
  }
  for (const entry of report.path) {
    const what = entry.paragraph !== null ? `paragraph  ${entry.paragraph}` : `           ${entry.statement ?? ''}`;
    lines.push(`  line ${String(entry.line).padStart(6)}  ${what}`);
  }
  return lines.join('\n') + '\n';
}
