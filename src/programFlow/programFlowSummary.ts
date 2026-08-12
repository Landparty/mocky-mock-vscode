// Pure transform, no `vscode` import -- derives the Program Flow webview's
// stats subtitle from the same JSON report programFlowModel.ts already
// consumes. Deliberately reads cycle_details/edges directly rather than
// scraping anything back out of the rendered Mermaid text, so a change to
// Mermaid's cosmetic output can never silently break this line (see
// docs/superpowers/specs/2026-08-11-program-flow-webview-design.md).
import type { ProgramFlowReport } from '../paragraphTree/programFlowModel';

export interface ProgramFlowSummary {
  recursionCount: number;
  gotoCount: number;
  gotoDependingCount: number;
  thruGroupCount: number;
}

export function summarizeProgramFlow(report: ProgramFlowReport): ProgramFlowSummary {
  const recursionCount = (report.cycle_details ?? []).filter((c) => c.kind === 'PERFORM_RECURSION').length;
  const gotoCount = report.edges.filter((e) => e.type === 'GOTO').length;
  const gotoDependingCount = report.edges.filter((e) => e.type === 'GOTO_DEPENDING').length;
  const thruTargets = new Set(report.edges.filter((e) => e.thru_target).map((e) => `${e.source}->${e.thru_target}`));
  return { recursionCount, gotoCount, gotoDependingCount, thruGroupCount: thruTargets.size };
}

function clause(count: number, singular: string, plural: string): string | undefined {
  if (count === 0) return undefined;
  return `${count} ${count === 1 ? singular : plural}`;
}

export function formatSummaryLine(summary: ProgramFlowSummary): string {
  const clauses = [
    clause(summary.recursionCount, 'recursion', 'recursions'),
    clause(summary.gotoCount, 'GO TO', 'GO TOs'),
    clause(summary.gotoDependingCount, 'GO TO...DEPENDING ON', 'GO TO...DEPENDING ONs'),
    clause(summary.thruGroupCount, 'THRU group collapsed', 'THRU groups collapsed'),
  ].filter((c): c is string => c !== undefined);
  return clauses.length > 0 ? clauses.join(' · ') : 'no recursion, GO TO, or THRU activity';
}
