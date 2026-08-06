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
import { runCommand } from './environment/commandRunner';
import { resolveExecutablePath } from './environment/checks';
import { BoundariesTreeProvider, BoundaryTreeNode } from './boundaries/boundariesTreeProvider';
import { placeholderArgs } from './boundaries/boundariesModel';
import { runGenerate, resolveOutPath, GenerateOptions, GenerateResult } from './boundaries/generateCut';
import { BundleError } from './boundaries/bundleClient';
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

async function fileExists(fsPath: string): Promise<boolean> {
  try {
    await fs.access(fsPath);
    return true;
  } catch {
    return false;
  }
}

// InputBox validator: blank is valid (means "no fixed seed" -- omitted from
// the CLI invocation entirely, same as a from-scratch `fixtures` fetch,
// which never sends --seed either -- see boundariesTreeProvider.refresh()).
// Anything non-blank must be a plain non-negative whole number.
function validateSeedInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  return /^\d+$/.test(trimmed) ? undefined : 'Enter a whole number (0 or greater), or leave blank for no fixed seed.';
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
  const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
  const config = vscode.workspace.getConfiguration('mockymock', uri);
  const executablePath = resolveExecutablePath(config.get<string>('executablePath'), context.extensionPath);
  const copybookPaths = (config.get<string[]>('copybookPaths') ?? []).map((p) =>
    workspaceFolder && !path.isAbsolute(p) ? path.join(workspaceFolder.uri.fsPath, p) : p
  );

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
    if (err instanceof BundleError && err.stderr) {
      provider.appendOutput(`mockymock generate failed: ${message}`);
      provider.appendOutput(err.stderr);
    }
    const choice = await vscode.window.showErrorMessage(`mockymock generate failed: ${message}`, 'Show output');
    if (choice === 'Show output') {
      await vscode.commands.executeCommand('mockymock.boundaries.showOutput');
    }
    return;
  }

  // Refresh BEFORE opening the generated file: showTextDocument below makes
  // the .cut the active editor, which fires onDidChangeActiveTextEditor and
  // (300ms later, debounced) resolveActiveCblPath() -> undefined for a
  // .cut -- the same welcome-state refresh any non-.cbl active editor
  // triggers (Task 3). Refreshing on cblPath first, synchronously ahead of
  // that debounce, is what actually lands the regenerated boundaries in the
  // tree; doing it after would just be overwritten by the debounced one.
  await provider.refresh(cblPath);

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

function activateBoundariesView(context: vscode.ExtensionContext, environmentManager: EnvironmentManager): void {
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
    vscode.commands.registerCommand('mockymock.boundaries.generateCut', async () =>
      runGenerateCutCommand(context, provider, environmentManager)
    )
  );
}

export function activate(context: vscode.ExtensionContext) {
  const environmentManager = new EnvironmentManager(context);
  activateTestController(context, environmentManager);
  activateLintDiagnostics(context);
  activateExportMainframeCommand(context);
  activateBoundariesView(context, environmentManager);

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
