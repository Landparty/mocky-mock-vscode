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

// Mermaid's rendered node DOM ids look like "<diagramId>-flowchart-<nodeId>-<n>"
// -- the diagram id (the first argument passed to mermaid.render()) is
// prepended in front of the "flowchart-" marker, not at the string start
// (see FlowDB.lookUpDomId() in mermaid's flowDb: domId is
// "flowchart-" + id + "-" + counter, then optionally re-prefixed with
// "<diagramId>-" for uniqueness across multiple diagrams on one page).
// sanitizeNodeId() above never produces a "-" inside <nodeId> (every
// non-alphanumeric-non-underscore character, including "-", becomes "_"),
// so the trailing "-<n>" mermaid appends is unambiguous to strip.
//
// Shared between the webview click handler (media/programFlow/main.ts)
// and its regression test so the two can't drift apart.
const MERMAID_NODE_ID_PATTERN = /flowchart-(.+)-\d+$/;

export function parseMermaidNodeId(domId: string): string | undefined {
  const match = MERMAID_NODE_ID_PATTERN.exec(domId);
  return match ? match[1] : undefined;
}
