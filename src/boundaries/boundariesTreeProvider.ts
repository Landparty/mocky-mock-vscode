// src/boundaries/boundariesTreeProvider.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { runCommand } from '../environment/commandRunner';
import { resolveExecutablePath } from '../environment/checks';
import { fetchBundle, BundleError } from './bundleClient';
import { buildViewModel, toSeededOverrides, BoundariesViewModel, BoundaryNode } from './boundariesModel';
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

  private _model: BoundariesViewModel | undefined;
  private currentCblPath: string | undefined;
  private errorState: ErrorState | undefined;
  // Monotonic guard against out-of-order completions: if refresh(B) is
  // triggered while refresh(A) is still in flight, A's late result must not
  // clobber B's once B has already landed.
  private refreshSeq = 0;

  scenarioMode: ScenarioMode;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.outputChannel = vscode.window.createOutputChannel('mockymock boundaries');
    context.subscriptions.push(this.outputChannel);
    // Internal-only command backing the error node's "Show output" child --
    // not declared in package.json (never surfaced in the command palette).
    context.subscriptions.push(
      vscode.commands.registerCommand('mockymock.boundaries.showOutput', () => this.outputChannel.show())
    );
    this.scenarioMode = context.workspaceState.get<ScenarioMode>(MODE_KEY, 'happy');
  }

  get model(): BoundariesViewModel | undefined {
    return this._model;
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
    const seq = ++this.refreshSeq;
    this.currentCblPath = cblPath;

    if (!cblPath) {
      this._model = undefined;
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

    if (seq !== this.refreshSeq) {
      // A newer refresh() call already landed; this result is stale.
      return;
    }

    this._model = nextModel;
    this.errorState = nextError;
    if (nextError?.stderr) {
      this.outputChannel.appendLine(nextError.stderr);
    }
    this._onDidChangeTreeData.fire();
  }

  // Applies a checkbox toggle to every node sharing (category, key) -- the
  // link is deliberately paragraph-agnostic (Task 2 review decision: mirrors
  // the CLI's --placeholder granularity) -- then persists the resulting
  // override set.
  async setSeeded(category: string, key: string, seeded: boolean): Promise<void> {
    if (!this._model || !this.currentCblPath) return;
    let changed = false;
    for (const group of this._model.groups) {
      for (const boundary of group.boundaries) {
        if (boundary.category === category && boundary.key === key && boundary.seeded !== seeded) {
          boundary.seeded = seeded;
          changed = true;
        }
      }
    }
    if (!changed) return;
    await this.context.workspaceState.update(
      this.seededOverridesKey(this.currentCblPath),
      toSeededOverrides(this._model)
    );
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: BoundaryTreeNode): vscode.TreeItem {
    switch (element.kind) {
      case 'group': {
        const item = new vscode.TreeItem(element.paragraph, vscode.TreeItemCollapsibleState.Expanded);
        item.id = `group:${element.paragraph}`;
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
        item.id = `${element.boundaryId}#field:${element.field.name}`;
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
        item.id = `unresolved:${element.index}`;
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
      if (!this._model) {
        return [];
      }
      const nodes: BoundaryTreeNode[] = this._model.groups.map((group) => ({
        kind: 'group',
        paragraph: group.paragraph,
        boundaries: group.boundaries,
      }));
      if (this._model.unresolved.length > 0) {
        nodes.push({ kind: 'unresolvedRoot', items: this._model.unresolved });
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
