// src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';
import { activateLintDiagnostics } from './linting/lintDiagnostics';
import { MockymockDebugAdapterDescriptorFactory } from './debug/debugAdapterFactory';
import { MockymockDebugConfigurationProvider } from './debug/debugConfigurationProvider';
import { activateExportMainframeCommand } from './export/exportMainframe';
import { BoundariesTreeProvider, BoundaryTreeNode } from './boundaries/boundariesTreeProvider';
import type { ScenarioMode } from './boundaries/bundleTypes';

const MOCKYMOCK_DEBUG_TYPE = 'mockymock-cobol';
const BOUNDARIES_REFRESH_DEBOUNCE_MS = 300;

function isCobolPath(fsPath: string): boolean {
  const lower = fsPath.toLowerCase();
  return lower.endsWith('.cbl') || lower.endsWith('.cob');
}

// Active editor -> the .cbl path the Boundaries view should show, or
// undefined (welcome state) for anything else -- a non-file editor, a
// non-COBOL file, or no editor at all.
function resolveActiveCblPath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  const fsPath = editor && editor.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
  return fsPath && isCobolPath(fsPath) ? fsPath : undefined;
}

function activateBoundariesView(context: vscode.ExtensionContext): void {
  const provider = new BoundariesTreeProvider(context);
  const view = vscode.window.createTreeView<BoundaryTreeNode>('mockymock.boundaries', {
    treeDataProvider: provider,
  });
  context.subscriptions.push(view);

  context.subscriptions.push(
    view.onDidChangeCheckboxState((event) => {
      for (const [node, state] of event.items) {
        if (node.kind === 'boundary') {
          void provider.setSeeded(
            node.boundary.category,
            node.boundary.key,
            state === vscode.TreeItemCheckboxState.Checked
          );
        }
      }
    })
  );

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void provider.refresh(resolveActiveCblPath()), BOUNDARIES_REFRESH_DEBOUNCE_MS);
  }
  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    },
  });

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh()));
  scheduleRefresh();

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.boundaries.refresh', () => {
      void provider.refresh(resolveActiveCblPath());
    }),
    vscode.commands.registerCommand('mockymock.boundaries.setScenarioMode', async () => {
      const picked = await vscode.window.showQuickPick(
        [
          { label: 'happy' as ScenarioMode, description: 'One happy-path scenario' },
          { label: 'branches' as ScenarioMode, description: 'One scenario per reachable branch arm' },
          { label: 'all' as ScenarioMode, description: 'Branches plus boundary-value/error-status families' },
        ],
        { placeHolder: 'mockymock boundaries: scenario mode' }
      );
      if (!picked) return;
      await provider.setScenarioMode(picked.label);
    }),
    // Handler lands in Task 4 (generateCut.ts wired to `mockymock generate
    // --with-data`); registered now so the command exists in the palette
    // and the view/title menu stays consistent with package.json.
    vscode.commands.registerCommand('mockymock.boundaries.generateCut', () => {
      vscode.window.showInformationMessage('Generate .cut arrives in the next change');
    })
  );
}

export function activate(context: vscode.ExtensionContext) {
  const environmentManager = new EnvironmentManager(context);
  activateTestController(context, environmentManager);
  activateLintDiagnostics(context);
  activateExportMainframeCommand(context);
  activateBoundariesView(context);

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(
      MOCKYMOCK_DEBUG_TYPE,
      new MockymockDebugAdapterDescriptorFactory(context.extensionPath)
    ),
    vscode.debug.registerDebugConfigurationProvider(MOCKYMOCK_DEBUG_TYPE, new MockymockDebugConfigurationProvider())
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.checkEnvironment', async () => {
      const result = await environmentManager.ensureReady();
      // On failure ensureReady() has already shown the relevant actionable
      // prompt itself (install the CLI, start Docker, open the download
      // page); a success needs its own feedback since the status bar text
      // change alone is easy to miss on a deliberate "is this set up?" click.
      if (result.ok) {
        vscode.window.showInformationMessage('mockymock: ready to run tests.');
      }
    })
  );
}

export function deactivate() {}
