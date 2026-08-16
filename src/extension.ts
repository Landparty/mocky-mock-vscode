// src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';
import { activateLintDiagnostics } from './linting/lintDiagnostics';
import { MockymockDebugAdapterDescriptorFactory } from './debug/debugAdapterFactory';
import { MockymockDebugConfigurationProvider } from './debug/debugConfigurationProvider';
import { activateExportMainframeCommand } from './export/exportMainframe';
import { activateAnalyzeCobolCommand } from './analysis/analyzeCobol';
import { activateMoveMismatchDiagnostics } from './analysis/moveMismatchDiagnostics';
import { activateGenerateDataCommand } from './generateData/generateData';
import { healBundledBinaryOnDarwin } from './environment/macSelfHeal';
import {
  COBOL_VIEWS_CONTEXT_KEY,
  hasCobolTabOpen,
  isCobolPath,
  shouldClearOnEditorChange,
} from './boundaries/viewRefreshPolicy';
import { ParagraphTreeViewProvider } from './paragraphTree/paragraphTreeViewProvider';
import { ProgramFlowViewProvider } from './programFlow/programFlowViewProvider';
import { activateOutlineProvider } from './outline/outlineProvider';
import { activateFocusStatements } from './focusStatements/activateFocusStatements';
import { CUT_DISCOVERY_EXCLUDE_GLOB } from './discovery/cutDiscovery';

const MOCKYMOCK_DEBUG_TYPE = 'mockymock-cobol';
const TREE_VIEW_REFRESH_DEBOUNCE_MS = 300;

// Active editor -> the .cbl path the Paragraph Tree view should show, or
// undefined (welcome/empty state) for anything else -- a non-file editor, a
// non-COBOL file, or no editor at all.
function resolveActiveCblPath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  const fsPath = editor && editor.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
  return fsPath && isCobolPath(fsPath) ? fsPath : undefined;
}

// onLanguage:cobol (added alongside the Outline provider) now activates the
// extension, and therefore makes the Paragraph Tree and Program Flow views
// reachable via mockymock.cobolOpen, in a workspace with no mockymock .cut
// tests at all. Without this check, the debounced auto-refresh below would
// spawn a `mockymock analyze` CLI probe for someone who just opened an
// unrelated COBOL file. The explicit Refresh command is unaffected -- it
// calls provider.refresh() directly, bypassing this gate entirely (see the
// comment above scheduleRefresh).
async function isCutWorkspace(): Promise<boolean> {
  const [cutFile] = await vscode.workspace.findFiles('**/*.cut', CUT_DISCOVERY_EXCLUDE_GLOB, 1);
  return cutFile !== undefined;
}

// Every currently-open editor tab's path, across all groups -- used (only)
// to decide whether any of them is COBOL, not to pick which one to show
// (that's resolveActiveCblPath's job). tabGroups over workspace.textDocuments
// deliberately: the latter also lists documents opened programmatically
// without ever being shown in a tab, which would report COBOL as "open" when
// nothing visible actually is.
//
// Unlike resolveActiveCblPath (which needs a real local `fsPath` to invoke
// the CLI on), this does NOT filter to scheme === 'file': isCobolPath only
// inspects the trailing extension, so `.path` works the same for a
// vscode-remote or virtual-filesystem tab as for a local one. Filtering to
// 'file' here would leave the views permanently hidden in Remote/virtual-FS
// workspaces even with a COBOL file open, defeating the point of this gate.
function openTabPaths(): string[] {
  const paths: string[] = [];
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      if (tab.input instanceof vscode.TabInputText) {
        paths.push(tab.input.uri.path);
      }
    }
  }
  return paths;
}

// Gates package.json's `when": "mockymock.cobolOpen"` on both side views:
// they should exist in the Explorer only while some COBOL tab is open, and
// disappear again once the last one closes (see hasCobolTabOpen's doc
// comment for why this is a live check, not a latch). onDidChangeTabs
// covers open/close/move of tabs, which is exactly the set this recomputes
// from -- switching focus between already-open tabs doesn't change that set,
// so no separate onDidChangeActiveTextEditor listener is needed here.
function activateCobolViewVisibility(context: vscode.ExtensionContext): void {
  function update(): void {
    void vscode.commands.executeCommand('setContext', COBOL_VIEWS_CONTEXT_KEY, hasCobolTabOpen(openTabPaths()));
  }
  update();
  context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(update));
}

