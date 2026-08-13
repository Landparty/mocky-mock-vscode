// src/extension.ts
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';
import { activateLintDiagnostics } from './linting/lintDiagnostics';
import { MockymockDebugAdapterDescriptorFactory } from './debug/debugAdapterFactory';
import { MockymockDebugConfigurationProvider } from './debug/debugConfigurationProvider';
import { activateExportMainframeCommand } from './export/exportMainframe';
import { activateAnalyzeCobolCommand } from './analysis/analyzeCobol';
import { activateGenerateDataCommand } from './generateData/generateData';
import { runCommand } from './environment/commandRunner';
import { healBundledBinaryOnDarwin } from './environment/macSelfHeal';
import { resolveInvocationConfig } from './environment/invocationConfig';
import { BoundariesTreeProvider, BoundaryTreeNode } from './boundaries/boundariesTreeProvider';
import { placeholderArgs } from './boundaries/boundariesModel';
import { runGenerate, resolveOutPath, GenerateOptions, GenerateResult } from './boundaries/generateCut';
import { BundleError } from './boundaries/bundleClient';
import {
  COBOL_VIEWS_CONTEXT_KEY,
  hasCobolTabOpen,
  isCobolPath,
  shouldClearOnEditorChange,
} from './boundaries/viewRefreshPolicy';
import type { ScenarioMode } from './boundaries/bundleTypes';
import { ParagraphTreeViewProvider } from './paragraphTree/paragraphTreeViewProvider';
import { ProgramFlowViewProvider } from './programFlow/programFlowViewProvider';
import { activateOutlineProvider } from './outline/outlineProvider';
import { activateFocusStatements } from './focusStatements/activateFocusStatements';
import { CUT_DISCOVERY_EXCLUDE_GLOB } from './discovery/cutDiscovery';

const MOCKYMOCK_DEBUG_TYPE = 'mockymock-cobol';
const TREE_VIEW_REFRESH_DEBOUNCE_MS = 300;

// Active editor -> the .cbl path the Boundaries and Paragraph Tree views
// should show, or undefined (welcome/empty state) for anything else -- a
// non-file editor, a non-COBOL file, or no editor at all.
function resolveActiveCblPath(): string | undefined {
  const editor = vscode.window.activeTextEditor;
  const fsPath = editor && editor.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
  return fsPath && isCobolPath(fsPath) ? fsPath : undefined;
}

async function fileExists(fsPath: string): Promise<boolean> {
  try {
    await fs.access(fsPath);
    return true;
  } catch {
    return false;
  }
}

// onLanguage:cobol (added alongside the Outline provider) now activates the
// extension, and therefore makes the Boundaries view reachable via
// mockymock.cobolOpen, in a workspace with no mockymock .cut tests at all.
// Without this check, the debounced auto-refresh below would spawn
// `mockymock fixtures` for someone who just opened an unrelated COBOL file.
// Explicit user actions (the Refresh command, Generate .cut) are
// unaffected -- they call provider.refresh() directly, bypassing this
// gate entirely (see the comment above scheduleRefresh).
async function isCutWorkspace(): Promise<boolean> {
  const [cutFile] = await vscode.workspace.findFiles('**/*.cut', CUT_DISCOVERY_EXCLUDE_GLOB, 1);
  return cutFile !== undefined;
}

// InputBox validator: blank is valid (means "no fixed seed" -- omitted from
// the CLI invocation entirely, same as a from-scratch `fixtures` fetch,
// which never sends --seed either -- see boundariesTreeProvider.refresh()).
// Anything non-blank must be a plain non-negative whole number.
function validateSeedInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!/^\d+$/.test(trimmed)) {
    return 'Enter a whole number (0 or greater), or leave blank for no fixed seed.';
  }
  // A digit string this long round-trips through Number() with silent
  // precision loss (e.g. two different 20-digit seeds could collapse to the
  // same forwarded --seed value) -- reject before that happens rather than
  // send a --seed the user didn't actually type.
  return Number.isSafeInteger(Number(trimmed)) ? undefined : 'Seed is too large — enter a smaller whole number.';
}

