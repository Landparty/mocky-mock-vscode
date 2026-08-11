// Pure transform, no `vscode` import (mocha-testable, and also bundled
// directly into the webview via media/programFlow/main.ts -- see that
// file's import). sanitizeNodeId() is a byte-for-byte TypeScript port of
// cobol-parser's cobolparser/generators/flowchart.py::_sanitize_id -- it
// MUST stay in lockstep with that function, since it exists solely to
// reverse-map a clicked Mermaid SVG node's id back to the paragraph name
// cobol-parser derived it from.
import type { ProgramFlowReport } from '../paragraphTree/programFlowModel';

export function sanitizeNodeId(name: string): string {
  const safe = name.replace(/[^A-Za-z0-9_]/g, '_');
  if (safe.length > 0 && /^[0-9]/.test(safe)) {
    return `N_${safe}`;
  }
  return safe.length > 0 ? safe : 'N_UNKNOWN';
}

export function buildLineIndex(report: ProgramFlowReport): Record<string, number> {
  const index: Record<string, number> = {};
  for (const node of report.nodes) {
    index[sanitizeNodeId(node.name)] = node.location.line;
  }
  return index;
}
