// src/extension.ts
import * as vscode from 'vscode';
import { EnvironmentManager } from './environment/environmentManager';
import { activateTestController } from './testing/testController';
import { activateLintDiagnostics } from './linting/lintDiagnostics';
import { MockymockDebugAdapterDescriptorFactory } from './debug/debugAdapterFactory';
import { MockymockDebugConfigurationProvider } from './debug/debugConfigurationProvider';
import { activateExportMainframeCommand } from './export/exportMainframe';
import { healBundledBinaryOnDarwin } from './environment/macSelfHeal';
import { CUT_DISCOVERY_EXCLUDE_GLOB } from './discovery/cutDiscovery';
import { activateNewTestSuiteCommand, NEW_TEST_SUITE_COMMAND } from './newTestSuite/newTestSuite';
import { WALKTHROUGH_ID } from './environment/notify';

const MOCKYMOCK_DEBUG_TYPE = 'mockymock-cobol';

// Whether this workspace has any mockymock test suites at all -- used to
// decide whether a successful setup check should offer "create one" as the
// obvious next step.
async function isCutWorkspace(): Promise<boolean> {
  const [cutFile] = await vscode.workspace.findFiles('**/*.cut', CUT_DISCOVERY_EXCLUDE_GLOB, 1);
  return cutFile !== undefined;
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
  activateNewTestSuiteCommand(context);

  context.subscriptions.push(
    vscode.debug.registerDebugAdapterDescriptorFactory(
      MOCKYMOCK_DEBUG_TYPE,
      new MockymockDebugAdapterDescriptorFactory(context.extensionPath)
    ),
    vscode.debug.registerDebugConfigurationProvider(MOCKYMOCK_DEBUG_TYPE, new MockymockDebugConfigurationProvider(context))
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('mockymock.checkEnvironment', async () => {
      const result = await environmentManager.ensureReady();
      // On failure ensureReady() has already shown the relevant actionable
      // prompt itself (install the CLI, start Docker, open the download
      // page); a success needs its own feedback since the status bar text
      // change alone is easy to miss on a deliberate "is this set up?" click.
      // In a workspace with no suite yet, "ready" naturally leads to "so
      // write one" -- offer that next step right on the toast.
      if (result.ok) {
        const createSuite = 'Create a Test Suite';
        const actions = (await isCutWorkspace()) ? [] : [createSuite];
        const choice = await vscode.window.showInformationMessage(
          'mockymock is ready: the CLI and Docker are both available.',
          ...actions
        );
        if (choice === createSuite) {
          await vscode.commands.executeCommand(NEW_TEST_SUITE_COMMAND);
        }
      }
    }),
    // The Getting Started walkthrough VS Code shows on install, reachable
    // again later from the Command Palette. The third argument (toSide)
    // is false: open it as a full editor, like the Welcome page does.
    vscode.commands.registerCommand('mockymock.openWalkthrough', () =>
      vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID, false)
    )
  );
}

export function deactivate() {}
