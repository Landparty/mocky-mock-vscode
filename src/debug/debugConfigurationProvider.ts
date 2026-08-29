import * as vscode from 'vscode';
import { resolveInvocationConfig } from '../environment/invocationConfig';

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
export class MockymockDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  constructor(private readonly context: vscode.ExtensionContext) {}

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

    if (config.copybookPaths === undefined) {
      // Scope the settings lookup to the program being debugged so a
      // multi-root workspace picks up that folder's own .vscode/settings.json
      // (mockymock.copybookPaths is resource-scoped). Fall back to the
      // launching folder when `program` isn't a usable path.
      const scopeUri =
        typeof config.program === 'string' && config.program.length > 0
          ? vscode.Uri.file(config.program)
          : folder?.uri;
      if (scopeUri) {
        const { copybookPaths } = resolveInvocationConfig(this.context, scopeUri);
        if (copybookPaths.length > 0) {
          return { ...config, copybookPaths };
        }
      }
    }

    return config;
  }
}