// The "Generate .cut" command handler: assembles a `mockymock generate
// --with-data` invocation from the Boundaries view's current, COMMITTED
// state (never the possibly-in-flight active editor -- see
// BoundariesTreeProvider.cblPath's doc comment) and the view's own
// scenarioMode, prompts for an optional seed, resolves an output-path
// collision with the same three-way choice exportMainframe.ts-style
// commands use, runs it gated on the same EnvironmentManager.ready() check
// runOneFile uses before any mockymock invocation, then opens the result.
async function runGenerateCutCommand(
  context: vscode.ExtensionContext,
  provider: BoundariesTreeProvider,
  environmentManager: EnvironmentManager
): Promise<void> {
  const model = provider.model;
  const cblPath = provider.cblPath;
  if (!model || !cblPath) {
    vscode.window.showErrorMessage(
      'mockymock: open a .cbl file with a populated Boundaries view first, then run "Generate .cut".'
    );
    return;
  }

  const seedInput = await vscode.window.showInputBox({
    title: 'mockymock: Generate .cut',
    prompt: 'Seed for generated data (optional, whole number)',
    placeHolder: 'leave blank for no fixed seed',
    validateInput: validateSeedInput,
  });
  if (seedInput === undefined) {
    return; // Escape / dismissed.
  }
  const trimmedSeed = seedInput.trim();
  const seed = trimmedSeed.length > 0 ? Number(trimmedSeed) : undefined;

  const defaultOutPath = resolveOutPath(cblPath);
  let outPath = defaultOutPath;
  if (await fileExists(defaultOutPath)) {
    const parsed = path.parse(defaultOutPath);
    const generatedOutPath = path.join(parsed.dir, `${parsed.name}.generated${parsed.ext}`);
    const overwriteChoice = 'Overwrite';
    const generatedChoice = `Write ${path.basename(generatedOutPath)}`;
    const choice = await vscode.window.showWarningMessage(
      `mockymock: "${path.basename(defaultOutPath)}" already exists.`,
      { modal: true },
      overwriteChoice,
      generatedChoice
    );
    if (choice === undefined) {
      return; // Cancel (Escape, or the modal's own Cancel button).
    }
    outPath = choice === overwriteChoice ? defaultOutPath : generatedOutPath;
  }

  const ready = await environmentManager.ensureReady();
  if (!ready.ok) {
    vscode.window.showErrorMessage(ready.message);
    return;
  }

  const uri = vscode.Uri.file(cblPath);
  const { executablePath, copybookPaths } = resolveInvocationConfig(context, uri);

  const options: GenerateOptions = {
    cblPath,
    outPath,
    scenarios: provider.scenarioMode,
    seed,
    copybookPaths,
    placeholders: placeholderArgs(model),
  };

  let result: GenerateResult;
  try {
    result = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'mockymock: generating .cut with data…' },
      () => runGenerate(runCommand, executablePath, options)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // BundleError.stderr here is BOTH streams concatenated (see
    // generateCut.ts's runGenerate) -- e.g. an unmatched --placeholder
    // warning plus the actual refusal underneath it. `message` is only the
    // one line that decided the failure; log the rest so nothing a failing
    // run printed is lost, same channel the tree's own error node's "Show
    // output" already points at.
    // Always log SOMETHING before offering "Show output" below -- a prior
    // version only logged here when `err` was a BundleError carrying
    // stderr, so any other failure (e.g. an exception from resolving
    // config, or from withProgress itself) left "Show output" pointing at
    // stale or empty content.
    provider.appendOutput(`mockymock generate failed: ${message}`);
    if (err instanceof BundleError && err.stderr) {
      provider.appendOutput(err.stderr);
    }
    const choice = await vscode.window.showErrorMessage(`mockymock generate failed: ${message}`, 'Show output');
    if (choice === 'Show output') {
      await vscode.commands.executeCommand('mockymock.boundaries.showOutput');
    }
    return;
  }

  // No refresh here (final review, Task 2): `generate` only ever WRITES the
  // .cut file -- it never touches cblPath itself (see generateCut.ts's
  // buildGenerateArgs) -- so the boundaries model already showing in the
  // tree is still accurate; refetching it via `mockymock fixtures` would
  // just reproduce the same data for an extra CLI round-trip. The
  // showTextDocument() call below makes the .cut the active editor, which
  // fires onDidChangeActiveTextEditor for a non-.cbl file; the editor-change
  // handler now PINS the tree in that case instead of clearing it to the
  // welcome state (shouldClearOnEditorChange), so nothing here needs to
  // re-land the model ahead of that debounce.
  const doc = await vscode.workspace.openTextDocument(outPath);
  await vscode.window.showTextDocument(doc);
  if (result.warnings.length > 0) {
    vscode.window.showWarningMessage(`mockymock generate: ${result.warnings.join('\n')}`);
  }
  if (result.notes.length > 0) {
    // Informational, not actionable -- "N boundary point(s) ... not
    // mockable" (or a STOP RUN/GOBACK site) is routine for most real
    // programs, not a sign this invocation did anything wrong, so it
    // doesn't share showWarningMessage's implied "something's off" tone
    // with the --placeholder-mismatch warnings above.
    vscode.window.showInformationMessage(`mockymock generate: ${result.notes.join('\n')}`);
  }
  if (seed === undefined && result.seed !== null) {
    // The user left the seed prompt blank, so the CLI drew one; surface it
    // so the run is replayable (design spec 2026-08-04). When they typed a
    // seed themselves there is nothing to tell them.
    vscode.window.showInformationMessage(
      `mockymock generate: seed ${result.seed} (enter it in the seed prompt to replay this run).`
    );
  }
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

