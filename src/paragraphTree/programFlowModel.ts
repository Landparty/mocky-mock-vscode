//
// Pure transform: cobol-parser's program-flow JSON (a flat node/edge DAG --
// no depth/children field) -> a renderable paragraph tree. No `vscode`
// import (repo convention). Implements the derivation rules from
// docs/superpowers/specs/2026-08-08-paragraph-tree-view-design.md:
// hierarchy = PERFORM edges only (PERFORM_THRU is a duplicate of the same
// span, deliberately ignored -- see the filter below); DFS pre-order from
// entry_points in source-line order; a multi-caller paragraph is placed
// once (first-reached) with a callCount badge; a PERFORM back-edge to an
// ancestor on the current path renders as a childless "recursive" leaf
// instead of re-descending; every node never placed by the PERFORM
// traversal renders as a flat, childless "unreachable" entry (computed
// from `placed`, NOT from report.unreachable_nodes verbatim -- see the
// comment above the `unreachable` computation below for why); PERFORM
// ... THRU ranges become a `thruRange` connector node; F/S/C badges are
// presence-only, derived from statement_types/calls.call_count; a PERFORM
// edge naming an unknown paragraph fails the whole build closed (never a
// partial/guessed tree).
import { extractLoopAnnotation, PerformType } from './sourceAnnotations';

export interface FlowLocation {
  line: number;
  column: number;
}

export interface FlowNode {
  name: string;
  type: string;
  location: FlowLocation;
  is_entry_point?: boolean;
  calls: { perform_count: number; goto_count: number; call_count: number };
  statement_types: Record<string, number>;
}

export interface FlowEdge {
  source: string;
  target: string;
  type: string;
  location: FlowLocation;
  is_loop?: boolean;
  perform_type?: PerformType;
  thru_target?: string;
  range_members?: string[];
}

export interface ProgramFlowReport {
  program_name: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  entry_points: string[];
  unreachable_nodes: string[];
}

export interface ParagraphBadges {
  file: boolean;
  sql: boolean;
  call: boolean;
}

export type ParagraphTreeItem =
  | {
      kind: 'paragraph';
      name: string;
      line: number;
      callCount: number;
      isRecursive: boolean;
      loopAnnotation?: string;
      badges: ParagraphBadges;
      children: ParagraphTreeItem[];
    }
  | {
      kind: 'thruRange';
      from: string;
      to: string;
      loopAnnotation?: string;
      children: ParagraphTreeItem[];
    };

export interface ParagraphTreeResult {
  programName: string;
  roots: ParagraphTreeItem[];
  unreachable: ParagraphTreeItem[];
}

export class ParagraphTreeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParagraphTreeError';
  }
}

// The eight file-op verbs cobol-parser's statement_types can emit for
// OPEN/READ/WRITE/CLOSE-family statements. REWRITE/DELETE/START/UNLOCK
// carry a "_STATEMENT" suffix (underscore, not hyphen) to disambiguate
// from same-named non-I/O statement types -- verified directly against
// cobolparser/models/statements/io.py's __init__ calls: OPEN (io.py:317),
// READ (io.py:80), WRITE (io.py:190), CLOSE (io.py:386),
// REWRITE_STATEMENT (io.py:546), DELETE_STATEMENT (io.py:593),
// START_STATEMENT (io.py:626), UNLOCK_STATEMENT (io.py:671).
const FILE_STATEMENT_TYPES = new Set([
  'OPEN',
  'READ',
  'WRITE',
  'CLOSE',
  'REWRITE_STATEMENT',
  'DELETE_STATEMENT',
  'START_STATEMENT',
  'UNLOCK_STATEMENT',
]);

function badgesFor(node: FlowNode): ParagraphBadges {
  const types = node.statement_types ?? {};
  return {
    file: Object.keys(types).some((t) => FILE_STATEMENT_TYPES.has(t)),
    sql: (types['EXEC-SQL'] ?? 0) > 0,
    call: (node.calls?.call_count ?? 0) > 0,
  };
}

function paragraphItem(
  node: FlowNode,
  callCount: number,
  isRecursive: boolean,
  children: ParagraphTreeItem[],
  loopAnnotation?: string
): ParagraphTreeItem {
  return {
    kind: 'paragraph',
    name: node.name,
    line: node.location.line,
    callCount,
    isRecursive,
    loopAnnotation,
    badges: badgesFor(node),
    children,
  };
}

