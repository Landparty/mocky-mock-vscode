// Plain, vscode-independent shape and argv builder for a mockymock debug
// session -- deliberately does NOT extend vscode.DebugConfiguration (unlike
// most of this extension's vscode-adjacent types) so this module can be
// unit-tested under mocha, which cannot resolve the 'vscode' module outside
// a running Extension Host. debugAdapterFactory.ts casts vscode.DebugSession's
// `configuration` (typed as vscode.DebugConfiguration, which carries a
// `[key: string]: any` index signature) to this interface at its one call site.
export interface MockymockDebugConfiguration {
  program: string;
  cut: string;
  case: string;
  executablePath?: string;
  copybookPaths?: string[];
}

// Mirrors mockymockRunner.ts's buildRunArgs: a plain function building the
// argv mockymock debug --dap-stdio needs, kept separate from the
// vscode.DebugAdapterDescriptorFactory that actually spawns it.
export function buildDebugArgs(config: MockymockDebugConfiguration): string[] {
  const args = ['debug', config.program, '--cut', config.cut, '--case', config.case, '--dap-stdio'];
  for (const p of config.copybookPaths ?? []) {
    args.push('--copybook-path', p);
  }
  return args;
}
