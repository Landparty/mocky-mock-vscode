// src/boundaries/boundariesTreeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { runCommand } from '../environment/commandRunner';
import { resolveExecutablePath } from '../environment/checks';
import { fetchBundle, BundleError } from './bundleClient';
import { buildViewModel, toSeededOverrides, BoundariesViewModel, BoundaryNode } from './boundariesModel';
import { RefreshGuard } from './refreshGuard';
import { fieldNodeId, groupNodeId, unresolvedItemNodeId } from './treeNodeIds';
import type { BundleFieldSpec, ScenarioMode } from './bundleTypes';

const SEEDED_KEY_PREFIX = 'mockymock.boundaries.seeded:';
const MODE_KEY = 'mockymock.boundaries.mode';

// Discriminated union of every row this tree can render: paragraph groups,
// the boundaries within them, their layout fields, the bundle-level
// "unresolved" advisory group + its entries, and the single-node error state
// (with an optional "Show output" child for stderr).
export type BoundaryTreeNode =
  | { kind: 'group'; paragraph: string; boundaries: BoundaryNode[] }
  | { kind: 'boundary'; boundary: BoundaryNode }
  | { kind: 'field'; boundaryId: string; field: BundleFieldSpec }
  | { kind: 'unresolvedRoot'; items: string[] }
  | { kind: 'unresolvedItem'; text: string; index: number }
  | { kind: 'error'; message: string; stderr?: string }
  | { kind: 'showOutput' };

const CALL_CATEGORIES = new Set(['CALL', 'DYNCALL']);
const DATA_CATEGORIES = new Set(['SQL', 'CICS', 'DLI']);
// The eight file-op verbs the boundary_inventory analyzer emits (see
// cobol-parser cobolparser/analysis/boundary_inventory.py).
const FILE_CATEGORIES = new Set(['OPEN', 'CLOSE', 'READ', 'WRITE', 'REWRITE', 'DELETE', 'START', 'UNLOCK']);

function iconForCategory(category: string): vscode.ThemeIcon {
  if (CALL_CATEGORIES.has(category)) return new vscode.ThemeIcon('symbol-method');
  if (DATA_CATEGORIES.has(category)) return new vscode.ThemeIcon('database');
  if (FILE_CATEGORIES.has(category)) return new vscode.ThemeIcon('file');
  if (category === 'ACCEPT') return new vscode.ThemeIcon('keyboard');
  return new vscode.ThemeIcon('symbol-interface');
}

const DIRECTION_BADGES: Record<BoundaryNode['direction'], string> = {
  IN: '→ IN',
  OUT: '← OUT',
  BIDIRECTIONAL: '↔ BIDI',
  STATUS_ONLY: 'STATUS',
};

function boundaryDescription(boundary: BoundaryNode): string {
  const badge = DIRECTION_BADGES[boundary.direction];
  const first = boundary.layout[0];
  if (!first) return badge;
  const picture = first.picture ? ` PIC ${first.picture}` : '';
  return `${badge} · ${first.name}${picture}`;
}

interface ErrorState {
  message: string;
  stderr?: string;
}