function activateBoundariesView(context: vscode.ExtensionContext, environmentManager: EnvironmentManager): void {
  const provider = new BoundariesTreeProvider(context);
  const view = vscode.window.createTreeView<BoundaryTreeNode>('mockymock.boundaries', {
    treeDataProvider: provider,
  });
  // Task 1 (final review): the spec requires scenario mode be "shown in the
  // view description" -- the view title bar's subtitle. Set at creation and
  // kept in sync inside the setScenarioMode command handler below.
  view.description = provider.scenarioMode;
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

  // Task 3 (final review): a hidden Boundaries view was still refetching on
  // every active-editor change -- a `mockymock fixtures` CLI invocation for
  // a view the user cannot currently see. Gated on view.visible below;
  // onDidChangeVisibility's handler (registered further down) catches up
  // once the view is shown again. Explicit user actions -- the Refresh
  // command and Generate .cut -- call provider.refresh() directly rather
  // than through this debounce, so they are never gated.
  let refreshTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleRefresh(): void {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(async () => {
      if (!view.visible) return;
      if (!(await isCutWorkspace())) return;
      if (!view.visible) return; // re-check: the workspace scan above can outlive the panel being visible
      const activeCblPath = resolveActiveCblPath();
      const newEditorIsCobol = activeCblPath !== undefined;
      if (newEditorIsCobol) {
        // Same dedup the visibility handler below applies: "until a
        // DIFFERENT .cbl becomes active" (controller decision) also means a
        // round-trip back to the SAME already-committed .cbl (e.g.
        // FOO.cbl -> its freshly generated FOO.cut -> back to FOO.cbl)
        // shouldn't re-run `mockymock fixtures` for data that hasn't
        // changed. After an errored refresh provider.cblPath is undefined
        // (see BoundariesTreeProvider.refresh()'s error path), so returning
        // to the same file still retries.
        if (activeCblPath !== provider.cblPath) {
          void provider.refresh(activeCblPath);
        }
      } else if (shouldClearOnEditorChange(provider.model !== undefined, newEditorIsCobol)) {
        // Task 2 (final review): only clear to the welcome state when there
        // is genuinely nothing left to show -- otherwise PIN the tree on
        // the last .cbl's boundaries (e.g. the extension's own
        // showTextDocument() on a freshly generated .cut must not blank it).
        void provider.refresh(undefined);
      }
      // else: pin -- keep showing the last committed .cbl's boundaries.
    }, TREE_VIEW_REFRESH_DEBOUNCE_MS);
  }
  context.subscriptions.push({
    dispose: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
    },
  });

  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => scheduleRefresh()));
  context.subscriptions.push(
    view.onDidChangeVisibility(async (e) => {
      // Catch-up for whatever the visibility gate above skipped while
      // hidden: only fetch when there's a real active .cbl that the
      // committed model doesn't already match -- never clears to the
      // welcome state on its own (that would break the Task 2 pinning rule
      // for a non-.cbl active editor).
      if (!e.visible) return;
      if (!(await isCutWorkspace())) return;
      if (!view.visible) return; // re-check: the workspace scan above can outlive the panel being visible
      const activeCblPath = resolveActiveCblPath();
      if (activeCblPath !== undefined && activeCblPath !== provider.cblPath) {
        void provider.refresh(activeCblPath);
      }
    })
  );
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
      // Task 1: assign before the await -- provider.setScenarioMode()
      // internally awaits a full refresh, so setting this after it would
      // leave the title bar showing the stale mode for that CLI round-trip.
      view.description = picked.label;
      await provider.setScenarioMode(picked.label);
    }),
    vscode.commands.registerCommand('mockymock.boundaries.generateCut', async () =>
      runGenerateCutCommand(context, provider, environmentManager)
    )
  );
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
  // trigger resolveWebviewView -- this view has no unconditional
  // scheduleRefresh() backstop the way activateBoundariesView does, so
  // onVisible is the ONLY path to a first render; assigning it after
  // registration would leave the view stuck on the empty state until the
  // user manually switches editors or hits refresh.
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
      // Same isCutWorkspace gate as the Boundaries and Paragraph Tree views
      // (see the comment above isCutWorkspace): without it, opening any
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
  activateGenerateDataCommand(context);
  activateCobolViewVisibility(context);
  activateBoundariesView(context, environmentManager);
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
