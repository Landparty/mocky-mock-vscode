import * as vscode from 'vscode';

// This debug type is normally launched programmatically (see the "Debug
// (Interactive)" test profile in testController.ts, which builds a complete
// configuration from the selected test item), not hand-authored in
// launch.json. resolveDebugConfiguration is still required by the
// DebugConfigurationProvider contract and is the right place to refuse
// clearly if a caller (a hand-written launch.json entry, most likely) is
// missing the fields mockymock debug needs, rather than letting the CLI fail
// with a confusing argparse error after the adapter process has already
// started.
export class MockymockDebugConfigurationProvider implements vscode.DebugConfigurationProvider {
  resolveDebugConfiguration(
    _folder: vscode.WorkspaceFolder | undefined,
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
}
