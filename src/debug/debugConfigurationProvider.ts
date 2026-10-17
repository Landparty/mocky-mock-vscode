import * as path from 'path';
import * as vscode from 'vscode';
import { anchorCommandPath, runCommandIn } from '../environment/commandRunner';
import { resolveExecutablePath } from '../environment/checks';
import { resolveExecutablePathSetting } from '../environment/copybookPaths';
import { EnvironmentManager } from '../environment/environmentManager';
import { configuredExecutablePath, resolveInvocationConfig, settingPathContext } from '../environment/invocationConfig';
import { absolutizeDebugPaths, buildLintArgs } from './debugArgs';
import { evaluateCaseSelection, evaluateLintResult } from './lintGate';

// This debug type is normally launched programmatically (see the "Debug
// (Interactive)" test profile in testController.ts, which builds a complete
// configuration from the selected test item), not hand-authored in
// launch.json. resolveDebugConfiguration is still required by the
// DebugConfigurationProvider contract and is the right place to refuse
// clearly if a caller (a hand-written launch.json entry, most likely) is
// missing the fields mockymock debug needs, rather than letting the CLI fail
// with a confusing argparse error after the adapter process has already
// started.
//
// It is also the right place to fill in defaults, which is why the
// copybookPaths fallback below lives here rather than in
// debugAdapterFactory: every OTHER CLI entry point in this extension (run,
// lint, export, analyze) resolves copybook paths through
// resolveInvocationConfig, so a hand-authored launch.json that omits
// `copybookPaths` used to be the one path that silently ignored both the
// mockymock.copybookPaths setting and the zapp.yml library locations --
// surfacing as an UNRESOLVED_COPYBOOK refusal on a workspace that was in
// fact configured correctly, and that the Test Explorer could debug fine.
//
// And it runs the same preflight the Test Explorer's "Debug (Interactive)"
// runs before it starts a session (environment ready, `lint`), plus a check
// that `case` names a real TESTCASE: `mockymock debug --dap-stdio` refuses
// each of those in plain text before ever speaking DAP, which VS Code shows
// only as "debug adapter process has terminated unexpectedly". A session the
// Test Explorer started (PREFLIGHTED set) has been through all of it already.
export const PREFLIGHTED = 'mockymockPreflighted';

export class MockymockDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly environmentManager: EnvironmentManager
  ) {}

  resolveDebugConfiguration(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration
  ): vscode.ProviderResult<vscode.DebugConfiguration> {
    const missing = ['program', 'cut', 'case'].filter((key) => !config[key]);
    if (missing.length > 0) {
      vscode.window.showErrorMessage(
        `mockymock-cobol launch configuration is missing required field(s): ${missing.join(', ')}`
      );
      return undefined;
    }
    return config;
  }

  // Runs after VS Code has substituted ${workspaceFolder} and friends, so a
  // path that is still relative here really is relative -- see
  // absolutizeDebugPaths for why the adapter needs it absolute. The
  // copybookPaths default is filled here too, not in resolveDebugConfiguration:
  // only now is `program` a real path to scope the settings lookup to.
  async resolveDebugConfigurationWithSubstitutedVariables(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration
  ): Promise<vscode.DebugConfiguration | undefined> {
    if (typeof config.program !== 'string' || typeof config.cut !== 'string') {
      return config;
    }
    const resolved = this.withDefaults(folder, config);
    if (config[PREFLIGHTED]) return resolved;
    const problem = await this.preflight(folder, resolved);
    // null: ensureReady() already showed its own prompt for the problem.
    if (problem === null) return undefined;
    if (problem) {
      vscode.window.showErrorMessage(problem);
      // undefined (not null) aborts the launch without opening launch.json.
      return undefined;
    }
    return resolved;
  }

  // The checks `mockymock debug` would otherwise fail opaquely on; the
  // message to show for the first that fails (null when ensureReady() has
  // shown it already), else undefined.
  private async preflight(
    folder: vscode.WorkspaceFolder | undefined,
    config: vscode.DebugConfiguration
  ): Promise<string | null | undefined> {
    const ready = await this.environmentManager.ensureReady();
    if (!ready.ok) return ready.reported ? null : ready.message;
    const cutPath = config.cut as string;
    const run = runCommandIn(path.dirname(cutPath));
    // The same binary debugAdapterFactory will launch.
    const configuredPath =
      resolveExecutablePathSetting(config.executablePath as string | undefined, settingPathContext(folder)) ??
      configuredExecutablePath(folder);
    const executablePath = anchorCommandPath(
      resolveExecutablePath(configuredPath, this.context.extensionPath),
      process.cwd()
    );
    const caseGate = evaluateCaseSelection(
      await run(executablePath, ['collect', '--cut', cutPath, '--json']),
      String(config.case),
      cutPath
    );
    if (caseGate.blocked) return caseGate.message;
    const lintGate = evaluateLintResult(
      await run(
        executablePath,
        buildLintArgs({
          program: config.program as string,
          cut: cutPath,
          copybookPaths: config.copybookPaths as string[] | undefined,
        })
      )
    );
    return lintGate.blocked ? lintGate.message : undefined;
  }

  private withDefaults(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration): vscode.DebugConfiguration {
    const resolved = absolutizeDebugPaths(
      { ...config, program: config.program, cut: config.cut, copybookPaths: config.copybookPaths as string[] | undefined },
      folder?.uri.fsPath
    );

    if (resolved.copybookPaths === undefined) {
      // Scope the settings lookup to the program being debugged so a
      // multi-root workspace picks up that folder's own .vscode/settings.json
      // (mockymock.copybookPaths is resource-scoped). Fall back to the
      // launching folder when `program` is still relative.
      const scopeUri = path.isAbsolute(resolved.program) ? vscode.Uri.file(resolved.program) : folder?.uri;
      if (scopeUri) {
        const { copybookPaths } = resolveInvocationConfig(this.context, scopeUri);
        if (copybookPaths.length > 0) {
          return { ...resolved, copybookPaths };
        }
      }
    }
    return resolved;
  }
}