export function buildParagraphTree(
  report: ProgramFlowReport,
  sourceLines: string[] | undefined
): ParagraphTreeResult {
  const nodesByName = new Map<string, FlowNode>();
  for (const node of report.nodes) {
    if (!node.location) {
      throw new ParagraphTreeError(`program-flow node "${node.name}" is missing a location`);
    }
    nodesByName.set(node.name, node);
  }

  // Hierarchy edges only -- GOTO/CALL/FALL_THROUGH/branch edges never
  // nest. PERFORM_THRU is a duplicate of the same span already carried by
  // the base PERFORM edge's thru_target/range_members (verified against
  // cobolparser's edges.py: process_perform emits both), so it is ignored
  // here rather than double-processed.
  const performEdges = report.edges.filter((e) => e.type === 'PERFORM');

  const callCounts = new Map<string, number>();
  for (const edge of performEdges) {
    callCounts.set(edge.target, (callCounts.get(edge.target) ?? 0) + 1);
  }

  for (const edge of performEdges) {
    if (!nodesByName.has(edge.source) || !nodesByName.has(edge.target)) {
      throw new ParagraphTreeError(
        `program-flow PERFORM edge references an unknown paragraph ("${edge.source}" -> "${edge.target}")`
      );
    }
    for (const member of edge.range_members ?? []) {
      if (!nodesByName.has(member)) {
        throw new ParagraphTreeError(`PERFORM ... THRU range member "${member}" is not a known paragraph`);
      }
    }
  }

  const outgoing = new Map<string, FlowEdge[]>();
  for (const edge of performEdges) {
    const list = outgoing.get(edge.source) ?? [];
    list.push(edge);
    outgoing.set(edge.source, list);
  }
  for (const list of outgoing.values()) {
    list.sort((a, b) => a.location.line - b.location.line);
  }

  const placed = new Set<string>();

  function loopAnnotationFor(edge: FlowEdge): string | undefined {
    if (!edge.is_loop || !sourceLines) return undefined;
    return extractLoopAnnotation(sourceLines, edge.location.line, edge.perform_type ?? 'SIMPLE');
  }

  // DFS pre-order: `path` is the set of paragraph names on the CURRENT
  // recursion stack (ancestors of `name`), used only for the cycle
  // back-edge check below -- distinct from `placed`, which is global
  // across the whole tree and drives the ordinary multi-caller rule.
  function expand(name: string, path: Set<string>): ParagraphTreeItem[] {
    const children: ParagraphTreeItem[] = [];
    for (const edge of outgoing.get(name) ?? []) {
      if (path.has(edge.target)) {
        // Back-edge to an ancestor: a real PERFORM recursion/cycle, not an
        // ordinary shared call site. Render a childless marker here so the
        // cycle is visible without recursing forever.
        const targetNode = nodesByName.get(edge.target)!;
        children.push(paragraphItem(targetNode, callCounts.get(edge.target) ?? 0, true, [], loopAnnotationFor(edge)));
        continue;
      }
      if (placed.has(edge.target)) {
        // Ordinary multi-caller diamond: already fully placed at an
        // earlier (first-reached) site. Nothing renders at this second
        // call site -- its callCount badge on the first placement already
        // reflects this edge.
        continue;
      }

      if (edge.thru_target && edge.range_members && edge.range_members.length > 0) {
        placed.add(edge.target);
        const loopAnnotation = loopAnnotationFor(edge);
        const memberChildren: ParagraphTreeItem[] = [];
        // range_members[0] === edge.target by construction (cobol-parser's
        // range_members() always starts the span at the PERFORM's own
        // target -- see cobolparser/analysis/program_flow/edges.py's
        // range_members helper).
        for (const memberName of edge.range_members) {
          if (memberName !== edge.target && placed.has(memberName)) continue;
          placed.add(memberName);
          const memberNode = nodesByName.get(memberName)!;
          const memberPath = new Set(path);
          memberPath.add(memberName);
          memberChildren.push(
            paragraphItem(memberNode, callCounts.get(memberName) ?? 0, false, expand(memberName, memberPath))
          );
        }
        children.push({ kind: 'thruRange', from: edge.range_members[0], to: edge.thru_target, loopAnnotation, children: memberChildren });
        continue;
      }

      placed.add(edge.target);
      const targetNode = nodesByName.get(edge.target)!;
      const nextPath = new Set(path);
      nextPath.add(edge.target);
      children.push(
        paragraphItem(
          targetNode,
          callCounts.get(edge.target) ?? 0,
          false,
          expand(edge.target, nextPath),
          loopAnnotationFor(edge)
        )
      );
    }
    return children;
  }

  const roots: ParagraphTreeItem[] = [];
  for (const entryName of report.entry_points) {
    const node = nodesByName.get(entryName);
    if (!node) {
      // Not fail-closed here (unlike a dangling PERFORM edge, which does
      // indicate a genuinely broken graph): cobol-parser's entry_points[]
      // legitimately mixes two different things. The implicit first
      // paragraph is always validated against nodes[] before being added
      // (cobolparser/analysis/program_flow/analyzer.py's "if first in
      // self._nodes" check), but ENTRY statement names
      // (collect_entry_points in scanner.py) are appended unconditionally,
      // with no corresponding paragraph -- an ENTRY statement is a
      // secondary linkage-time entry point (common in IMS DL/I programs,
      // e.g. ENTRY 'DLITCBL' USING ...), not a paragraph boundary;
      // execution just falls into whatever code follows it. Skipping it
      // here is correct, not a guess: it has no location/statements/badges
      // of its own to render, and the real paragraph tree is unaffected --
      // verified against a real ENTRY-bearing fixture, where entry_points
      // was ["0000-MAIN-PROCESS", "DLITCBL"] with only the former in
      // nodes[].
      continue;
    }
    if (placed.has(entryName)) continue;
    placed.add(entryName);
    roots.push(paragraphItem(node, callCounts.get(entryName) ?? 0, false, expand(entryName, new Set([entryName]))));
  }

  // Computed as "every node the PERFORM traversal never placed", NOT as
  // report.unreachable_nodes verbatim. That JSON field is computed by
  // cobol-parser over a much broader edge set (GOTO/FALL_THROUGH/SORT-MERGE
  // procedures, not just PERFORM -- see cobolparser/analysis/program_flow/
  // graph.py's build_fall_through_edges), so a paragraph reached only by
  // sequential fall-through (common in real COBOL, no explicit PERFORM at
  // all) is "reachable" by the JSON's definition but never PERFORM-placed
  // by this tree -- trusting the JSON field verbatim would let such
  // paragraphs vanish from both roots and unreachable. Deriving this
  // bucket from `placed` instead guarantees every node in report.nodes
  // appears exactly once, somewhere, in the returned tree.
  const unreachable: ParagraphTreeItem[] = report.nodes
    .filter((node) => !placed.has(node.name))
    .map((node) => paragraphItem(node, callCounts.get(node.name) ?? 0, false, []));

  return { programName: report.program_name, roots, unreachable };
}
