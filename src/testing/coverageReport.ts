// Parses `mockymock run --coverage-json` output. The `original` section is
// what the Test Explorer coverage view renders: per-line covered/uncovered
// against the ORIGINAL .cbl (the framework already excluded its own
// splicer-inserted lines, so every line here is the user's own code).

export interface CoverageLine {
  /** 1-based line number in the original .cbl file. */
  line: number;
  covered: boolean;
}

export interface CoverageData {
  programFile: string;
  lines: CoverageLine[];
  totalExecutable: number;
  totalCovered: number;
}

export function parseCoverageJson(text: string): CoverageData | null {
  let doc: unknown;
  try {
    doc = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof doc !== 'object' || doc === null) return null;
  const root = doc as Record<string, unknown>;
  const original = root.original;
  if (typeof original !== 'object' || original === null) return null;
  const section = original as Record<string, unknown>;
  if (!Array.isArray(section.lines)) return null;

  const lines: CoverageLine[] = [];
  for (const entry of section.lines) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.line !== 'number' || typeof item.covered !== 'boolean') continue;
    lines.push({ line: item.line, covered: item.covered });
  }
  return {
    programFile: typeof root.programFile === 'string' ? root.programFile : '',
    lines,
    totalExecutable: typeof section.totalExecutable === 'number' ? section.totalExecutable : lines.length,
    totalCovered:
      typeof section.totalCovered === 'number'
        ? section.totalCovered
        : lines.filter((l) => l.covered).length,
  };
}