// TreeDataProvider over a mockymock `fixtures` bundle for the active .cbl
// file. Owns no COBOL knowledge itself (that lives in bundleClient +
// boundariesModel) -- this class is purely the vscode-facing integration
// layer: fetch orchestration, node shaping, checkbox <-> model wiring, and
// workspaceState persistence.
export class BoundariesTreeProvider implements vscode.TreeDataProvider<BoundaryTreeNode> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly outputChannel: vscode.OutputChannel;

  // Tracks the (cblPath, model) pair actually committed by a landed
  // refresh() -- see refreshGuard.ts. setSeeded() persists against THIS,
  // never against `currentCblPath` below, which only records the target of
  // the most recently *requested* refresh and can be ahead of it while a
  // fetch is still in flight.
  private readonly modelGuard = new RefreshGuard<BoundariesViewModel>();
  private currentCblPath: string | undefined;
  private errorState: ErrorState | undefined;

  scenarioMode: ScenarioMode;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('mockymock boundaries');
    context.subscriptions.push(this.outputChannel);
    context.subscriptions.push(this._onDidChangeTreeData);
    // Internal-only command backing the error node's "Show output" child --
    // not declared in package.json (never surfaced in the command palette).
    context.subscriptions.push(
      vscode.commands.registerCommand('mockymock.boundaries.showOutput', () => this.outputChannel.show())
    );
    this.scenarioMode = context.workspaceState.get<ScenarioMode>(MODE_KEY, 'happy');
  }

  get model(): BoundariesViewModel | undefined {
    return this.modelGuard.model;
  }

  // The cblPath paired with the currently COMMITTED model -- never the
  // merely-requested `currentCblPath`, which can be ahead of it while a
  // refresh is still in flight (see modelGuard's doc comment, and
  // setSeeded() above, which reads it for the same reason). Consumers that
  // need "the .cbl the visible tree actually reflects" -- e.g. generateCut's
  // command handler -- must read this, not the active editor's path.
  get cblPath(): string | undefined {
    return this.modelGuard.cblPath;
  }

  private seededOverridesKey(cblPath: string): string {
    return `${SEEDED_KEY_PREFIX}${cblPath}`;
  }

  async setScenarioMode(mode: ScenarioMode): Promise<void> {
    this.scenarioMode = mode;
    await this.context.workspaceState.update(MODE_KEY, mode);
    await this.refresh(this.currentCblPath);
  }

  // Resolves the executable + copybook paths, fetches and validates the
  // bundle, and rebuilds the view-model from persisted checkbox overrides.
  // cblPath === undefined renders the welcome state (an empty root, which
  // triggers the viewsWelcome contribution).
  async refresh(cblPath: string | undefined): Promise<void> {
    const token = this.modelGuard.begin();
    this.currentCblPath = cblPath;

    if (!cblPath) {
      // Synchronous: nothing awaited yet, so this token is still current --
      // commit always succeeds.
      this.modelGuard.commit(token, undefined, undefined);
      this.errorState = undefined;
      this._onDidChangeTreeData.fire();
      return;
    }

    let nextModel: BoundariesViewModel | undefined;
    let nextError: ErrorState | undefined;
    try {
      const uri = vscode.Uri.file(cblPath);
      const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
      const config = vscode.workspace.getConfiguration('mockymock', uri);
      const executablePath = resolveExecutablePath(config.get<string>('executablePath'), this.context.extensionPath);
      const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
        workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
      );

      const bundle = await fetchBundle(runCommand, executablePath, cblPath, {
        scenarios: this.scenarioMode,
        copybookPaths,
      });

      const overrides = this.context.workspaceState.get<Record<string, boolean>>(
        this.seededOverridesKey(cblPath),
        {}
      );
      nextModel = buildViewModel(bundle, overrides);
    } catch (err) {
      if (err instanceof BundleError) {
        nextError = { message: err.message, stderr: err.stderr };
      } else {
        nextError = { message: err instanceof Error ? err.message : String(err) };
      }
    }

    // Only ever pair a committed cblPath with an actual live model -- an
    // error result commits (undefined, undefined), matching the invariant
    // "modelGuard.cblPath is defined iff modelGuard.model is defined".
    const committed = this.modelGuard.commit(token, nextModel ? cblPath : undefined, nextModel);
    if (!committed) {
      // A newer refresh() call already landed; this result is stale -- drop
      // it rather than clobbering what that newer call committed.
      return;
    }

    this.errorState = nextError;
    if (nextError?.stderr) {
      this.outputChannel.appendLine(nextError.stderr);
    }
    this._onDidChangeTreeData.fire();
  }

  // Applies a checkbox toggle to every node sharing (category, key) -- the
  // link is deliberately paragraph-agnostic (Task 2 review decision: mirrors
  // the CLI's --placeholder granularity) -- then persists the resulting
  // override set under the currently COMMITTED model's cblPath (never the
  // merely-requested `currentCblPath`; see modelGuard's doc comment).
  async setSeeded(category: string, key: string, seeded: boolean): Promise<void> {
    const model = this.modelGuard.model;
    const cblPath = this.modelGuard.cblPath;
    if (!model || !cblPath) return;
    let changed = false;
    for (const group of model.groups) {
      for (const boundary of group.boundaries) {
        if (boundary.category === category && boundary.key === key && boundary.seeded !== seeded) {
          boundary.seeded = seeded;
          changed = true;
        }
      }
    }
    if (!changed) return;
    await this.context.workspaceState.update(this.seededOverridesKey(cblPath), toSeededOverrides(model));
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BoundaryTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'group': {
        const item = new vscode.TreeItem(element.paragraph, vscode.TreeItemCollapsibleState.Expanded);
        item.id = groupNodeId(element.paragraph);
        item.contextValue = 'boundaryGroup';
        item.iconPath = new vscode.ThemeIcon('symbol-namespace');
        return item;
      }
      case 'boundary': {
        const b = element.boundary;
        const collapsible =
          b.layout.length > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
        const item = new vscode.TreeItem(`${b.category} ${b.key}`, collapsible);
        item.id = b.id;
        item.description = boundaryDescription(b);
        item.checkboxState = b.seeded ? vscode.TreeItemCheckboxState.Checked : vscode.TreeItemCheckboxState.Unchecked;
        item.iconPath = iconForCategory(b.category);
        item.contextValue = 'boundary';
        item.tooltip = b.line !== null ? `${b.category} ${b.key} — line ${b.line}` : `${b.category} ${b.key}`;
        return item;
      }
      case 'field': {
        const item = new vscode.TreeItem(element.field.name, vscode.TreeItemCollapsibleState.None);
        // column, not name: name repeats across OCCURS occurrences, column
        // is cobol-parser's guaranteed-unique-per-occurrence disambiguator.
        item.id = fieldNodeId(element.boundaryId, element.field.column);
        item.description = `PIC ${element.field.picture ?? '—'}`;
        item.contextValue = 'boundaryField';
        return item;
      }
      case 'unresolvedRoot': {
        const item = new vscode.TreeItem('Unresolved', vscode.TreeItemCollapsibleState.Collapsed);
        item.id = 'unresolved';
        item.iconPath = new vscode.ThemeIcon('warning');
        item.contextValue = 'unresolvedRoot';
        return item;
      }
      case 'unresolvedItem': {
        const item = new vscode.TreeItem(element.text, vscode.TreeItemCollapsibleState.None);
        item.id = unresolvedItemNodeId(element.index);
        item.iconPath = new vscode.ThemeIcon('warning');
        item.contextValue = 'unresolvedItem';
        return item;
      }
      case 'error': {
        const collapsible = element.stderr
          ? vscode.TreeItemCollapsibleState.Expanded
          : vscode.TreeItemCollapsibleState.None;
        const item = new vscode.TreeItem(element.message, collapsible);
        item.id = 'error';
        item.iconPath = new vscode.ThemeIcon('error');
        item.contextValue = 'boundaryError';
        return item;
      }
      case 'showOutput': {
        const item = new vscode.TreeItem('Show output', vscode.TreeItemCollapsibleState.None);
        item.id = 'error:showOutput';
        item.iconPath = new vscode.ThemeIcon('output');
        item.command = { command: 'mockymock.boundaries.showOutput', title: 'Show output' };
        return item;
      }
    }
  }

  getChildren(element?: BoundaryTreeNode): BoundaryTreeNode[] {
    if (!element) {
      if (this.errorState) {
        return [{ kind: 'error', message: this.errorState.message, stderr: this.errorState.stderr }];
      }
      const model = this.modelGuard.model;
      if (!model) {
        return [];
      }
      const nodes: BoundaryTreeNode[] = model.groups.map((group) => ({
        kind: 'group',
        paragraph: group.paragraph,
        boundaries: group.boundaries,
      }));
      if (model.unresolved.length > 0) {
        nodes.push({ kind: 'unresolvedRoot', items: model.unresolved });
      }
      return nodes;
    }

    switch (element.kind) {
      case 'group':
        return element.boundaries.map((boundary) => ({ kind: 'boundary', boundary }));
      case 'boundary':
        return element.boundary.layout.map((field) => ({ kind: 'field', boundaryId: element.boundary.id, field }));
      case 'unresolvedRoot':
        return element.items.map((text, index) => ({ kind: 'unresolvedItem', text, index }));
      case 'error':
        return element.stderr ? [{ kind: 'showOutput' }] : [];
      default:
        return [];
    }
  }
}