function activateParagraphTreeView(context: vscode.ExtensionContext): void {
  const provider = new ParagraphTreeViewProvider(context);

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (!provider.visible) return;
      if (!(await isCutWorkspace())) return;
      if (!provider.visible) return; // re-check: the workspace scan above can outlive the view being visible
      const activeCblPath = resolveActiveCblPath();
      const newEditorIsCobol = activeCblPath !== undefined;
      if (newEditorIsCobol) {
        if (activeCblPath !== provider.cblPath) {
          void provider.refresh(activeCblPath);
        }
      } else if (shouldClearOnEditorChange(provider.cblPath !== undefined, newEditorIsCobol)) {
        void provider.refresh(undefined);
      }
    }, TREE_VIEW_REFRESH_DEBOUNCE_MS);
  }
  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    },
  });

  // The webview only exists once VS Code first renders it -- see
  // ParagraphTreeViewProvider.onVisible's doc comment. Wire it before
  // registerWebviewViewProvider (below), which is the call that can
  // trigger resolveWebviewView -- this view has no unconditional refresh
  // that runs regardless of visibility, so onVisible is the ONLY path to a
  // first render; assigning it after registration would leave the view
  // stuck on the empty state until the user manually switches editors or
  // hits refresh.
  provider.onVisible = scheduleRefresh;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('mockymock.paragraphTree', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh()));

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.paragraphTree.refresh', () => {
      void provider.refresh(resolveActiveCblPath());
    })
  );
}

function activateProgramFlowView(context: vscode.ExtensionContext): void {
  const provider = new ProgramFlowViewProvider(context);

  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (!provider.visible) return;
      // Same isCutWorkspace gate as the Paragraph Tree view (see the
      // comment above isCutWorkspace): without it, opening any
      // unrelated COBOL file in a non-mockymock workspace would spawn an
      // `analyze --help` probe plus two `analyze program-flow` runs.
      if (!(await isCutWorkspace())) return;
      if (!provider.visible) return; // re-check: the workspace scan above can outlive the view being visible
      const activeCblPath = resolveActiveCblPath();
      const newEditorIsCobol = activeCblPath !== undefined;
      if (newEditorIsCobol) {
        if (activeCblPath !== provider.cblPath) {
          void provider.refresh(activeCblPath);
        }
      } else if (shouldClearOnEditorChange(provider.cblPath !== undefined, newEditorIsCobol)) {
        void provider.refresh(undefined);
      }
    }, TREE_VIEW_REFRESH_DEBOUNCE_MS);
  }
  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    },
  });

  provider.onVisible = scheduleRefresh;

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('mockymock.programFlow', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    })
  );

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh()));

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.programFlow.refresh', () => {
      void provider.refresh(resolveActiveCblPath());
    })
  );
}

export function activate(context: vscode.ExtensionContext) {
  // Best-effort, macOS-only, fire-and-forget -- see macSelfHeal.ts for why
  // this exists (Gatekeeper). Deliberately NOT awaited: activate() must
  // finish registering every command/provider below synchronously, so a
  // stall here (there shouldn't be one, but "should never happen" is not a
  // guarantee worth staking command registration on) can never leave
  // mockymock's commands unregistered. It's still started before
  // EnvironmentManager's constructor kicks off its own first CLI probe, so
  // it normally wins that race; if it doesn't, that probe is read-only and
  // re-runs on the next status-bar click or test run regardless.
  void healBundledBinaryOnDarwin(context.extensionPath);
  const environmentManager = new EnvironmentManager(context);
  activateTestController(context, environmentManager);
  activateLintDiagnostics(context);
  activateExportMainframeCommand(context);
  activateAnalyzeCobolCommand(context);
  activateMoveMismatchDiagnostics(context);
  activateGenerateDataCommand(context);
  activateCobolViewVisibility(context);
  activateParagraphTreeView(context);
  activateOutlineProvider(context);
  activateProgramFlowView(context);
  activateFocusStatements(context);

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
